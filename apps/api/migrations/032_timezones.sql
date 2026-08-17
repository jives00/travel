-- Timezone metadata for calendar export. Stored datetimes are unchanged and
-- keep their existing meaning — wall clock at the place the thing happens — so
-- this adds context for interpreting them, not a rewrite of any value.
--
-- IANA zone ids ("Europe/Madrid"), never offsets: an id survives DST, an offset
-- doesn't. Legs get theirs from Open-Meteo's geocoding response, which already
-- returns one for every city lookup the app makes.
ALTER TABLE legs
  ADD COLUMN timezone VARCHAR(64) NULL;

-- Override for events with no leg to inherit from. Null means "fall back to
-- whatever the viewing calendar uses", which is the pre-existing behavior.
ALTER TABLE settings
  ADD COLUMN home_timezone VARCHAR(64) NULL;
