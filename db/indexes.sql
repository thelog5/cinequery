-- Run after the bulk load (scripts/load-imdb.ts does this automatically).
-- Building indexes once on full tables is much faster than maintaining them row by row.

-- Referential integrity
ALTER TABLE ratings ADD CONSTRAINT ratings_tconst_fk FOREIGN KEY (tconst) REFERENCES movies (tconst);
ALTER TABLE credits ADD CONSTRAINT credits_tconst_fk FOREIGN KEY (tconst) REFERENCES movies (tconst);
ALTER TABLE credits ADD CONSTRAINT credits_nconst_fk FOREIGN KEY (nconst) REFERENCES people (nconst);

-- Fuzzy name search (search_titles / search_people tools)
CREATE INDEX movies_title_trgm ON movies USING gin (title gin_trgm_ops);
CREATE INDEX people_name_trgm  ON people USING gin (name gin_trgm_ops);

-- Common filters and joins
CREATE INDEX movies_year_idx       ON movies (year);
CREATE INDEX movies_genres_idx     ON movies USING gin (genres);
CREATE INDEX ratings_votes_idx     ON ratings (num_votes);
CREATE INDEX ratings_rating_idx    ON ratings (avg_rating);
CREATE INDEX credits_nconst_idx    ON credits (nconst, category);
CREATE INDEX credits_category_idx  ON credits (category, tconst);

ANALYZE movies;
ANALYZE ratings;
ANALYZE people;
ANALYZE credits;
