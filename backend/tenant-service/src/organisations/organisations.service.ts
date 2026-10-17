import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '.prisma/tenant-client';
import type { CustomerPlan, StripePrices } from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { parseWebhookUrl } from '../webhooks/destination';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';
import { OrgSecretsService } from './org-secrets.service';
import {
  effectivePlans,
  pricesFor,
  storedPrices,
  toStoredPlans,
} from './customer-plans';

export interface OrganisationResponse {
  id: string;
  name: string;
  handle: string;
  webhookUrl: string | null;
  // True once a secret exists; the secret itself is only in the response that made it.
  webhookConfigured: boolean;
  // Tenant addresses are <subdomain>.<baseDomain>; null means the platform domain is shown.
  baseDomain: string | null;
  // True once a Stripe key is stored. The key itself is never in a response.
  stripeConfigured: boolean;
  // The company's customer plans (the defaults when it defined none) and a price per plan.
  plans: CustomerPlan[];
  stripePrices: StripePrices;
  // Quotas on POST /tenants. Raised by hand for a company that needs more.
  limits: { maxActiveTenants: number; maxProvisionsPerDay: number };
  // When the finished onboarding checklist was dismissed; null while it still shows.
  onboardingDismissedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatedOrganisation extends OrganisationResponse {
  webhookSecret?: string;
}

const publicFields = {
  id: true,
  name: true,
  handle: true,
  webhookUrl: true,
  webhookSecret: true,
  baseDomain: true,
  stripeSecretKeyEncrypted: true,
  stripePrices: true,
  plans: true,
  maxActiveTenants: true,
  maxProvisionsPerDay: true,
  onboardingDismissedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganisationSelect;

type OrganisationRow = Prisma.OrganisationGetPayload<{
  select: typeof publicFields;
}>;

export const newWebhookSecret = () =>
  `whsec_${randomBytes(32).toString('base64url')}`;

@Injectable()
export class OrganisationsService {
  private readonly logger = new Logger(OrganisationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: OrgSecretsService,
  ) {}

  async get(organisationId: string): Promise<OrganisationResponse> {
    return (await this.load(organisationId)).response;
  }

  // The update path needs the stored price map as well as the per-plan view.
  private async load(organisationId: string): Promise<{
    response: OrganisationResponse;
    stored: Record<string, string>;
  }> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: publicFields,
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    return {
      response: this.toResponse(organisation),
      stored: storedPrices(organisation.stripePrices),
    };
  }

  async update(
    organisationId: string,
    dto: UpdateOrganisationDto,
  ): Promise<UpdatedOrganisation> {
    const { response: current, stored } = await this.load(organisationId);
    const data: Prisma.OrganisationUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.baseDomain !== undefined) {
      data.baseDomain = dto.baseDomain;
    }

    let secret: string | undefined;
    if (dto.webhookUrl === null) {
      data.webhookUrl = null;
      data.webhookSecret = null;
    } else if (dto.webhookUrl !== undefined) {
      const webhookUrl = parseWebhookUrl(dto.webhookUrl).toString();
      data.webhookUrl = webhookUrl;
      // A new or changed URL gets a fresh secret: the old host may know the old one.
      if (webhookUrl !== current.webhookUrl || !current.webhookConfigured) {
        secret = newWebhookSecret();
      }
    }
    const willHaveUrl =
      dto.webhookUrl === null
        ? false
        : !!(dto.webhookUrl ?? current.webhookUrl);
    if (dto.rotateWebhookSecret && willHaveUrl) {
      secret = newWebhookSecret();
    }
    if (secret) {
      data.webhookSecret = secret;
    }

    if (dto.stripeSecretKey === null) {
      data.stripeSecretKeyEncrypted = null;
    } else if (dto.stripeSecretKey !== undefined) {
      // 503 here, before anything is written, when ORG_SECRETS_KEY is not set.
      data.stripeSecretKeyEncrypted = this.secrets.encrypt(dto.stripeSecretKey);
    }
    if (dto.stripePrices === null) {
      data.stripePrices = Prisma.DbNull;
    } else if (dto.stripePrices !== undefined) {
      // Merged into what is stored, so a PUT for one plan leaves the others alone.
      const merged = { ...stored };
      for (const [plan, price] of Object.entries(dto.stripePrices)) {
        if (price === null) {
          delete merged[plan];
        } else {
          merged[plan] = price;
        }
      }
      data.stripePrices = merged;
    }

    if (dto.plans === null) {
      data.plans = Prisma.DbNull;
    } else if (dto.plans !== undefined) {
      data.plans = toStoredPlans(dto.plans);
    }

    // Dismissed once; a second click (another browser, another user) keeps the first time.
    if (dto.dismissOnboarding && !current.onboardingDismissedAt) {
      data.onboardingDismissedAt = new Date();
    }

    const updated = await this.prisma.organisation.update({
      where: { id: organisationId },
      data,
      select: publicFields,
    });
    this.logger.log(
      `Updated organisation ${organisationId}: ${JSON.stringify({
        name: dto.name !== undefined,
        baseDomain: dto.baseDomain !== undefined,
        webhookUrl: dto.webhookUrl !== undefined,
        secretIssued: secret !== undefined,
        stripeKey:
          dto.stripeSecretKey === undefined
            ? 'unchanged'
            : dto.stripeSecretKey === null
              ? 'removed'
              : 'stored',
        stripePrices: dto.stripePrices !== undefined,
        plans:
          dto.plans === undefined
            ? 'unchanged'
            : dto.plans === null
              ? 'defaults'
              : dto.plans.length,
        onboardingDismissed: data.onboardingDismissedAt !== undefined,
      })}`,
    );
    return { ...this.toResponse(updated), webhookSecret: secret };
  }

  // For the internal API: the decrypted key and prices billing needs, or configured: false.
  async stripeCredentials(organisationId: string): Promise<{
    configured: boolean;
    stripeSecretKey: string | null;
    prices: StripePrices;
  }> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { stripeSecretKeyEncrypted: true, stripePrices: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    // Every stored price, not just the current plans: a tenant may still be on an old one.
    const prices: StripePrices = storedPrices(organisation.stripePrices);
    if (!organisation.stripeSecretKeyEncrypted) {
      return { configured: false, stripeSecretKey: null, prices };
    }
    return {
      configured: true,
      stripeSecretKey: this.secrets.decrypt(
        organisation.stripeSecretKeyEncrypted,
      ),
      prices,
    };
  }

  // Used by register. Handles are stored lowercase, so this is case-insensitive.
  async assertHandleFree(handle: string): Promise<void> {
    const existing = await this.prisma.organisation.findUnique({
      where: { handle },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Handle already taken');
    }
  }

  private toResponse(row: OrganisationRow): OrganisationResponse {
    const {
      webhookSecret,
      stripeSecretKeyEncrypted,
      stripePrices,
      plans,
      maxActiveTenants,
      maxProvisionsPerDay,
      ...rest
    } = row;
    const effective = effectivePlans(plans);
    const stored = storedPrices(stripePrices);
    return {
      ...rest,
      webhookConfigured: webhookSecret !== null,
      stripeConfigured: stripeSecretKeyEncrypted !== null,
      plans: effective,
      stripePrices: pricesFor(effective, stored),
      limits: { maxActiveTenants, maxProvisionsPerDay },
    };
  }
}
