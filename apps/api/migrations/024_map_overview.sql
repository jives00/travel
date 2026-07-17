ALTER TABLE legs
  ADD COLUMN lat DECIMAL(10,7) NULL,
  ADD COLUMN lng DECIMAL(10,7) NULL;

CREATE TABLE IF NOT EXISTS wishlist_locations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  type        ENUM('city','country') NOT NULL DEFAULT 'city',
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  note        VARCHAR(2000) NULL,
  created_at  DATETIME DEFAULT NOW(),
  INDEX idx_wishlist_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
