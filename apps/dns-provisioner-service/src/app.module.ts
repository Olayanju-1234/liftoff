import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [
    RabbitMQModule.forRoot({
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
  providers: [AppService],
})
export class AppModule { }