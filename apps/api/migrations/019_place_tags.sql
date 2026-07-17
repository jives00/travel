-- Curated, closed set of subcategory tags a place can carry (multiple allowed),
-- distinct from `category` (single, primary) and from `google_types` (raw,
-- uncurated Google passthrough — see 018_place_details.sql). See
-- packages/core/src/place-tags.ts for the fixed tag list.
ALTER TABLE places
  ADD COLUMN tags JSON NULL;
