-- A place/idea can be marked private (e.g. a surprise, or something not meant
-- for whoever else might see the itinerary) and hidden from view via the
-- user-level show_private_items toggle in settings.
ALTER TABLE itinerary_items
  ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE settings
  ADD COLUMN show_private_items TINYINT(1) NOT NULL DEFAULT 1;
