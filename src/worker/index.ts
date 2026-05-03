import { Hono } from "hono";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

// Returned from GET /guests — person data joined with layout-specific seat assignment
interface GuestRow {
  id: string; // = person_id (the stable identifier for a person)
  name: string;
  color: string;
  arrived: number;
  shuttle_time: string | null;
  shuttle_checked: number;
  table_id: string | null;
  table_position: number | null;
}

interface Table {
  id: string;
  name: string;
  nickname: string | null;
  max_seats: number;
  sort_order: number;
}

interface ColorGroup {
  hex: string;
  name: string;
}

const app = new Hono<{ Bindings: Env }>();

// Generate a unique ID using crypto.randomUUID()
function generateId(): string {
  return crypto.randomUUID();
}

// API Routes
const api = new Hono<{ Bindings: Env }>();

// ── Layouts ──────────────────────────────────────────────────────────────────

// List all layouts
api.get("/layouts", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name FROM layouts ORDER BY rowid"
  ).all<{ id: string; name: string }>();
  return c.json(results);
});

// Create a new layout (optionally clone an existing one)
api.post("/layouts", async (c) => {
  const body = await c.req.json<{ name: string; cloneFrom?: string }>();
  const { name, cloneFrom } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return c.json({ error: "name must be a non-empty string" }, 400);
  }

  const newLayoutId = generateId();
  const trimmedName = name.trim();

  if (cloneFrom) {
    // Verify source layout exists
    const sourceLayout = await c.env.DB.prepare(
      "SELECT id, items FROM layouts WHERE id = ?"
    ).bind(cloneFrom).first<{ id: string; items: string }>();

    if (!sourceLayout) {
      return c.json({ error: "Source layout not found" }, 404);
    }

    // Fetch all tables in source layout
    const { results: sourceTables } = await c.env.DB.prepare(
      "SELECT id, name, nickname, max_seats, sort_order FROM tables WHERE layout_id = ?"
    ).bind(cloneFrom).all<Table>();

    // Build old→new table ID mapping
    const tableIdMap = new Map<string, string>();
    for (const t of sourceTables) {
      tableIdMap.set(t.id, generateId());
    }

    // Fetch seat assignments in source layout
    const { results: seatAssignments } = await c.env.DB.prepare(
      "SELECT id, person_id, table_id, table_position FROM guests WHERE layout_id = ?"
    ).bind(cloneFrom).all<{ id: string; person_id: string; table_id: string | null; table_position: number | null }>();

    // Remap tableIds in canvas items JSON by parsing and updating item references
    let clonedItems = "[]";
    try {
      const canvasItems = JSON.parse(sourceLayout.items) as Array<Record<string, unknown>>;
      const remapped = canvasItems.map((item) => {
        if (item.type === "table" && typeof item.tableId === "string" && tableIdMap.has(item.tableId)) {
          return { ...item, tableId: tableIdMap.get(item.tableId) };
        }
        return item;
      });
      clonedItems = JSON.stringify(remapped);
    } catch {
      clonedItems = "[]";
    }

    // Build batch statements
    const statements: D1PreparedStatement[] = [];

    // 1. Create new layout
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO layouts (id, name, items, updated_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(newLayoutId, trimmedName, clonedItems)
    );

    // 2. Clone tables
    for (const t of sourceTables) {
      const newTableId = tableIdMap.get(t.id)!;
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO tables (id, name, nickname, max_seats, sort_order, layout_id) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(newTableId, t.name, t.nickname, t.max_seats, t.sort_order, newLayoutId)
      );
    }

    // 3. Clone seat assignments (same person, new table IDs)
    for (const sa of seatAssignments) {
      const newSaId = generateId();
      const newTableId = sa.table_id ? (tableIdMap.get(sa.table_id) ?? null) : null;
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO guests (id, person_id, layout_id, table_id, table_position) VALUES (?, ?, ?, ?, ?)"
        ).bind(newSaId, sa.person_id, newLayoutId, newTableId, sa.table_position)
      );
    }

    await c.env.DB.batch(statements);
  } else {
    // Create empty layout
    await c.env.DB.prepare(
      "INSERT INTO layouts (id, name, items, updated_at) VALUES (?, ?, '[]', datetime('now'))"
    ).bind(newLayoutId, trimmedName).run();

    // Seed the new layout with a seat assignment for every existing person (unassigned)
    const { results: people } = await c.env.DB.prepare(
      "SELECT id FROM people"
    ).all<{ id: string }>();

    if (people.length > 0) {
      const statements = people.map((p) =>
        c.env.DB.prepare(
          "INSERT INTO guests (id, person_id, layout_id, table_id, table_position) VALUES (?, ?, ?, NULL, NULL)"
        ).bind(generateId(), p.id, newLayoutId)
      );
      await c.env.DB.batch(statements);
    }
  }

  return c.json({ id: newLayoutId, name: trimmedName }, 201);
});

// Rename a layout
api.put("/layouts/:id", async (c) => {
  const layoutId = c.req.param("id");
  const { name } = await c.req.json<{ name: string }>();

  if (!name || typeof name !== "string" || !name.trim()) {
    return c.json({ error: "name must be a non-empty string" }, 400);
  }

  const result = await c.env.DB.prepare(
    "UPDATE layouts SET name = ? WHERE id = ?"
  ).bind(name.trim(), layoutId).run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Layout not found" }, 404);
  }

  return c.json({ success: true });
});

// Delete a layout (forbidden when it is the only layout)
api.delete("/layouts/:id", async (c) => {
  const layoutId = c.req.param("id");

  // Prevent deleting the only layout
  const { results: all } = await c.env.DB.prepare(
    "SELECT id FROM layouts"
  ).all<{ id: string }>();

  if (all.length <= 1) {
    return c.json({ error: "Cannot delete the only layout" }, 400);
  }

  // Delete all seat assignments for this layout, then tables, then layout
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM guests WHERE layout_id = ?").bind(layoutId),
    c.env.DB.prepare("DELETE FROM tables WHERE layout_id = ?").bind(layoutId),
    c.env.DB.prepare("DELETE FROM layouts WHERE id = ?").bind(layoutId),
  ]);

  return c.json({ success: true });
});

// ── Guests (seat assignments joined with person data) ─────────────────────────

// Get all guests for a layout — returns person_id as `id`
api.get("/guests", async (c) => {
  const layoutId = c.req.query("layout") || "default";

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.color, p.arrived, p.shuttle_time, p.shuttle_checked,
            g.table_id, g.table_position
     FROM guests g
     JOIN people p ON g.person_id = p.id
     WHERE g.layout_id = ?
     ORDER BY CASE WHEN g.table_id IS NULL THEN 0 ELSE 1 END, g.table_id, g.table_position, p.name`
  ).bind(layoutId).all<GuestRow>();

  return c.json(results);
});

// Create a new guest (person + seat assignment for given layout)
api.post("/guests", async (c) => {
  const { name, color, layoutId: rawLayoutId } = await c.req.json<{ name: string; color: string; layoutId?: string }>();
  const layoutId = rawLayoutId || "default";

  const personId = generateId();
  const seatAssignmentId = generateId();

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO people (id, name, color) VALUES (?, ?, ?)"
    ).bind(personId, name, color),
    c.env.DB.prepare(
      "INSERT INTO guests (id, person_id, layout_id, table_id, table_position) VALUES (?, ?, ?, NULL, NULL)"
    ).bind(seatAssignmentId, personId, layoutId),
  ]);

  return c.json(
    {
      id: personId,
      name,
      color,
      table_id: null,
      table_position: null,
      arrived: 0,
      shuttle_time: null,
      shuttle_checked: 0,
    },
    201
  );
});

// Move a guest to a table (or unassign) — :id is the person_id
api.put("/guests/:id/move", async (c) => {
  const personId = c.req.param("id");
  const { tableId, position, layoutId: rawLayoutId } = await c.req.json<{ tableId: string | null; position?: number; layoutId?: string }>();
  const layoutId = rawLayoutId || "default";

  let tablePosition: number | null = null;

  if (tableId !== null) {
    const tableRow = await c.env.DB.prepare(
      "SELECT max_seats FROM tables WHERE id = ?"
    ).bind(tableId).first<{ max_seats: number }>();

    if (!tableRow) {
      return c.json({ error: "Table not found" }, 404);
    }

    const { results: occupied } = await c.env.DB.prepare(
      "SELECT g.person_id, g.table_position FROM guests g WHERE g.table_id = ? AND g.person_id != ?"
    ).bind(tableId, personId).all<{ person_id: string; table_position: number | null }>();

    const occupiedPositions = occupied
      .map((r) => r.table_position)
      .filter((p): p is number => p !== null);
    const occupiedSet = new Set(occupiedPositions);

    const guestCount = occupied.length + 1;
    const maxOccupiedPosition = occupiedPositions.reduce((max, pos) => Math.max(max, pos), -1);
    const slotCount = Math.max(tableRow.max_seats, guestCount, maxOccupiedPosition + 1);

    if (position !== undefined && position !== null) {
      if (!Number.isInteger(position) || position < 0 || position >= slotCount) {
        return c.json({ error: "Position out of range" }, 400);
      }

      if (occupiedSet.has(position)) {
        const currentGuest = await c.env.DB.prepare(
          "SELECT table_id, table_position FROM guests WHERE person_id = ? AND layout_id = ?"
        ).bind(personId, layoutId).first<{ table_id: string | null; table_position: number | null }>();

        if (!currentGuest || currentGuest.table_id !== tableId) {
          return c.json({ error: "Seat is already occupied" }, 409);
        }

        const targetGuest = occupied.find((r) => r.table_position === position);
        if (!targetGuest) {
          return c.json({ error: "Seat is already occupied" }, 409);
        }

        const oldPosition = currentGuest.table_position;

        try {
          await c.env.DB.batch([
            c.env.DB.prepare("UPDATE guests SET table_position = -1 WHERE person_id = ? AND layout_id = ?")
              .bind(targetGuest.person_id, layoutId),
            c.env.DB.prepare("UPDATE guests SET table_position = ? WHERE person_id = ? AND layout_id = ?")
              .bind(position, personId, layoutId),
            c.env.DB.prepare("UPDATE guests SET table_position = ? WHERE person_id = ? AND layout_id = ?")
              .bind(oldPosition, targetGuest.person_id, layoutId),
          ]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("UNIQUE constraint failed")) {
            return c.json({ error: "Seat swap failed due to conflict" }, 409);
          }
          throw err;
        }

        return c.json({ success: true, position });
      }

      tablePosition = position;
    } else {
      for (let i = 0; i < tableRow.max_seats; i++) {
        if (!occupiedSet.has(i)) {
          tablePosition = i;
          break;
        }
      }
      if (tablePosition === null) {
        return c.json({ error: "Table is full" }, 409);
      }
    }
  }

  try {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE guests SET table_id = ?, table_position = ? WHERE person_id = ? AND layout_id = ?")
        .bind(tableId, tablePosition, personId, layoutId),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Seat is already occupied" }, 409);
    }
    throw err;
  }

  return c.json({ success: true, position: tablePosition });
});

// Update a guest's name and/or color — :id is the person_id
api.put("/guests/:id", async (c) => {
  const personId = c.req.param("id");
  const { name, color } = await c.req.json<{ name?: string; color?: string }>();

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return c.json({ error: "Name must be a non-empty string" }, 400);
  }

  if (color !== undefined && (typeof color !== "string" || !color.trim())) {
    return c.json({ error: "Color must be a non-empty string" }, 400);
  }

  if (name === undefined && color === undefined) {
    return c.json({ error: "At least one of name or color is required" }, 400);
  }

  if (name !== undefined && color !== undefined) {
    await c.env.DB.prepare("UPDATE people SET name = ?, color = ? WHERE id = ?")
      .bind(name.trim(), color, personId)
      .run();
  } else if (name !== undefined) {
    await c.env.DB.prepare("UPDATE people SET name = ? WHERE id = ?")
      .bind(name.trim(), personId)
      .run();
  } else if (color !== undefined) {
    await c.env.DB.prepare("UPDATE people SET color = ? WHERE id = ?")
      .bind(color, personId)
      .run();
  }

  return c.json({ success: true });
});

// Bulk create guests
api.post("/guests/bulk", async (c) => {
  const body = await c.req.json<{ names: string[]; color: string; layoutId?: string }>();

  if (!body.names || !Array.isArray(body.names)) {
    return c.json({ error: "Names must be an array" }, 400);
  }

  if (!body.color || typeof body.color !== "string") {
    return c.json({ error: "Color is required" }, 400);
  }

  const { names, color, layoutId: rawLayoutId } = body;
  const layoutId = rawLayoutId || "default";
  const validNames = names.filter((name) => name && name.trim());

  if (validNames.length === 0) {
    return c.json({ error: "At least one valid name is required" }, 400);
  }

  const guests: Array<{ id: string; name: string; color: string; table_id: null; table_position: null; arrived: number; shuttle_time: null; shuttle_checked: number }> = [];

  const statements = validNames.flatMap((name) => {
    const personId = generateId();
    const seatAssignmentId = generateId();
    guests.push({ id: personId, name: name.trim(), color, table_id: null, table_position: null, arrived: 0, shuttle_time: null, shuttle_checked: 0 });
    return [
      c.env.DB.prepare(
        "INSERT INTO people (id, name, color) VALUES (?, ?, ?)"
      ).bind(personId, name.trim(), color),
      c.env.DB.prepare(
        "INSERT INTO guests (id, person_id, layout_id, table_id, table_position) VALUES (?, ?, ?, NULL, NULL)"
      ).bind(seatAssignmentId, personId, layoutId),
    ];
  });

  await c.env.DB.batch(statements);

  return c.json(guests, 201);
});

// Delete a guest — :id is person_id; removes the person and all their seat assignments
api.delete("/guests/:id", async (c) => {
  const personId = c.req.param("id");

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM guests WHERE person_id = ?").bind(personId),
    c.env.DB.prepare("DELETE FROM people WHERE id = ?").bind(personId),
  ]);

  return c.json({ success: true });
});

// ── Tables ────────────────────────────────────────────────────────────────────

// Get all tables for a layout
api.get("/tables", async (c) => {
  const layoutId = c.req.query("layout") || "default";

  const { results } = await c.env.DB.prepare(
    "SELECT id, name, nickname, max_seats, sort_order FROM tables WHERE layout_id = ? ORDER BY sort_order, id"
  ).bind(layoutId).all<Table>();
  return c.json(results);
});

// Create a new table
api.post("/tables", async (c) => {
  const { name, maxSeats = 16, layoutId: rawLayoutId } = await c.req.json<{ name: string; maxSeats?: number; layoutId?: string }>();
  const layoutId = rawLayoutId || "default";

  if (typeof maxSeats !== "number" || !Number.isFinite(maxSeats) || !Number.isInteger(maxSeats) || maxSeats < 1) {
    return c.json({ error: "maxSeats must be a finite integer >= 1" }, 400);
  }

  const id = generateId();

  const { results: maxResult } = await c.env.DB.prepare(
    "SELECT MAX(sort_order) as max_order FROM tables WHERE layout_id = ?"
  ).bind(layoutId).all<{ max_order: number | null }>();
  const sortOrder = (maxResult[0]?.max_order ?? -1) + 1;

  await c.env.DB.prepare("INSERT INTO tables (id, name, nickname, max_seats, sort_order, layout_id) VALUES (?, ?, NULL, ?, ?, ?)")
    .bind(id, name, maxSeats, sortOrder, layoutId)
    .run();

  return c.json({ id, name, nickname: null, max_seats: maxSeats, sort_order: sortOrder }, 201);
});

// Reorder tables within a layout
api.put("/tables/reorder", async (c) => {
  const { tableIds, layoutId: rawLayoutId } = await c.req.json<{ tableIds: string[]; layoutId?: string }>();
  const layoutId = rawLayoutId || "default";

  if (!tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
    return c.json({ error: "tableIds must be a non-empty array" }, 400);
  }

  if (new Set(tableIds).size !== tableIds.length) {
    return c.json({ error: "tableIds must not contain duplicates" }, 400);
  }

  const { results: allTables } = await c.env.DB.prepare(
    "SELECT id FROM tables WHERE layout_id = ?"
  ).bind(layoutId).all<{ id: string }>();

  if (allTables.length !== tableIds.length) {
    return c.json({ error: "tableIds must include all tables in this layout" }, 400);
  }

  const allTableIdSet = new Set(allTables.map((t) => t.id));
  for (const id of tableIds) {
    if (!allTableIdSet.has(id)) {
      return c.json({ error: "Some table IDs do not exist in this layout" }, 400);
    }
  }

  const statements = tableIds.map((tableId, index) =>
    c.env.DB.prepare(
      "UPDATE tables SET sort_order = ?, name = ? WHERE id = ?"
    ).bind(index, `Table ${index + 1}`, tableId)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

// Update a table's properties (max_seats and/or nickname)
api.put("/tables/:id", async (c) => {
  const tableId = c.req.param("id");
  const body = await c.req.json<{ maxSeats?: number; nickname?: string | null }>();

  const { maxSeats, nickname } = body;

  if (
    maxSeats !== undefined &&
    (typeof maxSeats !== "number" ||
      !Number.isFinite(maxSeats) ||
      !Number.isInteger(maxSeats))
  ) {
    return c.json({ error: "maxSeats must be a finite integer" }, 400);
  }

  if (maxSeats !== undefined && maxSeats < 1) {
    return c.json({ error: "maxSeats must be at least 1" }, 400);
  }

  if (nickname !== undefined && nickname !== null && typeof nickname !== "string") {
    return c.json({ error: "nickname must be a string or null" }, 400);
  }

  const trimmedNickname = nickname !== undefined
    ? (nickname !== null ? nickname.trim() || null : null)
    : undefined;

  if (maxSeats !== undefined && trimmedNickname !== undefined) {
    await c.env.DB.prepare("UPDATE tables SET max_seats = ?, nickname = ? WHERE id = ?")
      .bind(maxSeats, trimmedNickname, tableId)
      .run();
  } else if (maxSeats !== undefined) {
    await c.env.DB.prepare("UPDATE tables SET max_seats = ? WHERE id = ?")
      .bind(maxSeats, tableId)
      .run();
  } else if (trimmedNickname !== undefined) {
    await c.env.DB.prepare("UPDATE tables SET nickname = ? WHERE id = ?")
      .bind(trimmedNickname, tableId)
      .run();
  } else {
    return c.json({ error: "At least one of maxSeats or nickname is required" }, 400);
  }

  return c.json({ success: true });
});

// Reorder guests within a table — guestIds are person_ids
api.put("/tables/:id/reorder", async (c) => {
  const tableId = c.req.param("id");
  const { guestIds } = await c.req.json<{ guestIds: string[] }>();

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return c.json({ error: "guestIds must be a non-empty array" }, 400);
  }

  if (new Set(guestIds).size !== guestIds.length) {
    return c.json({ error: "guestIds must not contain duplicates" }, 400);
  }

  const { results: tableGuests } = await c.env.DB.prepare(
    "SELECT person_id FROM guests WHERE table_id = ?"
  ).bind(tableId).all<{ person_id: string }>();

  if (tableGuests.length !== guestIds.length) {
    return c.json({ error: "guestIds must include all guests assigned to this table" }, 400);
  }

  const tableGuestPersonIdSet = new Set(tableGuests.map((g) => g.person_id));
  for (const id of guestIds) {
    if (!tableGuestPersonIdSet.has(id)) {
      return c.json({ error: "Some guest IDs do not belong to this table" }, 400);
    }
  }

  const statements = guestIds.map((personId, index) =>
    c.env.DB.prepare(
      "UPDATE guests SET table_position = ? WHERE person_id = ? AND table_id = ?"
    ).bind(index, personId, tableId)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

// Delete a table (unassigns all seat assignments for this table)
api.delete("/tables/:id", async (c) => {
  const tableId = c.req.param("id");

  await c.env.DB.prepare("UPDATE guests SET table_id = NULL, table_position = NULL WHERE table_id = ?")
    .bind(tableId)
    .run();

  await c.env.DB.prepare("DELETE FROM tables WHERE id = ?").bind(tableId).run();

  return c.json({ success: true });
});

// ── Canvas layout ─────────────────────────────────────────────────────────────

// Get canvas layout for a layout
api.get("/canvas-layout", async (c) => {
  const layoutId = c.req.query("layout") || "default";

  const result = await c.env.DB.prepare(
    "SELECT items FROM layouts WHERE id = ?"
  ).bind(layoutId).first<{ items: string }>();

  if (!result) {
    return c.json([]);
  }

  try {
    return c.json(JSON.parse(result.items));
  } catch {
    return c.json([]);
  }
});

// Save canvas layout
api.put("/canvas-layout", async (c) => {
  const layoutId = c.req.query("layout") || "default";
  const items = await c.req.json();

  if (!Array.isArray(items)) {
    return c.json({ error: "Items must be an array" }, 400);
  }

  const VALID_TYPES = new Set(["table", "text", "line", "rect"]);

  for (const item of items) {
    if (!item || typeof item !== "object") {
      return c.json({ error: "Each item must be an object" }, 400);
    }
    if (typeof item.id !== "string" || !VALID_TYPES.has(item.type)) {
      return c.json({ error: "Each item must have a string id and a valid type (table, text, line, rect)" }, 400);
    }
    if (item.type === "table") {
      if (typeof item.tableId !== "string" || typeof item.x !== "number" || typeof item.y !== "number" || typeof item.rotation !== "number") {
        return c.json({ error: "Table items require string tableId and numeric x, y, rotation" }, 400);
      }
      if (item.width !== undefined && (!Number.isFinite(item.width) || item.width <= 0)) {
        return c.json({ error: "Table item width must be a finite positive number when provided" }, 400);
      }
    } else if (item.type === "text") {
      if (typeof item.x !== "number" || typeof item.y !== "number" || typeof item.text !== "string") {
        return c.json({ error: "Text items require numeric x, y and string text" }, 400);
      }
    } else if (item.type === "line") {
      if (typeof item.x1 !== "number" || typeof item.y1 !== "number" || typeof item.x2 !== "number" || typeof item.y2 !== "number") {
        return c.json({ error: "Line items require numeric x1, y1, x2, y2" }, 400);
      }
    } else if (item.type === "rect") {
      if (typeof item.x !== "number" || typeof item.y !== "number" || typeof item.width !== "number" || typeof item.height !== "number") {
        return c.json({ error: "Rect items require numeric x, y, width, height" }, 400);
      }
    }
  }

  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO layouts (id, items, updated_at) VALUES (?, ?, datetime('now'))"
  )
    .bind(layoutId, JSON.stringify(items))
    .run();

  return c.json({ success: true });
});

// ── Arrival tracking ──────────────────────────────────────────────────────────

// Toggle guest arrival status — :id is person_id
api.put("/guests/:id/arrive", async (c) => {
  const personId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).arrived !== "boolean"
  ) {
    return c.json({ error: "arrived must be a boolean" }, 400);
  }

  const arrived = (body as { arrived: boolean }).arrived;

  const result = await c.env.DB.prepare(
    "UPDATE people SET arrived = ? WHERE id = ?"
  )
    .bind(arrived ? 1 : 0, personId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Guest not found" }, 404);
  }

  return c.json({ success: true });
});

// Reset all arrivals
api.post("/guests/reset-arrivals", async (c) => {
  const { results: arrivedPeople } = await c.env.DB.prepare(
    "SELECT id FROM people WHERE arrived = 1"
  ).all<{ id: string }>();

  await c.env.DB.prepare("UPDATE people SET arrived = 0").run();

  return c.json({ undoGuestIds: arrivedPeople.map((p) => p.id) });
});

// Undo reset arrivals
api.post("/guests/undo-reset-arrivals", async (c) => {
  const { guestIds } = await c.req.json<{ guestIds: string[] }>();

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return c.json({ error: "guestIds must be a non-empty array" }, 400);
  }

  const statements = guestIds.map((id) =>
    c.env.DB.prepare("UPDATE people SET arrived = 1 WHERE id = ?").bind(id)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

// ── Shuttle tracking ──────────────────────────────────────────────────────────

// Update guest shuttle time — :id is person_id
api.put("/guests/:id/shuttle", async (c) => {
  const personId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("shuttle_time" in body)
  ) {
    return c.json({ error: "shuttle_time is required" }, 400);
  }

  const shuttleTime = (body as { shuttle_time: string | null }).shuttle_time;

  if (shuttleTime !== null && (typeof shuttleTime !== "string" || !shuttleTime.trim())) {
    return c.json({ error: "shuttle_time must be a non-empty string or null" }, 400);
  }

  const sql = shuttleTime === null
    ? "UPDATE people SET shuttle_time = NULL, shuttle_checked = 0 WHERE id = ?"
    : "UPDATE people SET shuttle_time = ? WHERE id = ?";
  const result = await c.env.DB.prepare(sql)
    .bind(...(shuttleTime === null ? [personId] : [shuttleTime.trim(), personId]))
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Guest not found" }, 404);
  }

  return c.json({ success: true });
});

// Toggle guest shuttle check status — :id is person_id
api.put("/guests/:id/shuttle-check", async (c) => {
  const personId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).shuttle_checked !== "boolean"
  ) {
    return c.json({ error: "shuttle_checked must be a boolean" }, 400);
  }

  const shuttleChecked = (body as { shuttle_checked: boolean }).shuttle_checked;

  const result = await c.env.DB.prepare(
    "UPDATE people SET shuttle_checked = ? WHERE id = ?"
  )
    .bind(shuttleChecked ? 1 : 0, personId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Guest not found" }, 404);
  }

  return c.json({ success: true });
});

// Reset all shuttle checks
api.post("/guests/reset-shuttle-checks", async (c) => {
  const { results: checkedPeople } = await c.env.DB.prepare(
    "SELECT id FROM people WHERE shuttle_checked = 1"
  ).all<{ id: string }>();

  await c.env.DB.prepare("UPDATE people SET shuttle_checked = 0").run();

  return c.json({ undoGuestIds: checkedPeople.map((p) => p.id) });
});

// Undo reset shuttle checks
api.post("/guests/undo-reset-shuttle-checks", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("guestIds" in body)
  ) {
    return c.json({ error: "guestIds is required" }, 400);
  }

  const { guestIds } = body as { guestIds: unknown };

  if (!Array.isArray(guestIds) || guestIds.length === 0 || !guestIds.every((id) => typeof id === "string")) {
    return c.json({ error: "guestIds must be a non-empty array of strings" }, 400);
  }

  const statements = (guestIds as string[]).map((id) =>
    c.env.DB.prepare("UPDATE people SET shuttle_checked = 1 WHERE id = ?").bind(id)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

// ── Color groups ──────────────────────────────────────────────────────────────

// Get all color groups
api.get("/color-groups", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT hex, name FROM color_groups ORDER BY name"
  ).all<ColorGroup>();
  return c.json(results);
});

// Upsert a color group
api.put("/color-groups/:hex", async (c) => {
  const hex = decodeURIComponent(c.req.param("hex")).toLowerCase();

  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    return c.json({ error: "hex must be a valid 6-digit hex color (e.g. #ff00aa)" }, 400);
  }

  const { name } = await c.req.json<{ name: string }>();

  if (!name || typeof name !== "string" || !name.trim()) {
    return c.json({ error: "Name must be a non-empty string" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO color_groups (hex, name) VALUES (?, ?)"
  )
    .bind(hex, name.trim())
    .run();

  return c.json({ hex, name: name.trim() });
});

// Delete a color group
api.delete("/color-groups/:hex", async (c) => {
  const hex = decodeURIComponent(c.req.param("hex"));

  await c.env.DB.prepare("DELETE FROM color_groups WHERE hex = ?")
    .bind(hex)
    .run();

  return c.json({ success: true });
});

// Mount API routes
app.route("/api", api);

// Serve static assets for all non-API routes
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
