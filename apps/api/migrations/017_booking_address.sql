-- Bookings can now carry their own address/coordinates directly (via the same
-- Google Places autocomplete used elsewhere), instead of requiring a link to
-- an existing library Place — useful for hotels especially, where forcing a
-- Place record just to plot it on the map was unwanted overhead.
ALTER TABLE bookings
  ADD COLUMN address VARCHAR(512) NULL,
  ADD COLUMN lat DECIMAL(10,7) NULL,
  ADD COLUMN lng DECIMAL(10,7) NULL;
