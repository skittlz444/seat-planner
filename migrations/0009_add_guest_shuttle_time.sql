-- Add shuttle_time column to guests for shuttle scheduling
ALTER TABLE guests ADD COLUMN shuttle_time TEXT DEFAULT NULL;
