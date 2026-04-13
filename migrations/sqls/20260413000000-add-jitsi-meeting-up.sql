CREATE TABLE IF NOT EXISTS jitsi_meeting (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  title varchar(255) NOT NULL,
  organizer_id int(11),
  server_url varchar(255) NOT NULL,
  FOREIGN KEY (organizer_id) REFERENCES organizer(id)
);
