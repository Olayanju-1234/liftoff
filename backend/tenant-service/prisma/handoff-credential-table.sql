-- Credential used to live in public, pushed by tenant-service. credentials-service now owns it
-- in the credentials schema; move existing rows there so tenant-service's push won't drop them.
DO $$
BEGIN
  IF to_regclass('public."Credential"') IS NULL THEN
    RETURN;
  END IF;

  CREATE SCHEMA IF NOT EXISTS credentials;

  IF to_regclass('credentials."Credential"') IS NULL THEN
    ALTER TABLE public."Credential" SET SCHEMA credentials;
  ELSE
    INSERT INTO credentials."Credential" ("id", "tenantId", "apiKey", "createdAt", "updatedAt")
    SELECT "id", "tenantId", "apiKey", "createdAt", "updatedAt" FROM public."Credential"
    ON CONFLICT DO NOTHING;
    DROP TABLE public."Credential";
  END IF;
END $$;
