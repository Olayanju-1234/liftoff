"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_TOKEN_PATTERN = exports.PLAN_IDS = exports.FailStepDto = exports.CompleteStepDto = exports.IsSmallJsonObject = exports.CUSTOM_STEP_OUTPUT_MAX_BYTES = exports.CUSTOM_STEP_EVENT = exports.CUSTOM_STEP_ACTIONS = exports.LOG_REDACT_PATHS = exports.WEBHOOK_DELIVERY_HEADER = exports.WEBHOOK_EVENT_HEADER = exports.WEBHOOK_SIGNATURE_HEADER = exports.IDEMPOTENT_REPLAYED_HEADER = exports.IDEMPOTENCY_KEY_MAX_LENGTH = exports.IDEMPOTENCY_KEY_HEADER = exports.API_KEY_PREFIX = exports.API_KEY_HEADER = exports.CreateApiKeyDto = exports.UpdateOrganisationDto = exports.StepConfigDto = exports.StepConfigEntryDto = exports.CUSTOM_STEP_URL_MAX_LENGTH = exports.CUSTOM_STEP_MAX_TIMEOUT_MS = exports.CUSTOM_STEP_MIN_TIMEOUT_MS = exports.CUSTOM_STEP_DEFAULT_TIMEOUT_MS = exports.STEP_MODES = exports.PROVISIONING_STEP_NAMES = exports.IsStripePriceMap = exports.UniqueCustomerPlanIds = exports.CustomerPlanDto = exports.DEFAULT_CUSTOMER_PLANS = exports.MAX_CUSTOMER_PLANS = exports.CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH = exports.CUSTOMER_PLAN_NAME_MAX_LENGTH = exports.CUSTOMER_PLAN_ID_MAX_LENGTH = exports.CUSTOMER_PLAN_ID_PATTERN = exports.STRIPE_PRICE_ID_PATTERN = exports.STRIPE_SECRET_KEY_MAX_LENGTH = exports.STRIPE_SECRET_KEY_PATTERN = exports.ConfirmEmailChangeDto = exports.UpdateSettingsDto = exports.ResetPasswordDto = exports.ForgotPasswordDto = exports.VerifyEmailDto = exports.RefreshTokenDto = exports.LoginDto = exports.RegisterDto = exports.HANDLE_PATTERN = exports.CancelTenantDto = exports.CreateTenantDto = void 0;
exports.INTERNAL_TOKEN_HEADER = exports.DEPROVISION_PARTS = exports.isLiveTenant = exports.LIVE_TENANT_STATUSES = exports.StartDemoDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreateTenantDto {
}
exports.CreateTenantDto = CreateTenantDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Acme Corp', maxLength: 100 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateTenantDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'acme',
        description: 'Alphabetic only, used as the tenant subdomain.',
        maxLength: 30,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsAlpha)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], CreateTenantDto.prototype, "subdomain", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'starter',
        description: "One of your customer plans, by id (or name): starter, pro or enterprise unless you defined your own under Settings → Billing (PUT /organisation { plans }). It is the customer's plan on your product, not Liftoff's pricing.",
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTenantDto.prototype, "planId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Test mode: provisions like a real tenant, but the billing step is SKIPPED, it never counts towards your quotas, and it can be deleted at any time.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateTenantDto.prototype, "test", void 0);
class CancelTenantDto {
}
exports.CancelTenantDto = CancelTenantDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Customer changed plan',
        maxLength: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CancelTenantDto.prototype, "reason", void 0);
exports.HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
class RegisterDto {
}
exports.RegisterDto = RegisterDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin@acme.com' }),
    (0, class_validator_1.IsEmail)({}, { message: 'Invalid email format' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Email is required' }),
    __metadata("design:type", String)
], RegisterDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 8, maxLength: 100, example: 'CorrectHorse9!' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Password is required' }),
    (0, class_validator_1.MinLength)(8, { message: 'Password must be at least 8 characters' }),
    (0, class_validator_1.MaxLength)(100, { message: 'Password too long' }),
    __metadata("design:type", String)
], RegisterDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Jane Doe', maxLength: 100 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], RegisterDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Acme Corp',
        maxLength: 100,
        description: 'The company signing up. Its customers become tenants.',
    }),
    (0, class_validator_1.ValidateIf)((dto) => dto.tenantName === undefined),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Company name is required' }),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], RegisterDto.prototype, "companyName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'acme',
        minLength: 3,
        maxLength: 50,
        description: 'Unique, URL-safe name for the company. Case-insensitive.',
    }),
    (0, class_validator_1.ValidateIf)((dto) => dto.subdomain === undefined),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Handle is required' }),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(50),
    (0, class_validator_1.Matches)(exports.HANDLE_PATTERN, {
        message: 'Handle may only contain letters, digits and hyphens',
    }),
    __metadata("design:type", String)
], RegisterDto.prototype, "handle", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ deprecated: true, description: 'Use companyName.' }),
    (0, class_validator_1.ValidateIf)((dto) => dto.companyName === undefined),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Company name is required' }),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], RegisterDto.prototype, "tenantName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ deprecated: true, description: 'Use handle.' }),
    (0, class_validator_1.ValidateIf)((dto) => dto.handle === undefined),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Handle is required' }),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(50),
    (0, class_validator_1.Matches)(exports.HANDLE_PATTERN, {
        message: 'Handle may only contain letters, digits and hyphens',
    }),
    __metadata("design:type", String)
], RegisterDto.prototype, "subdomain", void 0);
class LoginDto {
}
exports.LoginDto = LoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin@acme.com' }),
    (0, class_validator_1.IsEmail)({}, { message: 'Invalid email format' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Email is required' }),
    __metadata("design:type", String)
], LoginDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'CorrectHorse9!' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Password is required' }),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
class RefreshTokenDto {
}
exports.RefreshTokenDto = RefreshTokenDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Refresh token returned at login' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Refresh token is required' }),
    __metadata("design:type", String)
], RefreshTokenDto.prototype, "refreshToken", void 0);
class VerifyEmailDto {
}
exports.VerifyEmailDto = VerifyEmailDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Token from the verification link' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], VerifyEmailDto.prototype, "token", void 0);
class ForgotPasswordDto {
}
exports.ForgotPasswordDto = ForgotPasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin@acme.com' }),
    (0, class_validator_1.IsEmail)({}, { message: 'Invalid email format' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Email is required' }),
    __metadata("design:type", String)
], ForgotPasswordDto.prototype, "email", void 0);
class ResetPasswordDto {
}
exports.ResetPasswordDto = ResetPasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Token from the reset link' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "token", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 8, maxLength: 100, example: 'CorrectHorse9!' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Password is required' }),
    (0, class_validator_1.MinLength)(8, { message: 'Password must be at least 8 characters' }),
    (0, class_validator_1.MaxLength)(100, { message: 'Password too long' }),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "password", void 0);
class UpdateSettingsDto {
}
exports.UpdateSettingsDto = UpdateSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'A new email stays pending until the link sent to it is confirmed.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSettingsDto.prototype, "emailNotifications", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSettingsDto.prototype, "failedJobAlerts", void 0);
class ConfirmEmailChangeDto {
}
exports.ConfirmEmailChangeDto = ConfirmEmailChangeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Token from the confirmation link' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ConfirmEmailChangeDto.prototype, "token", void 0);
exports.STRIPE_SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;
exports.STRIPE_SECRET_KEY_MAX_LENGTH = 200;
exports.STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
exports.CUSTOMER_PLAN_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
exports.CUSTOMER_PLAN_ID_MAX_LENGTH = 40;
exports.CUSTOMER_PLAN_NAME_MAX_LENGTH = 60;
exports.CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH = 120;
exports.MAX_CUSTOMER_PLANS = 12;
exports.DEFAULT_CUSTOMER_PLANS = [
    { id: 'starter', name: 'Starter', description: 'For small teams' },
    { id: 'pro', name: 'Pro', description: 'For growing teams' },
    {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'For large organisations',
    },
];
class CustomerPlanDto {
}
exports.CustomerPlanDto = CustomerPlanDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'growth',
        maxLength: exports.CUSTOMER_PLAN_ID_MAX_LENGTH,
        description: 'What POST /tenants sends as planId. Lowercase letters and digits, single hyphens or underscores. Keep it stable once customers are on it.',
    }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(exports.CUSTOMER_PLAN_ID_MAX_LENGTH),
    (0, class_validator_1.Matches)(exports.CUSTOMER_PLAN_ID_PATTERN, {
        message: 'a plan id is lowercase letters and digits, with single hyphens or underscores',
    }),
    __metadata("design:type", String)
], CustomerPlanDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Growth', maxLength: exports.CUSTOMER_PLAN_NAME_MAX_LENGTH }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(exports.CUSTOMER_PLAN_NAME_MAX_LENGTH),
    __metadata("design:type", String)
], CustomerPlanDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'For teams of 10 to 50',
        maxLength: exports.CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(exports.CUSTOMER_PLAN_DESCRIPTION_MAX_LENGTH),
    __metadata("design:type", String)
], CustomerPlanDto.prototype, "description", void 0);
let UniqueCustomerPlanIds = class UniqueCustomerPlanIds {
    validate(plans) {
        if (!Array.isArray(plans)) {
            return true;
        }
        const ids = plans
            .map((plan) => plan && typeof plan === 'object'
            ? plan.id
            : undefined)
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim().toLowerCase());
        return new Set(ids).size === ids.length;
    }
    defaultMessage() {
        return 'plan ids must be unique';
    }
};
exports.UniqueCustomerPlanIds = UniqueCustomerPlanIds;
exports.UniqueCustomerPlanIds = UniqueCustomerPlanIds = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'uniqueCustomerPlanIds', async: false })
], UniqueCustomerPlanIds);
let IsStripePriceMap = class IsStripePriceMap {
    validate(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        return Object.entries(value).every(([plan, price]) => exports.CUSTOMER_PLAN_ID_PATTERN.test(plan) &&
            plan.length <= exports.CUSTOMER_PLAN_ID_MAX_LENGTH &&
            (price === null ||
                (typeof price === 'string' && exports.STRIPE_PRICE_ID_PATTERN.test(price))));
    }
    defaultMessage() {
        return 'stripePrices maps plan ids to Stripe Price IDs (price_…) or null';
    }
};
exports.IsStripePriceMap = IsStripePriceMap;
exports.IsStripePriceMap = IsStripePriceMap = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'stripePriceMap', async: false })
], IsStripePriceMap);
exports.PROVISIONING_STEP_NAMES = [
    'database',
    'address',
    'credentials',
    'billing',
    'welcome',
];
exports.STEP_MODES = ['builtin', 'skipped', 'custom'];
exports.CUSTOM_STEP_DEFAULT_TIMEOUT_MS = 10 * 60_000;
exports.CUSTOM_STEP_MIN_TIMEOUT_MS = 60_000;
exports.CUSTOM_STEP_MAX_TIMEOUT_MS = 24 * 60 * 60_000;
exports.CUSTOM_STEP_URL_MAX_LENGTH = 2000;
class StepConfigEntryDto {
}
exports.StepConfigEntryDto = StepConfigEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: exports.STEP_MODES,
        example: 'custom',
        description: 'builtin: Liftoff runs the step. skipped: the step is marked SKIPPED and the next one starts. custom: Liftoff POSTs step.requested to url and waits for your callback.',
    }),
    (0, class_validator_1.IsIn)(exports.STEP_MODES),
    __metadata("design:type", String)
], StepConfigEntryDto.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'https://api.acme.com/liftoff/steps',
        maxLength: exports.CUSTOM_STEP_URL_MAX_LENGTH,
        description: 'Your endpoint for this step: step.requested (and step.teardown when the customer is removed) are POSTed here. Required for custom; must be a public http(s) URL.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({
        protocols: ['http', 'https'],
        require_protocol: true,
        require_tld: false,
    }),
    (0, class_validator_1.MaxLength)(exports.CUSTOM_STEP_URL_MAX_LENGTH),
    __metadata("design:type", String)
], StepConfigEntryDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        minimum: exports.CUSTOM_STEP_MIN_TIMEOUT_MS,
        maximum: exports.CUSTOM_STEP_MAX_TIMEOUT_MS,
        default: exports.CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
        description: 'How long Liftoff waits for your callback before the step fails, in milliseconds: 1 minute to 24 hours, 10 minutes by default.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(exports.CUSTOM_STEP_MIN_TIMEOUT_MS),
    (0, class_validator_1.Max)(exports.CUSTOM_STEP_MAX_TIMEOUT_MS),
    __metadata("design:type", Number)
], StepConfigEntryDto.prototype, "timeoutMs", void 0);
class StepConfigDto {
}
exports.StepConfigDto = StepConfigDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => StepConfigEntryDto, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StepConfigEntryDto),
    __metadata("design:type", StepConfigEntryDto)
], StepConfigDto.prototype, "database", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => StepConfigEntryDto, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StepConfigEntryDto),
    __metadata("design:type", StepConfigEntryDto)
], StepConfigDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => StepConfigEntryDto, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StepConfigEntryDto),
    __metadata("design:type", StepConfigEntryDto)
], StepConfigDto.prototype, "credentials", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => StepConfigEntryDto, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StepConfigEntryDto),
    __metadata("design:type", StepConfigEntryDto)
], StepConfigDto.prototype, "billing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => StepConfigEntryDto, nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StepConfigEntryDto),
    __metadata("design:type", StepConfigEntryDto)
], StepConfigDto.prototype, "welcome", void 0);
class UpdateOrganisationDto {
}
exports.UpdateOrganisationDto = UpdateOrganisationDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Acme Corp', maxLength: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], UpdateOrganisationDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'https://api.acme.com/liftoff/webhook',
        nullable: true,
        description: 'Where tenant.active and tenant.failed are POSTed. Setting a new URL issues a new signing secret, returned once. null turns deliveries off.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.webhookUrl !== null),
    (0, class_validator_1.IsUrl)({
        protocols: ['http', 'https'],
        require_protocol: true,
        require_tld: false,
    }),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], UpdateOrganisationDto.prototype, "webhookUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Issue a new signing secret for the current URL. Returned once; the old one stops working.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateOrganisationDto.prototype, "rotateWebhookSecret", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'acme.app',
        nullable: true,
        maxLength: 253,
        description: "The company's own domain for tenant addresses: a tenant's address becomes <subdomain>.<baseDomain>. null clears it and addresses fall back to the platform domain. Display only until DNS is real.",
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.baseDomain !== null),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value),
    (0, class_validator_1.IsFQDN)({ require_tld: true }),
    (0, class_validator_1.MaxLength)(253),
    __metadata("design:type", String)
], UpdateOrganisationDto.prototype, "baseDomain", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'sk_test_51…',
        nullable: true,
        description: "The company's own Stripe secret (or restricted) key. Stored encrypted and never returned: the response says stripeConfigured: true. null disconnects Stripe, after which the billing step is SKIPPED.",
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.stripeSecretKey !== null),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(exports.STRIPE_SECRET_KEY_PATTERN, {
        message: 'stripeSecretKey must be a Stripe secret key (sk_… or rk_…)',
    }),
    (0, class_validator_1.MaxLength)(exports.STRIPE_SECRET_KEY_MAX_LENGTH),
    __metadata("design:type", String)
], UpdateOrganisationDto.prototype, "stripeSecretKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: 'object',
        additionalProperties: { type: 'string', nullable: true },
        nullable: true,
        example: { starter: 'price_1Q…', pro: null },
        description: 'Stripe Price ID per customer plan id, used when the billing step subscribes a new tenant; merged into the stored map, null for a plan clears its price. A plan without a price fails the billing step for tenants on it. null clears the whole map.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.stripePrices !== null),
    (0, class_validator_1.Validate)(IsStripePriceMap),
    __metadata("design:type", Object)
], UpdateOrganisationDto.prototype, "stripePrices", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: () => [CustomerPlanDto],
        nullable: true,
        description: "The company's own customer plans (1 to 12), replacing the defaults starter / pro / enterprise; POST /tenants then only accepts these ids. Tenants already on a removed plan keep it. null goes back to the defaults.",
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.plans !== null),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(exports.MAX_CUSTOMER_PLANS),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CustomerPlanDto),
    (0, class_validator_1.Validate)(UniqueCustomerPlanIds),
    __metadata("design:type", Array)
], UpdateOrganisationDto.prototype, "plans", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: () => StepConfigDto,
        nullable: true,
        description: 'How each provisioning step runs: builtin (Liftoff does it), skipped (marked SKIPPED, the next step starts) or custom (Liftoff POSTs step.requested to your URL, signed with your webhook secret, and waits for your callback). Merged per step: a step you leave out keeps its setting, null puts it back to builtin. null for the whole object puts every step back to builtin. Custom steps need a webhook URL first, because they are signed with its secret.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.stepConfig !== null),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StepConfigDto),
    __metadata("design:type", StepConfigDto)
], UpdateOrganisationDto.prototype, "stepConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'true hides the finished onboarding checklist on the dashboard for good (onboardingDismissedAt is set once and kept).',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateOrganisationDto.prototype, "dismissOnboarding", void 0);
class CreateApiKeyDto {
}
exports.CreateApiKeyDto = CreateApiKeyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Billing integration', maxLength: 100 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateApiKeyDto.prototype, "name", void 0);
exports.API_KEY_HEADER = 'x-api-key';
exports.API_KEY_PREFIX = 'lk_';
exports.IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
exports.IDEMPOTENCY_KEY_MAX_LENGTH = 255;
exports.IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';
exports.WEBHOOK_SIGNATURE_HEADER = 'x-liftoff-signature';
exports.WEBHOOK_EVENT_HEADER = 'x-liftoff-event';
exports.WEBHOOK_DELIVERY_HEADER = 'x-liftoff-delivery';
exports.LOG_REDACT_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["x-internal-token"]',
    'res.headers["set-cookie"]',
];
exports.CUSTOM_STEP_ACTIONS = ['provision', 'teardown'];
exports.CUSTOM_STEP_EVENT = {
    provision: 'step.requested',
    teardown: 'step.teardown',
};
exports.CUSTOM_STEP_OUTPUT_MAX_BYTES = 4096;
let IsSmallJsonObject = class IsSmallJsonObject {
    validate(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        return (Buffer.byteLength(JSON.stringify(value), 'utf8') <=
            exports.CUSTOM_STEP_OUTPUT_MAX_BYTES);
    }
    defaultMessage() {
        return `output must be a JSON object of at most ${exports.CUSTOM_STEP_OUTPUT_MAX_BYTES} bytes`;
    }
};
exports.IsSmallJsonObject = IsSmallJsonObject;
exports.IsSmallJsonObject = IsSmallJsonObject = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'smallJsonObject', async: false })
], IsSmallJsonObject);
class CompleteStepDto {
}
exports.CompleteStepDto = CompleteStepDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'cm2abc…',
        description: 'The requestId from the request. When sent, a callback for an older request is refused with 409.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CompleteStepDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: 'object',
        additionalProperties: true,
        example: { region: 'eu-west-1', databaseId: 'db_123' },
        description: `What your system did, for your support team: stored with the step and shown in the event log. A JSON object of at most ${exports.CUSTOM_STEP_OUTPUT_MAX_BYTES} bytes. Never put secrets here.`,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Validate)(IsSmallJsonObject),
    __metadata("design:type", Object)
], CompleteStepDto.prototype, "output", void 0);
class FailStepDto {
}
exports.FailStepDto = FailStepDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'cm2abc…',
        description: 'The requestId from the request. When sent, a callback for an older request is refused with 409.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], FailStepDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'No capacity left in eu-west-1',
        maxLength: 500,
        description: 'Why it failed, in words your support team can act on. Shown on the customer and in the failure email.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], FailStepDto.prototype, "error", void 0);
exports.PLAN_IDS = ['starter', 'pro', 'enterprise'];
exports.STATUS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
class StartDemoDto {
}
exports.StartDemoDto = StartDemoDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: exports.PROVISIONING_STEP_NAMES,
        description: 'Make this step fail once, so the run shows a dead letter, the customer FAILED, and a Retry that succeeds',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.PROVISIONING_STEP_NAMES),
    __metadata("design:type", String)
], StartDemoDto.prototype, "failStep", void 0);
exports.LIVE_TENANT_STATUSES = ['PROVISIONING', 'FAILED', 'ACTIVE'];
const isLiveTenant = (status) => exports.LIVE_TENANT_STATUSES.includes(status);
exports.isLiveTenant = isLiveTenant;
exports.DEPROVISION_PARTS = ['db', 'credentials', 'billing'];
exports.INTERNAL_TOKEN_HEADER = 'x-internal-token';
//# sourceMappingURL=index.js.map