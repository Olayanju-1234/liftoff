import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OrganisationsModule } from '../organisations/organisations.module';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';
import { InternalTokenGuard } from './internal-token.guard';

@Module({
  imports: [OrganisationsModule],
  controllers: [InternalController],
  providers: [InternalService, InternalTokenGuard, PrismaService],
})
export class InternalModule {}
