-- Reset the app database to an empty/default application state.
--
-- Usage:
--   wrangler d1 execute <database_name> --local --file=scripts/reset-default.sql
--   wrangler d1 execute <database_name> --remote --file=scripts/reset-default.sql
--
-- This intentionally clears application data only; it does not modify schema or
-- migration history. Deleting people also removes all arrival and shuttle state.
-- Colour groups are recreated with their default names.

PRAGMA defer_foreign_keys = on;

BEGIN TRANSACTION;
DELETE FROM guests;
DELETE FROM tables;
DELETE FROM people;
DELETE FROM layouts;
DELETE FROM color_groups;

INSERT INTO layouts (id, name, items, updated_at)
VALUES ('default', 'Main', '[]', datetime('now'));

INSERT INTO color_groups (hex, name) VALUES
  ('#3b82f6', 'Blue'),
  ('#ec4899', 'Pink'),
  ('#10b981', 'Green'),
  ('#8b5cf6', 'Purple'),
  ('#ef4444', 'Red'),
  ('#f59e0b', 'Amber'),
  ('#06b6d4', 'Cyan'),
  ('#6366f1', 'Indigo');

COMMIT;
PRAGMA defer_foreign_keys = off;
