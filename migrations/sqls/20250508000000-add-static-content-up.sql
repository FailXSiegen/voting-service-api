-- Create static_content table
CREATE TABLE IF NOT EXISTS static_content (
  id int(11) NOT NULL AUTO_INCREMENT,
  page_key varchar(255) NOT NULL,
  section_key varchar(255) NOT NULL,
  content text NOT NULL,
  title varchar(255) DEFAULT NULL,
  ordering int(11) DEFAULT 0,
  is_published tinyint(1) DEFAULT 1,
  created_by int(11) DEFAULT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_static_content_page_section (page_key, section_key)
);

-- Add index for faster lookups
CREATE INDEX idx_static_content_lookup ON static_content(page_key, section_key, is_published);

-- Add foreign key after table is created (to avoid issues)
ALTER TABLE static_content ADD CONSTRAINT fk_static_content_created_by FOREIGN KEY (created_by) REFERENCES organizer (id) ON DELETE SET NULL;

-- Insert initial data for FAQ pages
INSERT INTO static_content(page_key, section_key, title, content, ordering)
VALUES
  ('faq', 'general_info', 'Allgemeine Informationen', '<h2>Allgemeine Informationen</h2><div class="accordion">...</div>', 10),
  ('faq', 'security', 'Sicherheit', '<h2>Sicherheit</h2><div class="accordion">...</div>', 20),
  ('faq', 'registration', 'Registrierung', '<h2>Registrierung</h2><div class="accordion">...</div>', 30),
  ('faq', 'execution', 'Durchführung', '<h2>Durchführung</h2><div class="accordion">...</div>', 40),
  ('faq', 'requirements', 'Voraussetzungen', '<h2>Voraussetzungen</h2><div class="accordion">...</div>', 50),
  ('faq', 'results', 'Ergebnisse', '<h2>Ergebnisse</h2><div class="accordion">...</div>', 60),
  ('faq', 'support', 'Support', '<h2>Support</h2><div class="accordion">...</div>', 70),
  ('faq', 'legal', 'Rechtliches', '<h2>Rechtliches</h2><div class="accordion">...</div>', 80),
  ('faq', 'feedback', 'Feedback', '<h2>Feedback</h2><div class="accordion">...</div>', 90),
  ('faq', 'special', 'Besondere Fälle', '<h2>Besondere Fälle</h2><div class="accordion">...</div>', 100),
  ('imprint', 'main', 'Impressum', '<h1>Impressum</h1>...', 10),
  ('data_protection', 'main', 'Datenschutz', '<h1>Datenschutzerklärung</h1>...', 10),
  ('user_agreement', 'main', 'Nutzungsvereinbarung', '<h1>Nutzungsvereinbarung</h1>...', 10),
  ('manual', 'main', 'Benutzerhandbuch', '<h1>Benutzerhandbuch</h1>...', 10);

-- Add superAdmin requirement for editing static content
ALTER TABLE organizer ADD COLUMN IF NOT EXISTS can_edit_content BOOLEAN DEFAULT false;

-- Update existing superadmins to have content editing permission
UPDATE organizer SET can_edit_content = true WHERE super_admin = true;