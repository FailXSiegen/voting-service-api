-- Remove reCAPTCHA settings from system_settings table
ALTER TABLE system_settings 
DROP COLUMN IF EXISTS recaptcha_enabled,
DROP COLUMN IF EXISTS recaptcha_site_key,
DROP COLUMN IF EXISTS recaptcha_secret_key;