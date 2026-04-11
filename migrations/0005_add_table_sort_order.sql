-- Add sort_order column to tables for drag-to-reorder support
ALTER TABLE tables ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Assign unique sequential sort_order values to existing tables
UPDATE tables SET sort_order = (
  SELECT COUNT(*) FROM tables AS t2
  WHERE LENGTH(t2.name) < LENGTH(tables.name)
     OR (LENGTH(t2.name) = LENGTH(tables.name) AND t2.name < tables.name)
);
