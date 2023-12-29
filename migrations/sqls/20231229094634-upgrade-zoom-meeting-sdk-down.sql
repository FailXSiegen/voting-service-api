ALTER TABLE `zoom_meeting` ADD `api_key` VARCHAR(255) DEFAULT '' NOT NULL;
ALTER TABLE `zoom_meeting` ADD `api_secret` VARCHAR(255) DEFAULT '' NOT NULL;

ALTER TABLE `zoom_meeting` DROP COLUMN `sdk_key`;
ALTER TABLE `zoom_meeting` DROP COLUMN `sdk_secret`;