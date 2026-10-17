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
exports.INTERNAL_TOKEN_HEADER = exports.PLAN_IDS = exports.WEBHOOK_DELIVERY_HEADER = exports.WEBHOOK_EVENT_HEADER = exports.WEBHOOK_SIGNATURE_HEADER = exports.IDEMPOTENT_REPLAYED_HEADER = exports.IDEMPOTENCY_KEY_MAX_LENGTH = exports.IDEMPOTENCY_KEY_HEADER = exports.API_KEY_PREFIX = exports.API_KEY_HEADER = exports.CreateApiKeyDto = exports.UpdateOrganisationDto = exports.StripePricesDto = exports.STRIPE_PRICE_ID_PATTERN = exports.STRIPE_SECRET_KEY_MAX_LENGTH = exports.STRIPE_SECRET_KEY_PATTERN = exports.ConfirmEmailChangeDto = exports.UpdateSettingsDto = exports.ResetPasswordDto = exports.ForgotPasswordDto = exports.VerifyEmailDto = exports.RefreshTokenDto = exports.LoginDto = exports.RegisterDto = exports.HANDLE_PATTERN = exports.CancelTenantDto = exports.CreateTenantDto = void 0;
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
    (0, swagger_1.ApiProperty)({ example: 'starter', description: 'Plan name or ID.' }),
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
class StripePricesDto {
}
exports.StripePricesDto = StripePricesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'price_1Q…', nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.starter !== null),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(exports.STRIPE_PRICE_ID_PATTERN, {
        message: 'starter must be a Stripe Price ID (price_…)',
    }),
    __metadata("design:type", String)
], StripePricesDto.prototype, "starter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'price_1Q…', nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.pro !== null),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(exports.STRIPE_PRICE_ID_PATTERN, {
        message: 'pro must be a Stripe Price ID (price_…)',
    }),
    __metadata("design:type", String)
], StripePricesDto.prototype, "pro", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'price_1Q…', nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.enterprise !== null),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(exports.STRIPE_PRICE_ID_PATTERN, {
        message: 'enterprise must be a Stripe Price ID (price_…)',
    }),
    __metadata("design:type", String)
], StripePricesDto.prototype, "enterprise", void 0);
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
        type: () => StripePricesDto,
        nullable: true,
        description: 'Stripe Price IDs per customer plan, used when the billing step subscribes a new tenant. A plan without a price fails the billing step for tenants on it. null clears the map.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.stripePrices !== null),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StripePricesDto),
    __metadata("design:type", StripePricesDto)
], UpdateOrganisationDto.prototype, "stripePrices", void 0);
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
exports.PLAN_IDS = ['starter', 'pro', 'enterprise'];
exports.INTERNAL_TOKEN_HEADER = 'x-internal-token';
//# sourceMappingURL=index.js.map