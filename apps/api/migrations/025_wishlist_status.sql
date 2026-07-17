ALTER TABLE wishlist_locations
  ADD COLUMN status ENUM('visited','want_to_visit') NOT NULL DEFAULT 'want_to_visit' AFTER type;
