-- Collapse primary_tag's 25 curated values down to 8 coarse ones (the old
-- `category` enum, plus a carved-out `day_trip`, with sight->site and
-- food->food_drinks renamed). `category` becomes redundant and is dropped —
-- primary_tag is now the sole classification field.
UPDATE places
SET primary_tag = CASE primary_tag
  WHEN 'church' THEN 'site'
  WHEN 'museum' THEN 'site'
  WHEN 'landmark' THEN 'site'
  WHEN 'historic_site' THEN 'site'
  WHEN 'viewpoint' THEN 'site'
  WHEN 'architecture' THEN 'site'
  WHEN 'neighborhood' THEN 'site'
  WHEN 'restaurant' THEN 'food_drinks'
  WHEN 'cafe' THEN 'food_drinks'
  WHEN 'bar' THEN 'food_drinks'
  WHEN 'brewery_winery' THEN 'food_drinks'
  WHEN 'beach' THEN 'activity'
  WHEN 'park' THEN 'activity'
  WHEN 'garden' THEN 'activity'
  WHEN 'hiking_trail' THEN 'activity'
  WHEN 'waterfront' THEN 'activity'
  WHEN 'nightlife' THEN 'activity'
  WHEN 'live_music_theater' THEN 'activity'
  WHEN 'stadium_venue' THEN 'activity'
  WHEN 'zoo_aquarium' THEN 'activity'
  WHEN 'spa' THEN 'activity'
  WHEN 'train_station' THEN 'transit'
  WHEN 'airport' THEN 'transit'
  WHEN 'bus_ferry_station' THEN 'transit'
  WHEN 'market' THEN 'shopping'
  WHEN 'day_trip' THEN 'day_trip'
  ELSE primary_tag
END
WHERE primary_tag IS NOT NULL;

UPDATE places SET primary_tag = 'other' WHERE primary_tag IS NULL;

-- Every row now has a primary_tag (backfilled above); CreatePlaceBody already
-- requires it for new rows, so enforce that at the DB level too.
ALTER TABLE places MODIFY COLUMN primary_tag VARCHAR(32) NOT NULL;

ALTER TABLE places DROP INDEX idx_places_category;
ALTER TABLE places DROP COLUMN category;
