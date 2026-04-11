-- Create canvas_layouts table to persist layout state across sessions and devices
CREATE TABLE IF NOT EXISTS canvas_layouts (
  id TEXT PRIMARY KEY,
  items TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert the default layout row
INSERT OR IGNORE INTO canvas_layouts (id, items) VALUES ('default', '[]');
