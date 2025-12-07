"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_rabbitmq_1 = require("@golevelup/nestjs-rabbitmq");
const prisma_service_1 = require("./prisma.service");
const library_1 = require("@prisma/client/runtime/library");
const crypto = __importStar(require("crypto"));
let AppService = AppService_1 = class AppService {
    prisma;
    amqpConnection;
    logger = new common_1.Logger(AppService_1.name);
    constructor(prisma, amqpConnection) {
        this.prisma = prisma;
        this.amqpConnection = amqpConnection;
    }
    async handleTenantDnsReady(payload) {
        this.logger.log({ payload }, `RECEIVED EVENT: Creating credentials for ${payload.tenantId}`);
        try {
            const newApiKey = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
            await this.prisma.credential.create({
                data: {
                    tenantId: payload.tenantId,
                    apiKey: newApiKey,
                },
            });
            this.logger.log({ tenantId: payload.tenantId }, `SUCCESS: Saved credentials for ${payload.tenantId}`);
            await this.amqpConnection.publish('provisioning.direct', 'tenant.credentials.ready', payload);
        }
        catch (error) {
            if (error instanceof library_1.PrismaClientKnownRequestError &&
                error.code === 'P2002') {
                this.logger.warn({ payload }, `WARN: Credentials for ${payload.tenantId} already exist. Republishing event.`);
                await this.amqpConnection.publish('provisioning.direct', 'tenant.credentials.ready', payload);
                return;
            }
            else {
                this.logger.error({ err: error.message, payload }, `FAILED to create credentials for ${payload.tenantId}.`);
                return new nestjs_rabbitmq_1.Nack(false);
            }
        }
    }
};
exports.AppService = AppService;
__decorate([
    (0, nestjs_rabbitmq_1.RabbitSubscribe)({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.dns.ready',
        queue: 'credentials-queue',
        queueOptions: {
            durable: true,
            deadLetterExchange: 'dlx.provisioning',
            deadLetterRoutingKey: 'credentials.failed',
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppService.prototype, "handleTenantDnsReady", null);
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        nestjs_rabbitmq_1.AmqpConnection])
], AppService);
//# sourceMappingURL=app.service.js.map