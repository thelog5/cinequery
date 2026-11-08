-- Run after the bulk load (scripts/load-imdb.ts does this automatically).
-- Building indexes once on full tables is much faster than maintaining them row by row.
-- Idempotent, so `pnpm db:load --finish-only` can resume a partial run.

-- Parallel index builds spill per-worker temp files; build serially in memory.
SET max_parallel_maintenance_workers = 0;

-- Referential integrity
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_tconst_fk;
ALTER TABLE ratings ADD CONSTRAINT ratings_tconst_fk FOREIGN KEY (tconst) REFERENCES movies (tconst);
ALTER TABLE credits DROP CONSTRAINT IF EXISTS credits_tconst_fk;
ALTER TABLE credits ADD CONSTRAINT credits_tconst_fk FOREIGN KEY (tconst) REFERENCES movies (tconst);
ALTER TABLE credits DROP CONSTRAINT IF EXISTS credits_nconst_fk;
ALTER TABLE credits ADD CONSTRAINT credits_nconst_fk FOREIGN KEY (nconst) REFERENCES people (nconst);

-- Fuzzy name search (search_titles / search_people tools)
CREATE INDEX IF NOT EXISTS movies_title_trgm ON movies USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS people_name_trgm  ON people USING gin (name gin_trgm_ops);

-- Common filters and joins
CREATE INDEX IF NOT EXISTS movies_year_idx       ON movies (year);
CREATE INDEX IF NOT EXISTS movies_genres_idx     ON movies USING gin (genres);
CREATE INDEX IF NOT EXISTS ratings_votes_idx     ON ratings (num_votes);
CREATE INDEX IF NOT EXISTS ratings_rating_idx    ON ratings (avg_rating);
CREATE INDEX IF NOT EXISTS credits_nconst_idx    ON credits (nconst, category);
CREATE INDEX IF NOT EXISTS credits_category_idx  ON credits (category, tconst);

ANALYZE movies;
ANALYZE ratings;
ANALYZE people;
ANALYZE credits;
