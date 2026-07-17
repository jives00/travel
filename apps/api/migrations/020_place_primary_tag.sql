-- The required, single headline classification for a place (Church, Beach,
-- Museum, ...) from packages/core's PLACE_TAGS — replaces `category` as what's
-- shown to the user. `category` (food/sight/activity/...) stays but becomes
-- purely internal (map-pin color, budget rollups), always derived from this
-- column server-side. NULL only on rows created before this field existed.
ALTER TABLE places
  ADD COLUMN primary_tag VARCHAR(32) NULL AFTER category;
