CREATE TABLE `event_user_auth_token` (
    `id` INT(11) PRIMARY KEY AUTO_INCREMENT,
    `token` VARCHAR(255) UNIQUE NOT NULL,
    `event_user_id` INT(11) DEFAULT 0 NOT NULL,
    `create_datetime` INT(11) DEFAULT 0 NOT NULL,
    `active` TINYINT(2) DEFAULT 0 NOT NULL,
    FOREIGN KEY (`event_user_id`) REFERENCES `event_user` (id)
);