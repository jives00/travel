CREATE TABLE IF NOT EXISTS trips (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  name            VARCHAR(255) NOT NULL,
  hero_image_url  VARCHAR(1024) NULL,
  home_currency   CHAR(3) NULL,
  archived_at     DATETIME NULL,
  created_at      DATETIME DEFAULT NOW(),
  updated_at      DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_trips_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS legs (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  trip_id           INT NOT NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  city              VARCHAR(255) NOT NULL,
  start_date        DATE NULL,
  end_date          DATE NULL,
  day_count         INT NULL,
  lodging_place_id  INT NULL,
  currency          CHAR(3) NULL,
  created_at        DATETIME DEFAULT NOW(),
  updated_at        DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_legs_trip_id (trip_id),
  INDEX idx_legs_lodging_place_id (lodging_place_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (lodging_place_id) REFERENCES places(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
