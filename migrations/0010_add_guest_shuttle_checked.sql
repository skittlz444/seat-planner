-- Add shuttle_checked column to guests for shuttle attendance tracking
ALTER TABLE guests ADD COLUMN shuttle_checked INTEGER NOT NULL DEFAULT 0;
