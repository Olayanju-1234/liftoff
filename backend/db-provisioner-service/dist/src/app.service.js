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
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_rabbitmq_1 = require("@golevelup/nestjs-rabbitmq");
const prisma_service_1 = require("./prisma.service");
let AppService = AppService_1 = class AppService {
    prisma;
    amqpConnection;
    logger = new common_1.Logger(AppService_1.name);
    constructor(prisma, amqpConnection) {
        this.prisma = prisma;
        this.amqpConnection = amqpConnection;
    }
    async handleTenantRequested(payload) {
        this.logger.log({ payload }, `RECEIVED EVENT: Creating schema for ${payload.subdomain}`);
        try {
            const schemaName = `tenant_${payload.subdomain.replace(/[^a-zA-Z0-9]/g, '_')}`;
            await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);
            this.logger.log({ schemaName }, `SUCCESS: Created schema ${schemaName}`);
            await this.amqpConnection.publish('provisioning.direct', 'tenant.db.ready', {
                tenantId: payload.tenantId,
                subdomain: payload.subdomain,
                planId: payload.planId,
            });
        }
        catch (error) {
            this.logger.error({ err: error.message, payload }, 'FAILED to create schema.');
            return new nestjs_rabbitmq_1.Nack(false);
        }
    }
};
exports.AppService = AppService;
__decorate([
    (0, nestjs_rabbitmq_1.RabbitSubscribe)({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.requested',
        queue: 'db-provisioner-queue',
        queueOptions: {
            durable: true,
            deadLetterExchange: 'dlx.provisioning',
            deadLetterRoutingKey: 'db-provisioner.failed',
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppService.prototype, "handleTenantRequested", null);
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        nestjs_rabbitmq_1.AmqpConnection])
], AppService);
//# sourceMappingURL=app.service.js.map