CREATE TABLE IF NOT EXISTS settings (
  user_id              INT PRIMARY KEY,
  home_currency        CHAR(3) NULL,
  distance_unit        ENUM('km','mi') NOT NULL DEFAULT 'mi',
  default_travel_mode  ENUM('walk','transit','drive') NOT NULL DEFAULT 'walk',
  default_buffer_m     INT NOT NULL DEFAULT 300,
  updated_at           DATETIME DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
