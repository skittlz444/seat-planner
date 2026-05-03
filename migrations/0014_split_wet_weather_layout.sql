-- Split the temporary "everything on one canvas" wet-weather workaround into
-- first-class layouts.
--
-- Assumptions from the interim production data:
--   * The original/default layout is still the main layout.
--   * Wet-weather tables are the tables created after table 9, i.e. tables with
--     sort_order >= 9.
--   * The canvas stored in the default layout contains both layouts side by side.
--     Wet-weather drawing elements live in the right-hand canvas area (x/x1/x2
--     >= 1700), and wet-weather table elements reference the moved table IDs.

-- Create the wet-weather layout with a stable ID.
INSERT OR IGNORE INTO layouts (id, name, items, updated_at)
VALUES ('wet-weather', 'Wet Weather', '[]', datetime('now'));

-- Give the original layout a user-facing name now that layouts are named.
UPDATE layouts
SET name = 'Main'
WHERE id = 'default' AND name = 'Layout 1';

-- Move all tables after table 9 into the wet-weather layout. Keep table IDs
-- intact so existing seat assignments and canvas table references remain valid.
UPDATE tables
SET
  layout_id = 'wet-weather',
  sort_order = sort_order - 9
WHERE layout_id = 'default'
  AND sort_order >= 9;

-- Re-scope assignments seated at wet-weather tables into the wet-weather layout.
UPDATE guests
SET layout_id = 'wet-weather'
WHERE table_id IN (
  SELECT id FROM tables WHERE layout_id = 'wet-weather'
);

-- If the interim workaround duplicated guest rows, migration 0013 temporarily
-- created duplicate people too. Re-point wet-weather assignments to the matching
-- main-layout person when there is an exact normalized-name + color match.
--
-- Before repointing, preserve person-level state onto the canonical main person
-- where possible.
UPDATE people
SET
  arrived = CASE
    WHEN arrived = 1 OR EXISTS (
      SELECT 1
      FROM guests AS wet_guest
      JOIN people AS wet_person ON wet_person.id = wet_guest.person_id
      WHERE wet_guest.layout_id = 'wet-weather'
        AND lower(trim(wet_person.name)) = lower(trim(people.name))
        AND wet_person.color = people.color
        AND wet_person.arrived = 1
    )
    THEN 1 ELSE arrived
  END,
  shuttle_time = COALESCE(
    shuttle_time,
    (
      SELECT wet_person.shuttle_time
      FROM guests AS wet_guest
      JOIN people AS wet_person ON wet_person.id = wet_guest.person_id
      WHERE wet_guest.layout_id = 'wet-weather'
        AND lower(trim(wet_person.name)) = lower(trim(people.name))
        AND wet_person.color = people.color
        AND wet_person.shuttle_time IS NOT NULL
      LIMIT 1
    )
  ),
  shuttle_checked = CASE
    WHEN shuttle_checked = 1 OR EXISTS (
      SELECT 1
      FROM guests AS wet_guest
      JOIN people AS wet_person ON wet_person.id = wet_guest.person_id
      WHERE wet_guest.layout_id = 'wet-weather'
        AND lower(trim(wet_person.name)) = lower(trim(people.name))
        AND wet_person.color = people.color
        AND wet_person.shuttle_checked = 1
    )
    THEN 1 ELSE shuttle_checked
  END
WHERE EXISTS (
  SELECT 1
  FROM guests AS main_guest
  WHERE main_guest.layout_id = 'default'
    AND main_guest.person_id = people.id
);

UPDATE guests
SET person_id = (
  SELECT main_guest.person_id
  FROM guests AS main_guest
  JOIN people AS main_person ON main_person.id = main_guest.person_id
  JOIN people AS wet_person ON wet_person.id = guests.person_id
  WHERE main_guest.layout_id = 'default'
    AND lower(trim(main_person.name)) = lower(trim(wet_person.name))
    AND main_person.color = wet_person.color
  ORDER BY main_guest.rowid
  LIMIT 1
)
WHERE layout_id = 'wet-weather'
  AND EXISTS (
    SELECT 1
    FROM guests AS main_guest
    JOIN people AS main_person ON main_person.id = main_guest.person_id
    JOIN people AS wet_person ON wet_person.id = guests.person_id
    WHERE main_guest.layout_id = 'default'
      AND lower(trim(main_person.name)) = lower(trim(wet_person.name))
      AND main_person.color = wet_person.color
  );

-- Remove duplicate people that are no longer referenced by any layout.
DELETE FROM people
WHERE id NOT IN (SELECT DISTINCT person_id FROM guests);

-- Split canvas items. A canvas item belongs to Wet Weather if either:
--   * it is a table item for one of the moved wet-weather table IDs, or
--   * it is a drawing/text item in the right-hand wet-weather canvas area.
UPDATE layouts
SET items = COALESCE(
  (
    SELECT json_group_array(json(value))
    FROM json_each((SELECT items FROM layouts WHERE id = 'default'))
    WHERE (
      json_extract(value, '$.type') = 'table'
      AND json_extract(value, '$.tableId') IN (
        SELECT id FROM tables WHERE layout_id = 'wet-weather'
      )
    )
    OR COALESCE(
      json_extract(value, '$.x'),
      json_extract(value, '$.x1'),
      json_extract(value, '$.x2'),
      0
    ) >= 1700
    OR COALESCE(json_extract(value, '$.x2'), 0) >= 1700
  ),
  '[]'
)
WHERE id = 'wet-weather';

UPDATE layouts
SET items = COALESCE(
  (
    SELECT json_group_array(json(value))
    FROM json_each((SELECT items FROM layouts WHERE id = 'default'))
    WHERE NOT (
      (
        json_extract(value, '$.type') = 'table'
        AND json_extract(value, '$.tableId') IN (
          SELECT id FROM tables WHERE layout_id = 'wet-weather'
        )
      )
      OR COALESCE(
        json_extract(value, '$.x'),
        json_extract(value, '$.x1'),
        json_extract(value, '$.x2'),
        0
      ) >= 1700
      OR COALESCE(json_extract(value, '$.x2'), 0) >= 1700
    )
  ),
  '[]'
)
WHERE id = 'default';
