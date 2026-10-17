import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '.prisma/tenant-client';
import { PLAN_IDS, type StripePrices } from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { parseWebhookUrl } from '../webhooks/destination';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';
import { OrgSecretsService } from './org-secrets.service';

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

// The stored JSON is whatever an earlier PUT wrote; only known plans with string ids count.
export function toStripePrices(raw: Prisma.JsonValue | null): StripePrices {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    PLAN_IDS.map((plan) => {
      const value = source[plan];
      return [plan, typeof value === 'string' && value ? value : null];
    }),
  ) as StripePrices;
}

@Injectable()
export class OrganisationsService {
  private readonly logger = new Logger(OrganisationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: OrgSecretsService,
  ) {}

  async get(organisationId: string): Promise<OrganisationResponse> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: publicFields,
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    return this.toResponse(organisation);
  }

  async update(
    organisationId: string,
    dto: UpdateOrganisationDto,
  ): Promise<UpdatedOrganisation> {
    const current = await this.get(organisationId);
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
      const merged = { ...current.stripePrices };
      for (const plan of PLAN_IDS) {
        const value = dto.stripePrices[plan];
        if (value !== undefined) {
          merged[plan] = value;
        }
      }
      data.stripePrices = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== null),
      );
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
    const prices = toStripePrices(organisation.stripePrices);
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
      maxActiveTenants,
      maxProvisionsPerDay,
      ...rest
    } = row;
    return {
      ...rest,
      webhookConfigured: webhookSecret !== null,
      stripeConfigured: stripeSecretKeyEncrypted !== null,
      stripePrices: toStripePrices(stripePrices),
      limits: { maxActiveTenants, maxProvisionsPerDay },
    };
  }
}
