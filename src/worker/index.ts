import { Hono } from "hono";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Guest {
  id: string;
  name: string;
  color: string;
  table_id: string | null;
  table_position: number | null;
  arrived: number;
  shuttle_time: string | null;
  shuttle_checked: number;
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

// Get all guests
api.get("/guests", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, color, table_id, table_position, arrived, shuttle_time, shuttle_checked FROM guests ORDER BY CASE WHEN table_id IS NULL THEN 0 ELSE 1 END, table_id, table_position, name"
  ).all<Guest>();
  return c.json(results);
});

// Create a new guest
api.post("/guests", async (c) => {
  const { name, color } = await c.req.json<{ name: string; color: string }>();
  const id = generateId();

  await c.env.DB.prepare(
    "INSERT INTO guests (id, name, color, table_id) VALUES (?, ?, ?, NULL)"
  )
    .bind(id, name, color)
    .run();

  return c.json(
    {
      id,
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

// Move a guest to a table (or unassign)
api.put("/guests/:id/move", async (c) => {
  const guestId = c.req.param("id");
  const { tableId, position } = await c.req.json<{ tableId: string | null; position?: number }>();

  let tablePosition: number | null = null;
  
  if (tableId !== null) {
    // Get the table to know max_seats
    const tableRow = await c.env.DB.prepare(
      "SELECT max_seats FROM tables WHERE id = ?"
    ).bind(tableId).first<{ max_seats: number }>();

    if (!tableRow) {
      return c.json({ error: "Table not found" }, 404);
    }

    // Get all occupied positions for this table (excluding the guest being moved)
    const { results: occupied } = await c.env.DB.prepare(
      "SELECT table_position FROM guests WHERE table_id = ? AND id != ?"
    ).bind(tableId, guestId).all<{ table_position: number | null }>();

    const occupiedSet = new Set(
      occupied.map((r) => r.table_position).filter((p): p is number => p !== null)
    );

    // Determine the effective slot count (may exceed max_seats if table is overfull)
    const guestCount = occupied.length + 1; // +1 for the guest being moved
    const slotCount = Math.max(tableRow.max_seats, guestCount);

    if (position !== undefined && position !== null) {
      // Specific seat requested – validate
      if (!Number.isInteger(position) || position < 0 || position >= slotCount) {
        return c.json({ error: "Position out of range" }, 400);
      }
      if (occupiedSet.has(position)) {
        return c.json({ error: "Seat is already occupied" }, 409);
      }
      tablePosition = position;
    } else {
      // Find the first empty seat (only within max_seats for new assignments)
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

  // Use batch to run inside a transaction — the UNIQUE index on
  // (table_id, table_position) enforces that no two guests can
  // occupy the same seat even under concurrent requests.
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE guests SET table_id = ?, table_position = ? WHERE id = ?")
        .bind(tableId, tablePosition, guestId),
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

// Update a guest's name and/or color
api.put("/guests/:id", async (c) => {
  const guestId = c.req.param("id");
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
    await c.env.DB.prepare("UPDATE guests SET name = ?, color = ? WHERE id = ?")
      .bind(name.trim(), color, guestId)
      .run();
  } else if (name !== undefined) {
    await c.env.DB.prepare("UPDATE guests SET name = ? WHERE id = ?")
      .bind(name.trim(), guestId)
      .run();
  } else if (color !== undefined) {
    await c.env.DB.prepare("UPDATE guests SET color = ? WHERE id = ?")
      .bind(color, guestId)
      .run();
  }

  return c.json({ success: true });
});

// Bulk create guests
api.post("/guests/bulk", async (c) => {
  const body = await c.req.json<{ names: string[]; color: string }>();
  
  if (!body.names || !Array.isArray(body.names)) {
    return c.json({ error: "Names must be an array" }, 400);
  }
  
  if (!body.color || typeof body.color !== "string") {
    return c.json({ error: "Color is required" }, 400);
  }

  const { names, color } = body;
  const guests: Guest[] = [];
  const validNames = names.filter((name) => name && name.trim());

  if (validNames.length === 0) {
    return c.json({ error: "At least one valid name is required" }, 400);
  }

  // Use batch for better performance
  const statements = validNames.map((name) => {
    const id = generateId();
    guests.push({ id, name: name.trim(), color, table_id: null, table_position: null, arrived: 0, shuttle_time: null, shuttle_checked: 0 });
    return c.env.DB.prepare(
      "INSERT INTO guests (id, name, color, table_id, table_position, arrived, shuttle_time, shuttle_checked) VALUES (?, ?, ?, NULL, NULL, 0, NULL, 0)"
    ).bind(id, name.trim(), color);
  });

  await c.env.DB.batch(statements);

  return c.json(guests, 201);
});

// Delete a guest
api.delete("/guests/:id", async (c) => {
  const guestId = c.req.param("id");

  await c.env.DB.prepare("DELETE FROM guests WHERE id = ?").bind(guestId).run();

  return c.json({ success: true });
});

// Get all tables
api.get("/tables", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, nickname, max_seats, sort_order FROM tables ORDER BY sort_order, id"
  ).all<Table>();
  return c.json(results);
});

// Create a new table
api.post("/tables", async (c) => {
  const { name, maxSeats = 16 } = await c.req.json<{ name: string; maxSeats?: number }>();
  const id = generateId();

  // Get the max sort_order to place new table at end
  const { results: maxResult } = await c.env.DB.prepare(
    "SELECT MAX(sort_order) as max_order FROM tables"
  ).all<{ max_order: number | null }>();
  const sortOrder = (maxResult[0]?.max_order ?? -1) + 1;

  await c.env.DB.prepare("INSERT INTO tables (id, name, nickname, max_seats, sort_order) VALUES (?, ?, NULL, ?, ?)")
    .bind(id, name, maxSeats, sortOrder)
    .run();

  return c.json({ id, name, nickname: null, max_seats: maxSeats, sort_order: sortOrder }, 201);
});

// Reorder tables
api.put("/tables/reorder", async (c) => {
  const { tableIds } = await c.req.json<{ tableIds: string[] }>();

  if (!tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
    return c.json({ error: "tableIds must be a non-empty array" }, 400);
  }

  // Reject duplicate table IDs
  if (new Set(tableIds).size !== tableIds.length) {
    return c.json({ error: "tableIds must not contain duplicates" }, 400);
  }

  // Verify tableIds is a complete permutation of all tables
  const { results: allTables } = await c.env.DB.prepare(
    "SELECT id FROM tables"
  ).all<{ id: string }>();

  if (allTables.length !== tableIds.length) {
    return c.json({ error: "tableIds must include all tables" }, 400);
  }

  const allTableIdSet = new Set(allTables.map((t) => t.id));
  for (const id of tableIds) {
    if (!allTableIdSet.has(id)) {
      return c.json({ error: "Some table IDs do not exist" }, 400);
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

// Reorder guests within a table
api.put("/tables/:id/reorder", async (c) => {
  const tableId = c.req.param("id");
  const { guestIds } = await c.req.json<{ guestIds: string[] }>();

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return c.json({ error: "guestIds must be a non-empty array" }, 400);
  }

  // Reject duplicate guest IDs
  if (new Set(guestIds).size !== guestIds.length) {
    return c.json({ error: "guestIds must not contain duplicates" }, 400);
  }

  // Verify guestIds is a complete permutation of all guests at this table
  const { results: tableGuests } = await c.env.DB.prepare(
    "SELECT id FROM guests WHERE table_id = ?"
  ).bind(tableId).all<{ id: string }>();

  if (tableGuests.length !== guestIds.length) {
    return c.json({ error: "guestIds must include all guests assigned to this table" }, 400);
  }

  const tableGuestIdSet = new Set(tableGuests.map((g) => g.id));
  for (const id of guestIds) {
    if (!tableGuestIdSet.has(id)) {
      return c.json({ error: "Some guest IDs do not belong to this table" }, 400);
    }
  }

  const statements = guestIds.map((guestId, index) =>
    c.env.DB.prepare(
      "UPDATE guests SET table_position = ? WHERE id = ? AND table_id = ?"
    ).bind(index, guestId, tableId)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

// Delete a table (unassigns all guests)
api.delete("/tables/:id", async (c) => {
  const tableId = c.req.param("id");

  // First, unassign all guests from this table and reset their positions
  await c.env.DB.prepare("UPDATE guests SET table_id = NULL, table_position = NULL WHERE table_id = ?")
    .bind(tableId)
    .run();

  // Then delete the table
  await c.env.DB.prepare("DELETE FROM tables WHERE id = ?").bind(tableId).run();

  return c.json({ success: true });
});

// Get canvas layout
api.get("/canvas-layout", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT items FROM canvas_layouts WHERE id = 'default'"
  ).first<{ items: string }>();

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
    "INSERT OR REPLACE INTO canvas_layouts (id, items, updated_at) VALUES ('default', ?, datetime('now'))"
  )
    .bind(JSON.stringify(items))
    .run();

  return c.json({ success: true });
});

// Toggle guest arrival status
api.put("/guests/:id/arrive", async (c) => {
  const guestId = c.req.param("id");
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
    "UPDATE guests SET arrived = ? WHERE id = ?"
  )
    .bind(arrived ? 1 : 0, guestId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Guest not found" }, 404);
  }

  return c.json({ success: true });
});

// Update guest shuttle time
api.put("/guests/:id/shuttle", async (c) => {
  const guestId = c.req.param("id");
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

  // When removing shuttle time, also clear shuttle_checked so the guest
  // doesn't remain invisibly checked in the "No Shuttle Assigned" section.
  const sql = shuttleTime === null
    ? "UPDATE guests SET shuttle_time = NULL, shuttle_checked = 0 WHERE id = ?"
    : "UPDATE guests SET shuttle_time = ? WHERE id = ?";
  const result = await c.env.DB.prepare(sql)
    .bind(...(shuttleTime === null ? [guestId] : [shuttleTime.trim(), guestId]))
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Guest not found" }, 404);
  }

  return c.json({ success: true });
});

// Reset all arrivals
api.post("/guests/reset-arrivals", async (c) => {
  // Return current arrival states before resetting (for undo)
  const { results: arrivedGuests } = await c.env.DB.prepare(
    "SELECT id FROM guests WHERE arrived = 1"
  ).all<{ id: string }>();

  await c.env.DB.prepare("UPDATE guests SET arrived = 0").run();

  return c.json({ undoGuestIds: arrivedGuests.map((g) => g.id) });
});

// Undo reset arrivals (restore specific guests as arrived)
api.post("/guests/undo-reset-arrivals", async (c) => {
  const { guestIds } = await c.req.json<{ guestIds: string[] }>();

  if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
    return c.json({ error: "guestIds must be a non-empty array" }, 400);
  }

  const statements = guestIds.map((id) =>
    c.env.DB.prepare("UPDATE guests SET arrived = 1 WHERE id = ?").bind(id)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

// Toggle guest shuttle check status
api.put("/guests/:id/shuttle-check", async (c) => {
  const guestId = c.req.param("id");
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
    "UPDATE guests SET shuttle_checked = ? WHERE id = ?"
  )
    .bind(shuttleChecked ? 1 : 0, guestId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Guest not found" }, 404);
  }

  return c.json({ success: true });
});

// Reset all shuttle checks
api.post("/guests/reset-shuttle-checks", async (c) => {
  // Return current shuttle_checked states before resetting (for undo)
  const { results: checkedGuests } = await c.env.DB.prepare(
    "SELECT id FROM guests WHERE shuttle_checked = 1"
  ).all<{ id: string }>();

  await c.env.DB.prepare("UPDATE guests SET shuttle_checked = 0").run();

  return c.json({ undoGuestIds: checkedGuests.map((g) => g.id) });
});

// Undo reset shuttle checks (restore specific guests as checked)
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
    c.env.DB.prepare("UPDATE guests SET shuttle_checked = 1 WHERE id = ?").bind(id)
  );

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

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
