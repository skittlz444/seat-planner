-- Add sort_order column to tables for drag-to-reorder support
ALTER TABLE tables ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Assign unique sequential sort_order values to existing tables
WITH ordered_tables AS (
  SELECT
    rowid,
    ROW_NUMBER() OVER (ORDER BY LENGTH(name), name, rowid) - 1 AS new_sort_order
  FROM tables
)
UPDATE tables
SET sort_order = (
  SELECT ordered_tables.new_sort_order
  FROM ordered_tables
  WHERE ordered_tables.rowid = tables.rowid
);
