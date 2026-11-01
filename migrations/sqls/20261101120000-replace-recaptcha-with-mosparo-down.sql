ALTER TABLE system_settings
DROP COLUMN IF EXISTS mosparo_enabled,
DROP COLUMN IF EXISTS mosparo_host,
DROP COLUMN IF EXISTS mosparo_uuid,
DROP COLUMN IF EXISTS mosparo_public_key,
DROP COLUMN IF EXISTS mosparo_private_key,
ADD COLUMN IF NOT EXISTS recaptcha_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recaptcha_site_key VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS recaptcha_secret_key VARCHAR(255) NULL;
