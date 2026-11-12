-- Run after restoring a dump: pg_dump preserves UNLOGGED source tables.
-- Convert parents first so foreign keys remain valid throughout the change.
-- Keep this atomic; a failed conversion must not leave mixed persistence.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.movies SET LOGGED;
ALTER TABLE public.people SET LOGGED;
ALTER TABLE public.ratings SET LOGGED;
ALTER TABLE public.credits SET LOGGED;
COMMIT;
