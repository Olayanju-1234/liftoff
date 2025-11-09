import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    // This connects to the database when the app starts
    await this.$connect();
  }
  
  // You can add other methods here if needed, e.g., for graceful shutdown
}