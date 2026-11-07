-- SEC-10: zufällige, getrennte, ablaufende Einmal-Tokens für Opt-in und Passwort-Reset.
-- Gespeichert wird nur der SHA-256 des Tokens.
ALTER TABLE `organizer`
  ADD COLUMN `optin_token_hash` CHAR(64) NULL DEFAULT NULL,
  ADD COLUMN `optin_token_expires` INT(11) NULL DEFAULT NULL,
  ADD COLUMN `reset_token_hash` CHAR(64) NULL DEFAULT NULL,
  ADD COLUMN `reset_token_expires` INT(11) NULL DEFAULT NULL,
  ADD INDEX `idx_organizer_optin_token_hash` (`optin_token_hash`),
  ADD INDEX `idx_organizer_reset_token_hash` (`reset_token_hash`);

-- Alte md5(id+Zeit)-Hashes sind vorhersagbar und werden ungültig.
UPDATE `organizer` SET `hash` = '';
