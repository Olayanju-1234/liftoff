import {
  DEFAULT_TENANT_BASE_DOMAIN,
  legacySchemaName,
  schemaNameFor,
  tenantAddress,
  withAddress,
} from './address';

describe('tenant address and schema naming', () => {
  const env = process.env.TENANT_BASE_DOMAIN;
  afterEach(() => {
    if (env === undefined) {
      delete process.env.TENANT_BASE_DOMAIN;
    } else {
      process.env.TENANT_BASE_DOMAIN = env;
    }
  });

  it("uses the organisation's base domain when it has one", () => {
    expect(tenantAddress('globex', 'acme.app')).toBe('globex.acme.app');
  });

  it('falls back to the platform domain for display', () => {
    delete process.env.TENANT_BASE_DOMAIN;
    expect(tenantAddress('globex', null)).toBe(
      `globex.${DEFAULT_TENANT_BASE_DOMAIN}`,
    );
    process.env.TENANT_BASE_DOMAIN = 'tenants.example.test';
    expect(tenantAddress('globex', undefined)).toBe(
      'globex.tenants.example.test',
    );
  });

  it('adds address without touching the row', () => {
    const row = { id: 't1', subdomain: 'globex' };
    expect(withAddress(row, 'acme.app')).toEqual({
      ...row,
      address: 'globex.acme.app',
    });
    expect(row).not.toHaveProperty('address');
  });

  it('prefixes new schemas with the organisation handle and keeps them under 63 chars', () => {
    expect(schemaNameFor('acme', 'globex')).toBe('tenant_acme_globex');
    expect(schemaNameFor('acme-corp', 'globex')).toBe(
      'tenant_acme_corp_globex',
    );
    const long = schemaNameFor('a'.repeat(50), 'b'.repeat(30));
    expect(long).toBe(`tenant_${'a'.repeat(24)}_${'b'.repeat(30)}`);
    expect(long.length).toBeLessThanOrEqual(63);
  });

  it('names legacy schemas the way db-provisioner did', () => {
    expect(legacySchemaName('globex')).toBe('tenant_globex');
    expect(legacySchemaName('glo-bex')).toBe('tenant_glo_bex');
  });
});
