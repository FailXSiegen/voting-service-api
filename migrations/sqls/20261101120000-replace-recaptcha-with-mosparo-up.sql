-- Replace Google reCAPTCHA with self-hosted mosparo. Disabled until a mosparo project is configured.
ALTER TABLE system_settings
DROP COLUMN IF EXISTS recaptcha_enabled,
DROP COLUMN IF EXISTS recaptcha_site_key,
DROP COLUMN IF EXISTS recaptcha_secret_key,
ADD COLUMN IF NOT EXISTS mosparo_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mosparo_host VARCHAR(255) NULL DEFAULT 'https://captcha.failx.de',
ADD COLUMN IF NOT EXISTS mosparo_uuid VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS mosparo_public_key VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS mosparo_private_key VARCHAR(255) NULL;
