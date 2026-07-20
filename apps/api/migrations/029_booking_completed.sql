-- Bookings can be checked off as done, same as places/ideas via
-- itinerary_items.completed — bookings never get their own itinerary item
-- (see bookings.routes.ts), so this needs its own column instead of reusing
-- that one.
ALTER TABLE bookings
  ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0;
