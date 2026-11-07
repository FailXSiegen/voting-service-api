ALTER TABLE `organizer`
  DROP INDEX `idx_organizer_optin_token_hash`,
  DROP INDEX `idx_organizer_reset_token_hash`,
  DROP COLUMN `optin_token_hash`,
  DROP COLUMN `optin_token_expires`,
  DROP COLUMN `reset_token_hash`,
  DROP COLUMN `reset_token_expires`;
