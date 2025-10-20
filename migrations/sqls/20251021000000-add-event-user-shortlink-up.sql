CREATE TABLE event_user_shortlink (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    short_code VARCHAR(255) UNIQUE NOT NULL,
    event_user_id INT(11) NOT NULL,
    event_id INT(11) NOT NULL,
    create_datetime INT(11) DEFAULT 0 NOT NULL,
    INDEX idx_short_code (short_code),
    INDEX idx_event_user_id (event_user_id),
    FOREIGN KEY (event_user_id) REFERENCES event_user (id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES event (id) ON DELETE CASCADE
);
