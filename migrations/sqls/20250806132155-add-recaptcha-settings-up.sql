-- Add reCAPTCHA settings to system_settings table
ALTER TABLE system_settings 
ADD COLUMN recaptcha_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN recaptcha_site_key VARCHAR(255) NULL,
ADD COLUMN recaptcha_secret_key VARCHAR(255) NULL;