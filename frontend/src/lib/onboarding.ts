import type { ApiKey, Organisation, Tenant } from './types';

export type OnboardingKey = 'verify-email' | 'base-domain' | 'api-key' | 'webhook' | 'test-customer';

export interface OnboardingItem {
    key: OnboardingKey;
    title: string;
    body: string;
    done: boolean;
    // Where the item is done, when it is a page. The checklist renders its own action otherwise.
    to?: string;
}

export interface OnboardingState {
    emailVerified: boolean;
    organisation: Pick<Organisation, 'baseDomain' | 'webhookConfigured'>;
    apiKeys: Pick<ApiKey, 'id'>[];
    tenants: Pick<Tenant, 'id' | 'isTest'>[];
}

// Every tick comes from real state, never from a stored flag, so it can untick (a revoked
// key, a removed webhook) and the card comes back until the company fixes it.
export function onboardingItems({ emailVerified, organisation, apiKeys, tenants }: OnboardingState): OnboardingItem[] {
    return [
        {
            key: 'verify-email',
            title: 'Verify your email',
            body: 'Open the link we sent you. API keys need a verified address.',
            done: emailVerified,
        },
        {
            key: 'base-domain',
            title: 'Set your base domain',
            body: 'Customer addresses are shown under your own domain, like globex.acme.app.',
            done: organisation.baseDomain !== null && organisation.baseDomain !== '',
            to: '/settings#company',
        },
        {
            key: 'api-key',
            title: 'Create an API key',
            body: 'Your signup flow uses it to add customers automatically.',
            done: apiKeys.length > 0,
            to: '/settings#api-keys',
        },
        {
            key: 'webhook',
            title: 'Add a webhook URL',
            body: 'We tell your systems when a customer is ready, needs attention, or is removed.',
            done: organisation.webhookConfigured,
            to: '/settings#webhook',
        },
        {
            key: 'test-customer',
            title: 'Add a test customer',
            // A real customer counts too: a company that already onboards for real has nothing to try.
            body: 'Watch the five steps run, with nothing billed and nothing counted towards your limits.',
            done: tenants.length > 0,
        },
    ];
}

export const onboardingComplete = (items: OnboardingItem[]) => items.every((item) => item.done);
