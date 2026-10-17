export const DEFAULT_TENANT_BASE_DOMAIN = 'liftoff.ojusentinel.com';

// Postgres identifiers are 63 bytes; "tenant_" + 24 + "_" + a 30-char subdomain fits.
const HANDLE_PART_MAX = 24;

const identifier = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, '_');

// What db-provisioner created before subdomains were scoped to the organisation.
export const legacySchemaName = (subdomain: string) =>
  `tenant_${identifier(subdomain)}`;

export const schemaNameFor = (handle: string, subdomain: string) =>
  `tenant_${identifier(handle).slice(0, HANDLE_PART_MAX)}_${identifier(subdomain)}`;

// DNS is still a record in our table, so the address is what the dashboard and API show.
export function platformBaseDomain(): string {
  return process.env.TENANT_BASE_DOMAIN?.trim() || DEFAULT_TENANT_BASE_DOMAIN;
}

export const tenantAddress = (
  subdomain: string,
  baseDomain: string | null | undefined,
) => `${subdomain}.${baseDomain || platformBaseDomain()}`;

export type WithAddress<T> = T & { address: string };

export function withAddress<T extends { subdomain: string }>(
  tenant: T,
  baseDomain: string | null | undefined,
): WithAddress<T> {
  return { ...tenant, address: tenantAddress(tenant.subdomain, baseDomain) };
}
