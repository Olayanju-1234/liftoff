"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const nestjs_rabbitmq_1 = require("@golevelup/nestjs-rabbitmq");
const nestjs_pino_1 = require("nestjs-pino");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_pino_1.LoggerModule.forRoot({
                pinoHttp: {
                    transport: {
                        target: 'pino-pretty',
                        options: {
                            singleLine: true,
                            colorize: true,
                            levelFirst: false,
                        },
                    },
                },
            }),
            nestjs_rabbitmq_1.RabbitMQModule.forRoot({
                exchanges: [
                    {
                        name: 'provisioning.direct',
                        type: 'direct',
                        options: {
                            durable: true,
                        },
                    },
                    {
                        name: 'dlx.provisioning',
                        type: 'direct',
                        options: {
                            durable: true,
                        },
                    },
                ],
                uri: 'amqp://devuser:devpassword@localhost:5672',
                connectionInitOptions: { wait: false },
            }),
        ],
        controllers: [],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map