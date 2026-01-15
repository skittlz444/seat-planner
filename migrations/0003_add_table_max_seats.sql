-- Add max_seats column to tables
ALTER TABLE tables ADD COLUMN max_seats INTEGER NOT NULL DEFAULT 16;
