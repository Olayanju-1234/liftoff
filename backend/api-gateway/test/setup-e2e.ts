// AppModule reads these when it is imported, so they must be set before any test file loads it.
process.env.TENANT_SERVICE_URL ??= 'http://tenant-service.test';
process.env.LOG_LEVEL ??= 'fatal';
