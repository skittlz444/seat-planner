-- Rename canvas_layouts to layouts
ALTER TABLE canvas_layouts RENAME TO layouts;

-- Add name column (existing 'default' row gets 'Layout 1')
ALTER TABLE layouts ADD COLUMN name TEXT NOT NULL DEFAULT 'Layout 1';

-- Add layout_id to tables so every table belongs to exactly one layout
ALTER TABLE tables ADD COLUMN layout_id TEXT NOT NULL DEFAULT 'default';
