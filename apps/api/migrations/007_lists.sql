CREATE TABLE IF NOT EXISTS custom_lists (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  trip_id     INT NULL,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT NOW(),
  updated_at  DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_custom_lists_user_id (user_id),
  INDEX idx_custom_lists_trip_id (trip_id),
  UNIQUE KEY uq_list_slug (user_id, slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS list_places (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  list_id   INT NOT NULL,
  place_id  INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  added_at  DATETIME DEFAULT NOW(),
  INDEX idx_list_places_list_id (list_id),
  INDEX idx_list_places_place_id (place_id),
  UNIQUE KEY uq_list_place (list_id, place_id),
  FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
