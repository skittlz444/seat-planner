-- Reset the app database to an empty/default application state.
--
-- Usage:
--   wrangler d1 execute <database_name> --local --file=scripts/reset-default.sql
--   wrangler d1 execute <database_name> --remote --file=scripts/reset-default.sql
--
-- This intentionally clears application data only; it does not modify schema or
-- migration history. Deleting people also removes all arrival and shuttle state.

PRAGMA defer_foreign_keys = on;

BEGIN TRANSACTION;
DELETE FROM guests;
DELETE FROM tables;
DELETE FROM people;
DELETE FROM layouts;
DELETE FROM color_groups;

COMMIT;
PRAGMA defer_foreign_keys = off;
