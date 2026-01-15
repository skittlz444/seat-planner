-- Add table_position column to track the order of guests within each table
ALTER TABLE guests ADD COLUMN table_position INTEGER;
