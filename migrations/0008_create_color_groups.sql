-- Create color_groups table for naming color categories
CREATE TABLE IF NOT EXISTS color_groups (
  hex TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
