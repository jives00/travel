CREATE TABLE IF NOT EXISTS bookings (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  trip_id            INT NOT NULL,
  leg_id             INT NULL,
  type               ENUM('flight','hotel','train','car','restaurant','event') NOT NULL,
  title              VARCHAR(255) NOT NULL,
  confirmation_code  VARCHAR(255) NULL,
  flight_number      VARCHAR(16) NULL,
  start_at           DATETIME NULL,
  end_at             DATETIME NULL,
  price              DECIMAL(12,2) NULL,
  currency           CHAR(3) NULL,
  place_id           INT NULL,
  notes              TEXT NULL,
  created_at         DATETIME DEFAULT NOW(),
  updated_at         DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_bookings_trip_id (trip_id),
  INDEX idx_bookings_leg_id (leg_id),
  INDEX idx_bookings_place_id (place_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (leg_id) REFERENCES legs(id) ON DELETE SET NULL,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- itinerary_items.booking_id was left without a FK constraint in 004_itinerary.sql
-- because bookings didn't exist yet — add it now that it does.
ALTER TABLE itinerary_items
  ADD CONSTRAINT fk_itinerary_items_booking_id FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
