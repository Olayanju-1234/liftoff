import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios'; // <-- 1. Import

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      baseURL: 'http://localhost:3001', // <-- 3. Set base URL
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }