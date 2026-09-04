-- Check-off used to stamp scheduled_date with today when the item had no date
-- (see 027). That doubled as the completion date, but it also re-categorized
-- the item: the list view sends anything with a date to "Scheduled Activities",
-- so checking off an unscheduled place yanked it out of the section it lived in.
-- Completion now gets its own column, leaving scheduled_date to mean only what
-- the user actually planned. The calendar view falls back to completed_at so a
-- never-scheduled visit still lands on the day it happened.
--
-- Not backfilled: for items already checked off, there's no way to tell an
-- auto-stamped scheduled_date from one the user set on purpose.
ALTER TABLE itinerary_items
  ADD COLUMN completed_at DATE NULL;
