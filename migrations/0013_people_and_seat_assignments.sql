-- Create people table: shared guest roster independent of seating layouts
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  arrived INTEGER NOT NULL DEFAULT 0,
  shuttle_time TEXT DEFAULT NULL,
  shuttle_checked INTEGER NOT NULL DEFAULT 0
);

-- Populate people from existing guests
INSERT INTO people (id, name, color, arrived, shuttle_time, shuttle_checked)
SELECT id, name, color, arrived, shuttle_time, shuttle_checked FROM guests;

-- Add person_id to guests (links a seat assignment back to the person)
ALTER TABLE guests ADD COLUMN person_id TEXT;

-- Add layout_id to guests (each seat assignment belongs to one layout)
ALTER TABLE guests ADD COLUMN layout_id TEXT NOT NULL DEFAULT 'default';

-- Link existing guest rows to their corresponding person record
UPDATE guests SET person_id = id;

-- Drop person-level columns now stored in people
ALTER TABLE guests DROP COLUMN name;
ALTER TABLE guests DROP COLUMN color;
ALTER TABLE guests DROP COLUMN arrived;
ALTER TABLE guests DROP COLUMN shuttle_time;
ALTER TABLE guests DROP COLUMN shuttle_checked;

-- Indexes for layout-scoped lookups
CREATE INDEX IF NOT EXISTS idx_guests_layout_id ON guests(layout_id);
CREATE INDEX IF NOT EXISTS idx_guests_person_id ON guests(person_id);
