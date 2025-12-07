"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const platform_fastify_1 = require("@nestjs/platform-fastify");
async function bootstrap() {
    const adapter = new platform_fastify_1.FastifyAdapter();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, adapter);
    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.get('/health', async () => {
        return { status: 'ok', service: 'dns-provisioner-service', worker: true };
    });
    const port = process.env.PORT || 3003;
    await app.listen(port, '0.0.0.0');
    console.log(`DNS Provisioner worker is running on port ${port} and listening for RabbitMQ events...`);
}
bootstrap();
//# sourceMappingURL=main.js.map