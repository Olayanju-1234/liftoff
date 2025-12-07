import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient as TenantClient } from '@prisma/client';
@Injectable()
export class PrismaService extends TenantClient implements OnModuleInit {
  async onModuleInit() { await this.$connect(); }
}