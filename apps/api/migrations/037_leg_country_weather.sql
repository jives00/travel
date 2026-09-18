-- Two things the recap (plans/todo.md #9a) can't be built without.
--
-- 1. Country on the leg. `legs` stored a bare city string, so "3 countries,
--    6 cities" and any route line were impossible. Open-Meteo's geocoding
--    response already carries `country` and `country_code` on every lookup —
--    the same call that fills `timezone` (032) and `lat`/`lng` (024) — so this
--    rides along with a backfill that already exists rather than adding a
--    lookup. Null means "not looked up yet", exactly like those columns.
ALTER TABLE legs
  ADD COLUMN country VARCHAR(128) NULL,
  ADD COLUMN country_code CHAR(2) NULL;

-- 2. What the weather actually was, cached per leg.
--
--    Past weather never changes, so this is write-once data — which is what
--    makes the recap work offline on mobile and kills a repeat archive fetch on
--    every open. The summary only: nothing renders a per-day past forecast, so
--    storing the daily series would be dead weight.
--
--    `start_date`/`end_date` are the range the summary was computed FOR, not
--    just provenance: if the leg's dates are edited afterwards the cached row no
--    longer matches and is refetched, rather than silently describing the wrong
--    week.
--
--    `is_complete` is the guard against the archive's lag. Open-Meteo's ERA5
--    archive can trail the present by a few days, so a recap opened right after
--    landing may get a short series. An incomplete summary is still worth
--    showing — it just isn't worth *keeping*, so it's refetched on next read
--    until the archive catches up and the row goes complete.
CREATE TABLE IF NOT EXISTS leg_weather (
  leg_id              INT NOT NULL PRIMARY KEY,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  avg_high_f          DECIMAL(5,1) NOT NULL,
  avg_low_f           DECIMAL(5,1) NOT NULL,
  dominant_condition  VARCHAR(32) NOT NULL,
  precip_days         INT NOT NULL,
  -- Days the provider actually returned, vs. the days the range asked for.
  day_count           INT NOT NULL,
  is_complete         TINYINT(1) NOT NULL DEFAULT 0,
  fetched_at          DATETIME DEFAULT NOW(),
  FOREIGN KEY (leg_id) REFERENCES legs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
