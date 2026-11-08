-- Cinequery schema: four tables built from IMDb's public TSV dumps.
-- Idempotent: safe to re-run; drops and recreates the movie tables.
-- Indexes and foreign keys live in db/indexes.sql and are added after the bulk load.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS credits;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS people;
DROP TABLE IF EXISTS movies;

-- movies ---------------------------------------------------------------
CREATE TABLE movies (
  tconst      text PRIMARY KEY,
  title       text NOT NULL,
  year        smallint,
  runtime_min smallint,
  genres      text[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE movies IS
  'One row per feature film with at least 1,000 IMDb votes (from title.basics, titleType = movie).';
COMMENT ON COLUMN movies.tconst IS
  'IMDb title id, e.g. tt0111161. Primary key; joins to ratings.tconst and credits.tconst.';
COMMENT ON COLUMN movies.title IS
  'Primary (usually English-language release) title. Not unique: remakes share titles, so disambiguate with year.';
COMMENT ON COLUMN movies.year IS
  'Release year (startYear). NULL when unknown. Use for decade math: (year / 10) * 10.';
COMMENT ON COLUMN movies.runtime_min IS
  'Runtime in minutes. NULL when unknown; filter out NULLs before averaging.';
COMMENT ON COLUMN movies.genres IS
  'Up to three IMDb genres as a text array, e.g. {Drama,Crime}. Filter with ''Horror'' = ANY(genres). Genres are capitalized.';

-- ratings --------------------------------------------------------------
CREATE TABLE ratings (
  tconst     text PRIMARY KEY,
  avg_rating numeric(3,1) NOT NULL,
  num_votes  integer NOT NULL
);

COMMENT ON TABLE ratings IS
  'IMDb user rating for each movie (from title.ratings). Exactly one row per movie.';
COMMENT ON COLUMN ratings.tconst IS
  'IMDb title id. Primary key and foreign key to movies.tconst.';
COMMENT ON COLUMN ratings.avg_rating IS
  'Weighted average user rating from 1.0 to 10.0, one decimal place.';
COMMENT ON COLUMN ratings.num_votes IS
  'Number of user votes. Always >= 1000 in this database. Use thresholds like num_votes >= 100000 for well-known films.';

-- people ---------------------------------------------------------------
CREATE TABLE people (
  nconst      text PRIMARY KEY,
  name        text NOT NULL,
  birth_year  smallint,
  death_year  smallint,
  professions text[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE people IS
  'Cast and crew credited on at least one movie in this database (from name.basics).';
COMMENT ON COLUMN people.nconst IS
  'IMDb person id, e.g. nm0634240. Primary key; joins to credits.nconst.';
COMMENT ON COLUMN people.name IS
  'Display name. NOT unique (several people can share a name), so resolve to an nconst before aggregating.';
COMMENT ON COLUMN people.birth_year IS
  'Birth year, NULL when unknown.';
COMMENT ON COLUMN people.death_year IS
  'Death year, NULL when the person is alive or the year is unknown.';
COMMENT ON COLUMN people.professions IS
  'Up to three primary professions as a text array, lowercase, e.g. {director,writer,producer}.';

-- credits --------------------------------------------------------------
CREATE TABLE credits (
  tconst     text NOT NULL,
  nconst     text NOT NULL,
  category   text NOT NULL,
  characters text[],
  ordering   smallint NOT NULL,
  PRIMARY KEY (tconst, ordering)
);

COMMENT ON TABLE credits IS
  'Principal cast and crew for each movie (from title.principals): who worked on which movie and in what role.';
COMMENT ON COLUMN credits.tconst IS
  'Movie id; foreign key to movies.tconst.';
COMMENT ON COLUMN credits.nconst IS
  'Person id; foreign key to people.nconst.';
COMMENT ON COLUMN credits.category IS
  'Role on this movie, lowercase: actor, actress, director, writer, producer, composer, cinematographer, editor, production_designer, casting_director, self, archive_footage. Actors are split into actor and actress; use category IN (''actor'',''actress'') for all cast.';
COMMENT ON COLUMN credits.characters IS
  'Character names played (actors only) as a text array, e.g. {Ellis Boyd ''Red'' Redding}. NULL for crew.';
COMMENT ON COLUMN credits.ordering IS
  'Billing order within the movie, starting at 1. Lower is more prominent; ordering <= 3 approximates top-billed.';
