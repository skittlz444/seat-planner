-- Add sort_order column to tables for drag-to-reorder support
ALTER TABLE tables ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
