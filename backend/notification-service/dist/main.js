"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const nestjs_pino_1 = require("nestjs-pino");
const platform_fastify_1 = require("@nestjs/platform-fastify");
async function bootstrap() {
    const adapter = new platform_fastify_1.FastifyAdapter();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, adapter, { bufferLogs: true });
    app.useLogger(app.get(nestjs_pino_1.Logger));
    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.get('/health', async () => {
        return { status: 'ok', service: 'notification-service', worker: true };
    });
    const port = process.env.PORT || 3005;
    await app.listen(port, '0.0.0.0');
    const logger = app.get(nestjs_pino_1.Logger);
    logger.log(`Notification worker is running on port ${port} and listening for RabbitMQ events...`);
}
bootstrap();
//# sourceMappingURL=main.js.map