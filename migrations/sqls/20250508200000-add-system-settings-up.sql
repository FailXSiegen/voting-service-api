-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  use_direct_static_paths BOOLEAN NOT NULL DEFAULT false,
  use_db_footer_navigation BOOLEAN NOT NULL DEFAULT false,
  updated_by INT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (updated_by)
);

-- Insert default settings
INSERT INTO system_settings (use_direct_static_paths, use_db_footer_navigation)
VALUES (false, false);

-- Add foreign key after table is created (to avoid issues)
ALTER TABLE system_settings ADD CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES organizer (id) ON DELETE SET NULL;