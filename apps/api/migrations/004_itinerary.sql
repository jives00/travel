CREATE TABLE IF NOT EXISTS itinerary_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  trip_id        INT NOT NULL,
  leg_id         INT NOT NULL,
  day_index      INT NOT NULL,
  scheduled_date DATE NULL,
  time           TIME NULL,
  sort_order     INT NOT NULL DEFAULT 0,
  item_type      ENUM('place','booking','activity') NOT NULL,
  place_id       INT NULL,
  -- booking_id has no FK constraint yet — the bookings table doesn't exist until
  -- migration 005 (Slice 4). The constraint is added there via ALTER TABLE.
  booking_id     INT NULL,
  activity_text  VARCHAR(512) NULL,
  created_at     DATETIME DEFAULT NOW(),
  updated_at     DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_itinerary_items_trip_id (trip_id),
  INDEX idx_itinerary_items_leg_id (leg_id),
  INDEX idx_itinerary_items_place_id (place_id),
  INDEX idx_itinerary_items_booking_id (booking_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (leg_id) REFERENCES legs(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
