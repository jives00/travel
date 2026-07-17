-- Separate from hero_image_url (the trip-detail page's hero, which is
-- deliberately re-rolled fresh from Unsplash on every visit) — the trips-list
-- grid needs a *fixed* thumbnail per trip: auto-filled once from Unsplash,
-- then stable until the user explicitly changes it.
ALTER TABLE trips
  ADD COLUMN list_image_url VARCHAR(1024) NULL,
  ADD COLUMN list_image_photographer_name VARCHAR(255) NULL,
  ADD COLUMN list_image_photographer_url VARCHAR(1024) NULL;
