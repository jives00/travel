-- Widens what a place stores from Google Places Details, for a richer detail
-- view: editorial description, aggregate rating (not individual review text —
-- see google-places.client.ts), website, and Google's category tags.
ALTER TABLE places
  ADD COLUMN description TEXT NULL,
  ADD COLUMN rating DECIMAL(2,1) NULL,
  ADD COLUMN user_ratings_total INT NULL,
  ADD COLUMN website VARCHAR(1024) NULL,
  ADD COLUMN google_types JSON NULL;
