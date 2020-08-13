CREATE TABLE IF NOT EXISTS organisator (
    id int(11) NOT NULL AUTO_INCREMENT,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    username varchar(255) DEFAULT '' NOT NULL,
    email varchar(255) DEFAULT '' NOT NULL,
    password varchar(255) DEFAULT '' NOT NULL,
    public_name varchar(255) DEFAULT '' NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS event (
    id int(11) NOT NULL AUTO_INCREMENT,
    organisator_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    modified_datetime int(11) DEFAULT 0 NOT NULL,
    scheduled_datetime int(11) DEFAULT 0 NOT NULL,
    title varchar(255) DEFAULT '' NOT NULL,
    lobby_open tinyint(2) DEFAULT 0 NOT NULL,
    active tinyint(2) DEFAULT 0 NOT NULL,
    deleted tinyint(2) DEFAULT 0 NOT NULL,
    description text,
    image_path varchar(255) DEFAULT '' NOT NULL,
    slug varchar(255) DEFAULT '' NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY (slug),
    FOREIGN KEY (organisator_id) REFERENCES organisator (id)
);
CREATE TABLE IF NOT EXISTS poll (
    id int(11) NOT NULL AUTO_INCREMENT,
    event_id int(11) DEFAULT 0 NOT NULL,
    original_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    title varchar(255) DEFAULT '' NOT NULL,
    type int(11) DEFAULT 0 NOT NULL,
    repeated tinyint(2) DEFAULT 0 NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (event_id) REFERENCES event (id),
    FOREIGN KEY (original_id) REFERENCES poll (id)
);
CREATE TABLE IF NOT EXISTS event_user (
    id int(11) NOT NULL AUTO_INCREMENT,
    event_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    username varchar(255) DEFAULT '' NOT NULL,
    email varchar(255) DEFAULT '' NOT NULL,
    password varchar(255) DEFAULT '' NOT NULL,
    public_name varchar(255) DEFAULT '' NOT NULL,
    allow_to_vote tinyint(2) DEFAULT 0 NOT NULL,
    online tinyint(2) DEFAULT 0 NOT NULL,
    coorganisator tinyint(2) DEFAULT 0 NOT NULL,
    verified tinyint(2) DEFAULT 0 NOT NULL,
    identifier_hash varchar(255) DEFAULT '' NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY (identifier_hash),
    FOREIGN KEY (event_id) REFERENCES event (id)
);
CREATE TABLE IF NOT EXISTS poll_user (
    id int(11) NOT NULL AUTO_INCREMENT,
    event_user_id int(11) DEFAULT 0 NOT NULL,
    poll_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (event_user_id) REFERENCES event_user (id),
    FOREIGN KEY (poll_id) REFERENCES poll (id)
);
CREATE TABLE IF NOT EXISTS poll_possible_answer (
    id int(11) NOT NULL AUTO_INCREMENT,
    poll_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    content varchar(255) DEFAULT '' NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (poll_id) REFERENCES poll (id)
);
CREATE TABLE IF NOT EXISTS poll_result (
    id int(11) NOT NULL AUTO_INCREMENT,
    poll_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    public tinyint(2) DEFAULT 0 NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (poll_id) REFERENCES poll (id)
);
CREATE TABLE IF NOT EXISTS poll_answer (
    id int(11) NOT NULL AUTO_INCREMENT,
    result_id int(11) DEFAULT 0 NOT NULL,
    answer_id int(11) DEFAULT 0 NOT NULL,
    event_user_id int(11) DEFAULT 0 NOT NULL,
    create_datetime int(11) DEFAULT 0 NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (result_id) REFERENCES poll_result (id),
    FOREIGN KEY (answer_id) REFERENCES poll_possible_answer (id),
    FOREIGN KEY (event_user_id) REFERENCES event_user (id)
);