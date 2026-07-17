-- The "ideas tray" — a place linked to a trip but not yet scheduled onto a day.
-- Distinct from itinerary_items, which requires a leg_id + day_index (already scheduled).
-- Scheduling a place does NOT remove it from trip_places; it stays associated with
-- the trip even once it's also on the calendar.
CREATE TABLE IF NOT EXISTS trip_places (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  trip_id   INT NOT NULL,
  place_id  INT NOT NULL,
  added_at  DATETIME DEFAULT NOW(),
  INDEX idx_trip_places_trip_id (trip_id),
  INDEX idx_trip_places_place_id (place_id),
  UNIQUE KEY uq_trip_place (trip_id, place_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
