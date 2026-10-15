import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '.prisma/credentials-client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}