-- Add arrived column to guests for attendance tracking
ALTER TABLE guests ADD COLUMN arrived INTEGER NOT NULL DEFAULT 0;
