ALTER TABLE `zoom_meeting` ADD `sdk_key` VARCHAR(255) DEFAULT '' NOT NULL;
ALTER TABLE `zoom_meeting` ADD `sdk_secret` VARCHAR(255) DEFAULT '' NOT NULL;

ALTER TABLE `zoom_meeting` DROP COLUMN `api_key`;
ALTER TABLE `zoom_meeting` DROP COLUMN `api_secret`;
