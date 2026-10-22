import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsAlpha,
  IsArray,
  IsBoolean,
  IsEmail,
  IsFQDN,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

// ============================================================================
// Tenant DTOs
// ============================================================================

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'acme',
    description: 'Alphabetic only, used as the tenant subdomain.',
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty()
  @IsAlpha()
  @MaxLength(30)
  subdomain: string;

  @ApiProperty({
    example: 'starter',
    description:
      "One of your customer plans, by id (or name): starter, pro or enterprise unless you defined your own under Settings → Billing (PUT /organisation { plans }). It is the customer's plan on your product, not Liftoff's pricing.",
  })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({
    description:
      'Test mode: provisions like a real tenant, but the billing step is SKIPPED, it never counts towards your quotas, and it can be deleted at any time.',
  })
  @IsOptional()
  @IsBoolean()
  test?: boolean;
}

export class CancelTenantDto {
  @ApiPropertyOptional({
    example: 'Customer changed plan',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ============================================================================
// Auth DTOs
// ============================================================================

// Letters, digits and single hyphens, like a GitHub handle. Stored lowercase.
export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export class RegisterDto {
  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 100, example: 'CorrectHorse9!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password too long' })
  password: string;

  @ApiPropertyOptional({ example: 'Jane Doe', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    example: 'Acme Corp',
    maxLength: 100,
    description: 'The company signing up. Its customers become tenants.',
  })
  @ValidateIf((dto: RegisterDto) => dto.tenantName === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MaxLength(100)
  companyName?: string;

  @ApiProperty({
    example: 'acme',
    minLength: 3,
    maxLength: 50,
    description: 'Unique, URL-safe name for the company. Case-insensitive.',
  })
  @ValidateIf((dto: RegisterDto) => dto.subdomain === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Handle is required' })
  @MinLength(3)
  @MaxLength(50)
  @Matches(HANDLE_PATTERN, {
    message: 'Handle may only contain letters, digits and hyphens',
  })
  handle?: string;

  // Older clients send these; they mean the same as companyName and handle.
  @ApiPropertyOptional({ deprecated: true, description: 'Use companyName.' })
  @ValidateIf((dto: RegisterDto) => dto.companyName === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MaxLength(100)
  tenantName?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Use handle.' })
  @ValidateIf((dto: RegisterDto) => dto.handle === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Handle is required' })
  @MinLength(3)
  @MaxLength(50)
  @Matches(HANDLE_PATTERN, {
    message: 'Handle may only contain letters, digits and hyphens',
  })
  subdomain?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'CorrectHorse9!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token returned at login' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token from the verification link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 100, example: 'CorrectHorse9!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password too long' })
  password: string;
}

// ============================================================================
// Settings DTOs
// ============================================================================

export class UpdateSettingsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'A new email stays pending until the link sent to it is confirmed.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  failedJobAlerts?: boolean;
}

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Token from the confirmation link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}

// ============================================================================
// Organisation DTOs
// ============================================================================

// Secret keys are sk_test_/sk_live_, restricted keys rk_test_/rk_live_.
export const STRIPE_SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;
export const STRIPE_SECRET_KEY_MAX_LENGTH = 200;
export const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;

// ----------------------------------------------------------------------------
// Customer plans: what a tenant's planId refers to. The company's own plans on its own
// product, nothing to do with Liftoff's pricing. A company that defines none gets the
// three defaults.
// ----------------------------------------------------------------------------

export const CUSTOMER_PLAN_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const CUSTOMER_PLAN_ID_MAX_LENGTH = 40;
export const CUSTOMER_PLAN_NAME_MAX_LENGTH = 60;
export const CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH = 120;
export const MAX_CUSTOMER_PLANS = 12;

export interface CustomerPlan {
  id: string;
  name: string;
  description?: string;
}

export const DEFAULT_CUSTOMER_PLANS: readonly CustomerPlan[] = [
  { id: 'starter', name: 'Starter', description: 'For small teams' },
  { id: 'pro', name: 'Pro', description: 'For growing teams' },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organisations',
  },
];

export class CustomerPlanDto implements CustomerPlan {
  @ApiProperty({
    example: 'growth',
    maxLength: CUSTOMER_PLAN_ID_MAX_LENGTH,
    description:
      'What POST /tenants sends as planId. Lowercase letters and digits, single hyphens or underscores. Keep it stable once customers are on it.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(CUSTOMER_PLAN_ID_MAX_LENGTH)
  @Matches(CUSTOMER_PLAN_ID_PATTERN, {
    message:
      'a plan id is lowercase letters and digits, with single hyphens or underscores',
  })
  id: string;

  @ApiProperty({ example: 'Growth', maxLength: CUSTOMER_PLAN_NAME_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(CUSTOMER_PLAN_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: 'For teams of 10 to 50',
    maxLength: CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH)
  description?: string;
}

@ValidatorConstraint({ name: 'uniqueCustomerPlanIds', async: false })
export class UniqueCustomerPlanIds implements ValidatorConstraintInterface {
  validate(plans: unknown): boolean {
    if (!Array.isArray(plans)) {
      return true;
    }
    const ids = plans
      .map((plan: unknown) =>
        plan && typeof plan === 'object'
          ? (plan as { id?: unknown }).id
          : undefined,
      )
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim().toLowerCase());
    return new Set(ids).size === ids.length;
  }

  defaultMessage(): string {
    return 'plan ids must be unique';
  }
}

// { <plan id>: "price_…" | null }. null clears that plan's price.
@ValidatorConstraint({ name: 'stripePriceMap', async: false })
export class IsStripePriceMap implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return Object.entries(value as Record<string, unknown>).every(
      ([plan, price]) =>
        CUSTOMER_PLAN_ID_PATTERN.test(plan) &&
        plan.length <= CUSTOMER_PLAN_ID_MAX_LENGTH &&
        (price === null ||
          (typeof price === 'string' && STRIPE_PRICE_ID_PATTERN.test(price))),
    );
  }

  defaultMessage(): string {
    return 'stripePrices maps plan ids to Stripe Price IDs (price_…) or null';
  }
}

// ----------------------------------------------------------------------------
// Provisioning steps: each one is run by Liftoff (builtin), skipped, or handed to the
// company's own system (custom), per organisation.
// ----------------------------------------------------------------------------

// The five steps in saga order, by the names the API and the company's system use.
export const PROVISIONING_STEP_NAMES = [
  'database',
  'address',
  'credentials',
  'billing',
  'welcome',
] as const;
export type ProvisioningStepName = (typeof PROVISIONING_STEP_NAMES)[number];

export const STEP_MODES = ['builtin', 'skipped', 'custom'] as const;
export type StepMode = (typeof STEP_MODES)[number];

export const CUSTOM_STEP_DEFAULT_TIMEOUT_MS = 10 * 60_000;
export const CUSTOM_STEP_MIN_TIMEOUT_MS = 60_000;
export const CUSTOM_STEP_MAX_TIMEOUT_MS = 24 * 60 * 60_000;
export const CUSTOM_STEP_URL_MAX_LENGTH = 2000;

export interface StepConfigEntry {
  mode: StepMode;
  // Where a custom step's requests go. Kept while the step is builtin or skipped, so
  // switching back to custom needs no retyping.
  url?: string;
  timeoutMs?: number;
}

// GET /organisation: every step, with the defaults filled in.
export interface EffectiveStepConfigEntry {
  mode: StepMode;
  url: string | null;
  timeoutMs: number;
}
export type EffectiveStepConfig = Record<
  ProvisioningStepName,
  EffectiveStepConfigEntry
>;

export class StepConfigEntryDto implements StepConfigEntry {
  @ApiProperty({
    enum: STEP_MODES,
    example: 'custom',
    description:
      'builtin: Liftoff runs the step. skipped: the step is marked SKIPPED and the next one starts. custom: Liftoff POSTs step.requested to url and waits for your callback.',
  })
  @IsIn(STEP_MODES)
  mode: StepMode;

  @ApiPropertyOptional({
    example: 'https://api.acme.com/liftoff/steps',
    maxLength: CUSTOM_STEP_URL_MAX_LENGTH,
    description:
      'Your endpoint for this step: step.requested (and step.teardown when the customer is removed) are POSTed here. Required for custom; must be a public http(s) URL.',
  })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(CUSTOM_STEP_URL_MAX_LENGTH)
  url?: string;

  @ApiPropertyOptional({
    minimum: CUSTOM_STEP_MIN_TIMEOUT_MS,
    maximum: CUSTOM_STEP_MAX_TIMEOUT_MS,
    default: CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
    description:
      'How long Liftoff waits for your callback before the step fails, in milliseconds: 1 minute to 24 hours, 10 minutes by default.',
  })
  @IsOptional()
  @IsInt()
  @Min(CUSTOM_STEP_MIN_TIMEOUT_MS)
  @Max(CUSTOM_STEP_MAX_TIMEOUT_MS)
  timeoutMs?: number;
}

// One optional entry per step; null puts that step back to builtin.
export class StepConfigDto implements Partial<
  Record<ProvisioningStepName, StepConfigEntryDto | null>
> {
  @ApiPropertyOptional({ type: () => StepConfigEntryDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => StepConfigEntryDto)
  database?: StepConfigEntryDto | null;

  @ApiPropertyOptional({ type: () => StepConfigEntryDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => StepConfigEntryDto)
  address?: StepConfigEntryDto | null;

  @ApiPropertyOptional({ type: () => StepConfigEntryDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => StepConfigEntryDto)
  credentials?: StepConfigEntryDto | null;

  @ApiPropertyOptional({ type: () => StepConfigEntryDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => StepConfigEntryDto)
  billing?: StepConfigEntryDto | null;

  @ApiPropertyOptional({ type: () => StepConfigEntryDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => StepConfigEntryDto)
  welcome?: StepConfigEntryDto | null;
}

export class UpdateOrganisationDto {
  @ApiPropertyOptional({ example: 'Acme Corp', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'https://api.acme.com/liftoff/webhook',
    nullable: true,
    description:
      'Where tenant.active and tenant.failed are POSTed. Setting a new URL issues a new signing secret, returned once. null turns deliveries off.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.webhookUrl !== null)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2000)
  webhookUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Issue a new signing secret for the current URL. Returned once; the old one stops working.',
  })
  @IsOptional()
  @IsBoolean()
  rotateWebhookSecret?: boolean;

  @ApiPropertyOptional({
    example: 'acme.app',
    nullable: true,
    maxLength: 253,
    description:
      "The company's own domain for tenant addresses: a tenant's address becomes <subdomain>.<baseDomain>. null clears it and addresses fall back to the platform domain. Display only until DNS is real.",
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.baseDomain !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsFQDN({ require_tld: true })
  @MaxLength(253)
  baseDomain?: string | null;

  @ApiPropertyOptional({
    example: 'sk_test_51…',
    nullable: true,
    description:
      "The company's own Stripe secret (or restricted) key. Stored encrypted and never returned: the response says stripeConfigured: true. null disconnects Stripe, after which the billing step is SKIPPED.",
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.stripeSecretKey !== null)
  @IsString()
  @Matches(STRIPE_SECRET_KEY_PATTERN, {
    message: 'stripeSecretKey must be a Stripe secret key (sk_… or rk_…)',
  })
  @MaxLength(STRIPE_SECRET_KEY_MAX_LENGTH)
  stripeSecretKey?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    nullable: true,
    example: { starter: 'price_1Q…', pro: null },
    description:
      'Stripe Price ID per customer plan id, used when the billing step subscribes a new tenant; merged into the stored map, null for a plan clears its price. A plan without a price fails the billing step for tenants on it. null clears the whole map.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.stripePrices !== null)
  @Validate(IsStripePriceMap)
  stripePrices?: StripePrices | null;

  @ApiPropertyOptional({
    type: () => [CustomerPlanDto],
    nullable: true,
    description:
      "The company's own customer plans (1 to 12), replacing the defaults starter / pro / enterprise; POST /tenants then only accepts these ids. Tenants already on a removed plan keep it. null goes back to the defaults.",
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.plans !== null)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CUSTOMER_PLANS)
  @ValidateNested({ each: true })
  @Type(() => CustomerPlanDto)
  @Validate(UniqueCustomerPlanIds)
  plans?: CustomerPlanDto[] | null;

  @ApiPropertyOptional({
    type: () => StepConfigDto,
    nullable: true,
    description:
      'How each provisioning step runs: builtin (Liftoff does it), skipped (marked SKIPPED, the next step starts) or custom (Liftoff POSTs step.requested to your URL, signed with your webhook secret, and waits for your callback). Merged per step: a step you leave out keeps its setting, null puts it back to builtin. null for the whole object puts every step back to builtin. Custom steps need a webhook URL first, because they are signed with its secret.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.stepConfig !== null)
  @ValidateNested()
  @Type(() => StepConfigDto)
  stepConfig?: StepConfigDto | null;

  @ApiPropertyOptional({
    description:
      'true hides the finished onboarding checklist on the dashboard for good (onboardingDismissedAt is set once and kept).',
  })
  @IsOptional()
  @IsBoolean()
  dismissOnboarding?: boolean;
}

// Stripe Price ID (or null) per customer plan id.
export type StripePrices = Record<string, string | null>;

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Billing integration', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

// Header for company API keys. A key is also accepted as `Authorization: Bearer <key>`.
export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_PREFIX = 'lk_';

// ============================================================================
// Idempotency
// ============================================================================

// Sent on POST /tenants. The first response for a key is stored per organisation for
// 24 h and replayed on a repeat; a repeat with a different body gets 422.
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
// Set to "true" on a response that was replayed rather than produced by this request.
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';

// ============================================================================
// Webhooks
// ============================================================================

export const WEBHOOK_SIGNATURE_HEADER = 'x-liftoff-signature';
export const WEBHOOK_EVENT_HEADER = 'x-liftoff-event';
export const WEBHOOK_DELIVERY_HEADER = 'x-liftoff-delivery';

// Headers that carry credentials. Every service's request logger replaces them with
// "[redacted]", so tokens and API keys never reach the logs.
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-internal-token"]',
  'res.headers["set-cookie"]',
];

export type TenantWebhookEvent =
  | 'tenant.active'
  | 'tenant.failed'
  // Every resource is torn down and the tenant reads DELETED.
  | 'tenant.deleted';

export interface TenantWebhookPayload<TTenant = unknown> {
  event: TenantWebhookEvent;
  tenant: TTenant;
}

// ============================================================================
// Custom steps
// ============================================================================

// provision: the step is being run for a new customer. teardown: the customer is being
// removed and what the step made should go too.
export const CUSTOM_STEP_ACTIONS = ['provision', 'teardown'] as const;
export type CustomStepAction = (typeof CUSTOM_STEP_ACTIONS)[number];

export type CustomStepEvent = 'step.requested' | 'step.teardown';

export const CUSTOM_STEP_EVENT: Record<CustomStepAction, CustomStepEvent> = {
  provision: 'step.requested',
  teardown: 'step.teardown',
};

// POSTed to the step's URL, signed like a webhook. The company answers 2xx at once, does
// the work, then POSTs <callbackUrl>/complete or <callbackUrl>/fail with its API key.
export interface CustomStepRequest<TTenant = unknown> {
  event: CustomStepEvent;
  step: ProvisioningStepName;
  // Echo it in the callback to make sure the result is for this request, not an older one.
  requestId: string;
  callbackUrl: string;
  // The step fails if no callback arrives by then.
  deadline: string;
  tenant: TTenant;
}

export const CUSTOM_STEP_OUTPUT_MAX_BYTES = 4096;

// Keeps a callback's output small enough to store with the step and show in the event log.
@ValidatorConstraint({ name: 'smallJsonObject', async: false })
export class IsSmallJsonObject implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return (
      Buffer.byteLength(JSON.stringify(value), 'utf8') <=
      CUSTOM_STEP_OUTPUT_MAX_BYTES
    );
  }

  defaultMessage(): string {
    return `output must be a JSON object of at most ${CUSTOM_STEP_OUTPUT_MAX_BYTES} bytes`;
  }
}

export class CompleteStepDto {
  @ApiPropertyOptional({
    example: 'cm2abc…',
    description:
      'The requestId from the request. When sent, a callback for an older request is refused with 409.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { region: 'eu-west-1', databaseId: 'db_123' },
    description: `What your system did, for your support team: stored with the step and shown in the event log. A JSON object of at most ${CUSTOM_STEP_OUTPUT_MAX_BYTES} bytes. Never put secrets here.`,
  })
  @IsOptional()
  @Validate(IsSmallJsonObject)
  output?: Record<string, unknown>;
}

export class FailStepDto {
  @ApiPropertyOptional({
    example: 'cm2abc…',
    description:
      'The requestId from the request. When sent, a callback for an older request is refused with 409.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @ApiPropertyOptional({
    example: 'No capacity left in eu-west-1',
    maxLength: 500,
    description:
      'Why it failed, in words your support team can act on. Shown on the customer and in the failure email.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}

// recorded: this callback moved the step. duplicate: the same result was already in.
// ignored: the customer was cancelled or removed meanwhile, so nothing changes.
export type StepCallbackOutcome = 'recorded' | 'duplicate' | 'ignored';

export interface StepCallbackResult {
  tenantId: string;
  step: ProvisioningStepName;
  action: CustomStepAction;
  outcome: StepCallbackOutcome;
  // The tenant's status after the callback.
  status: string;
  reason?: string;
}

// ============================================================================
// Plans
// ============================================================================

// The default customer plan ids (see DEFAULT_CUSTOMER_PLANS); the seed keeps Plan rows for them.
export const PLAN_IDS = ['starter', 'pro', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

// ============================================================================
// Public status page
// ============================================================================

// The last path segment of a tenant's statusUrl: 32 bytes, base64url.
export const STATUS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// What GET /status/:token says, for the company's customer: plain words only.
export type PublicTenantState =
  | 'setting-up'
  | 'ready'
  | 'needs-attention'
  | 'stopped'
  | 'removed';
export type PublicStepState =
  | 'waiting'
  | 'in-progress'
  | 'done'
  | 'skipped'
  | 'failed'
  | 'stopped';

export interface PublicTenantStatus {
  // The company doing the onboarding, and the customer being set up.
  company: string;
  name: string;
  state: PublicTenantState;
  // Steps finished (done or skipped) out of the total.
  done: number;
  total: number;
  steps: { name: string; state: PublicStepState }[];
  // The customer's address, once ready; null before that.
  address: string | null;
  updatedAt: string;
}

// ============================================================================
// Tenant status
// ============================================================================

// Statuses in which a worker's step result still counts. ACTIVE is included because
// provisioning.complete can be handled before a step's own result. A tenant that was
// cancelled, is being removed or is removed ignores late messages: no step change, no
// email, no webhook. A worker that was mid-step when the tenant went away still reports in.
export const LIVE_TENANT_STATUSES = ['PROVISIONING', 'FAILED', 'ACTIVE'] as const;
export type LiveTenantStatus = (typeof LIVE_TENANT_STATUSES)[number];
export const isLiveTenant = (status: string): status is LiveTenantStatus =>
  (LIVE_TENANT_STATUSES as readonly string[]).includes(status);

// ============================================================================
// Event Payloads (RabbitMQ)
// ============================================================================

// Carried from tenant.requested through every step so billing knows to skip a test tenant.
export interface TestModeFlag {
  test?: boolean;
}

export interface TenantRequestedPayload extends TestModeFlag {
  tenantId: string;
  subdomain: string;
  planId: string;
  // The Postgres schema to create. Absent on messages from before org-scoped subdomains,
  // when the schema was tenant_<subdomain>.
  schemaName?: string;
}

export interface TenantDbReadyPayload extends TestModeFlag {
  tenantId: string;
  subdomain: string;
  planId: string;
}

export interface TenantDnsReadyPayload extends TestModeFlag {
  tenantId: string;
  subdomain: string;
  planId: string;
}

export interface TenantCredentialsReadyPayload extends TestModeFlag {
  tenantId: string;
  subdomain: string;
  planId: string;
}

// Why billing created no subscription: a test tenant, or a company that has not
// connected its Stripe account.
export type BillingSkipReason = 'test' | 'not-connected';

export interface TenantBillingActivePayload extends TestModeFlag {
  tenantId: string;
  subdomain: string;
  planId: string;
  // Null when billing was skipped.
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  trialEnd: string | null;
  // True when no subscription was created: the billing step is recorded as SKIPPED.
  skipped?: boolean;
  skipReason?: BillingSkipReason;
}

// Why notification-service sent nothing: no email provider configured on it, nobody in
// the company with a verified address and notifications on, or no tenant-service to ask.
export type NotificationSkipReason =
  | 'no-provider'
  | 'no-recipient'
  | 'not-configured';

export interface NotificationOutcome {
  sent: boolean;
  recipients: number;
  skipReason?: NotificationSkipReason;
}

export interface ProvisioningCompletePayload {
  tenantId: string;
  subdomain: string;
  // Absent on messages from before the company was emailed; treated as sent.
  notification?: NotificationOutcome;
}

// ============================================================================
// Deprovisioning (RabbitMQ)
// ============================================================================

// Published by tenant-service as `tenant.deprovision` on DELETE /tenants/:id, or on cancel
// from ACTIVE/FAILED. db-provisioner, credentials and billing each tear their part down
// and answer with `tenant.deprovision.done`. Replays are safe: every teardown is idempotent.
export interface TenantDeprovisionPayload extends TestModeFlag {
  tenantId: string;
  subdomain: string;
  // The schema to drop; null when there is nothing to drop (another live tenant shares it).
  schemaName: string | null;
  // The subscription to cancel in the company's Stripe; null when billing created none.
  stripeSubscriptionId: string | null;
  reason: string;
}

export const DEPROVISION_PARTS = ['db', 'credentials', 'billing'] as const;
export type DeprovisionPart = (typeof DEPROVISION_PARTS)[number];

export interface TenantDeprovisionDonePayload {
  tenantId: string;
  part: DeprovisionPart;
  // True when there was nothing to tear down (no schema, no key, no subscription).
  skipped: boolean;
  detail?: string;
  // Something was left in place that the company should know about, e.g. a subscription
  // that could not be cancelled because Stripe was disconnected. Logged as a Warning.
  warning?: string;
}

// Published by tenant-service on provisioning.direct as `tenant.failed` whenever a step
// is marked FAILED (dead letter or timeout), so notification-service can tell the company.
export interface TenantFailedPayload {
  tenantId: string;
  // The Tenant column that failed, e.g. "billingStatus".
  step: string;
  error: string;
}

// ============================================================================
// Internal API (tenant-service → workers)
// ============================================================================

// Workers fetch per-organisation configuration from tenant-service over HTTP
// instead of carrying secrets through RabbitMQ. Every call sends this header,
// set to INTERNAL_API_TOKEN, which both sides read from their environment.
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

// GET /internal/tenants/:id/billing. The key is decrypted for this response only.
export interface InternalBillingConfig {
  tenantId: string;
  organisationId: string;
  test: boolean;
  // What billing created for this tenant, if anything; cancelled on deprovision.
  stripeSubscriptionId: string | null;
  // False until the company has stored a Stripe key; the billing step is then SKIPPED.
  configured: boolean;
  stripeSecretKey: string | null;
  prices: StripePrices;
}

// GET /internal/tenants/:id/notification: what the "<Customer> is ready" and
// "<Customer> needs attention" emails say, and who in the company gets them. Only users
// with a verified address and the matching preference on are listed.
export interface InternalTenantNotification {
  tenant: {
    id: string;
    name: string;
    subdomain: string;
    address: string;
    planId: string;
    status: string;
    isTest: boolean;
  };
  organisation: { id: string; name: string };
  recipients: { ready: string[]; attention: string[] };
}
