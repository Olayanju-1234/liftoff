import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { TenantStatus, StepStatus } from '@prisma/client';
import { TenantsService } from './tenants.service';

@Injectable()
export class ProvisioningTimeoutService {
    private readonly logger = new Logger(ProvisioningTimeoutService.name);

    // Timeout period in minutes - tenants stuck in PROVISIONING for longer than this will be auto-cancelled
    private readonly TIMEOUT_MINUTES = 30;

    constructor(
        private readonly prisma: PrismaService,
        private readonly tenantsService: TenantsService,
    ) { }

    /**
     * Scheduled job that runs every 5 minutes to check for stale provisioning pipelines.
     * Tenants that have been in PROVISIONING status for longer than TIMEOUT_MINUTES
     * will be automatically cancelled.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleProvisioningTimeout() {
        this.logger.log('Checking for stale provisioning pipelines...');

        const timeoutThreshold = new Date();
        timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - this.TIMEOUT_MINUTES);

        try {
            const staleTenants = await this.prisma.tenant.findMany({
                where: {
                    status: TenantStatus.PROVISIONING,
                    updatedAt: {
                        lt: timeoutThreshold,
                    },
                },
            });

            if (staleTenants.length === 0) {
                this.logger.log('No stale pipelines found.');
                return;
            }

            this.logger.warn(`Found ${staleTenants.length} stale pipeline(s). Auto-cancelling...`);

            for (const tenant of staleTenants) {
                try {
                    await this.tenantsService.cancel(
                        tenant.id,
                        `Provisioning timeout - no progress for ${this.TIMEOUT_MINUTES} minutes`
                    );
                    this.logger.log(`Auto-cancelled tenant ${tenant.id} (${tenant.subdomain})`);
                } catch (error) {
                    this.logger.error(`Failed to auto-cancel tenant ${tenant.id}: ${error.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`Error checking for stale pipelines: ${error.message}`);
        }
    }
}
