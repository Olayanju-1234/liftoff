export const REPO = 'https://github.com/Olayanju-1234/liftoff';
export const API_BASE = 'https://api.liftoff.ojusentinel.com';
export const SWAGGER_URL = `${API_BASE}/api/docs`;
export const SITE_HOST = 'liftoff.ojusentinel.com';
export const SUPPORT_EMAIL = 'horlarhyanjuhjoseph@gmail.com';
export const OPERATOR = 'Joseph Olayanju';
export const LEGAL_EFFECTIVE = '17 October 2026';

export interface PlanRow {
    text: string;
    soon?: boolean;
    note?: string;
}

export interface PlanCard {
    id: 'free' | 'pro';
    name: string;
    price: string;
    unit: string;
    tagline: string;
    rows: PlanRow[];
    cta: string;
    ctaTo: string;
}

export const PLANS: PlanCard[] = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        unit: 'forever',
        tagline: 'Wire it into a staging signup flow and watch it work.',
        rows: [
            { text: '10 active tenants', note: 'test tenants don’t count' },
            { text: 'All five provisioning steps' },
            { text: 'Support dashboard, Simple and Under the hood views' },
            { text: 'Test mode', note: 'test: true on POST /tenants' },
            { text: 'Community support on GitHub issues' },
        ],
        cta: 'Start free',
        ctaTo: '/register',
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$X',
        unit: 'per active tenant / month',
        tagline: 'For a live signup flow with real customers behind it.',
        rows: [
            { text: 'Unlimited active tenants' },
            { text: 'Company API keys' },
            { text: 'Ready and failed webhooks, signed' },
            { text: 'Your own Stripe for customer trials', soon: true },
            { text: 'Custom steps that call your URL', soon: true },
            { text: 'Email support from the maintainer' },
        ],
        cta: 'Start free, upgrade later',
        ctaTo: '/register',
    },
];
