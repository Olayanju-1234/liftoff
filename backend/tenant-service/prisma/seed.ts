import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create default plans
    const basicPlan = await prisma.plan.upsert({
        where: { id: 'plan_basic' },
        update: {},
        create: {
            id: 'plan_basic',
            name: 'Basic',
            maxUsers: 5,
            maxApiKeys: 2,
        },
    });

    const proPlan = await prisma.plan.upsert({
        where: { id: 'plan_pro' },
        update: {},
        create: {
            id: 'plan_pro',
            name: 'Professional',
            maxUsers: 25,
            maxApiKeys: 10,
        },
    });

    const enterprisePlan = await prisma.plan.upsert({
        where: { id: 'plan_enterprise' },
        update: {},
        create: {
            id: 'plan_enterprise',
            name: 'Enterprise',
            maxUsers: 1000,
            maxApiKeys: 100,
        },
    });

    console.log('✅ Created plans:', {
        basic: basicPlan,
        pro: proPlan,
        enterprise: enterprisePlan,
    });

    console.log('🎉 Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
