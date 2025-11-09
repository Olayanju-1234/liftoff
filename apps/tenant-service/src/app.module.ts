import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantsModule } from './tenants/tenants.module';

@Module({
  imports: [
    TenantsModule, // <-- Only import this
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }