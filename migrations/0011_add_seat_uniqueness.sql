-- Enforce that no two guests can occupy the same seat at the same table
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_seat
  ON guests(table_id, table_position)
  WHERE table_id IS NOT NULL AND table_position IS NOT NULL;
