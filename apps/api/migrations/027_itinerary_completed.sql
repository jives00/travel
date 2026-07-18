-- Itinerary items (places/activities) can be checked off as done/visited.
-- Completion date reuses the existing scheduled_date column — the client
-- fills it in with today's date at check-off time if it was previously
-- unset, so no separate completed_at column is needed.
ALTER TABLE itinerary_items
  ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0;
