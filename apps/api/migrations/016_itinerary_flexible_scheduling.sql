-- Itinerary items move to free-form scheduling: a leg (city) association and a
-- real date are both optional and independent, replacing the old mandatory
-- leg_id + relative day_index model (day_index is left in place, unused, for
-- any pre-existing rows rather than dropped).
ALTER TABLE itinerary_items
  MODIFY COLUMN leg_id INT NULL,
  MODIFY COLUMN day_index INT NULL;

ALTER TABLE bookings
  MODIFY COLUMN type ENUM('flight','hotel','train','car','restaurant','event','activity') NOT NULL;
