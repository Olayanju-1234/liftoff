import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { parseWebhookUrl } from '../webhooks/destination';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';

export interface OrganisationResponse {
  id: string;
  name: string;
  handle: string;
  webhookUrl: string | null;
  // True once a secret exists; the secret itself is only in the response that made it.
  webhookConfigured: boolean;
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

  constructor(private readonly prisma: PrismaService) {}

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

    const updated = await this.prisma.organisation.update({
      where: { id: organisationId },
      data,
      select: publicFields,
    });
    this.logger.log(
      `Updated organisation ${organisationId}: ${JSON.stringify({
        name: dto.name !== undefined,
        webhookUrl: dto.webhookUrl !== undefined,
        secretIssued: secret !== undefined,
      })}`,
    );
    return { ...this.toResponse(updated), webhookSecret: secret };
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
    const { webhookSecret, ...rest } = row;
    return { ...rest, webhookConfigured: webhookSecret !== null };
  }
}
