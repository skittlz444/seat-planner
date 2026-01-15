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
}

interface Table {
  id: string;
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
    "SELECT id, name, color, table_id FROM guests ORDER BY name"
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

  return c.json({ id, name, color, table_id: null }, 201);
});

// Move a guest to a table (or unassign)
api.put("/guests/:id/move", async (c) => {
  const guestId = c.req.param("id");
  const { tableId } = await c.req.json<{ tableId: string | null }>();

  await c.env.DB.prepare("UPDATE guests SET table_id = ? WHERE id = ?")
    .bind(tableId, guestId)
    .run();

  return c.json({ success: true });
});

// Update a guest's name
api.put("/guests/:id", async (c) => {
  const guestId = c.req.param("id");
  const { name } = await c.req.json<{ name: string }>();

  if (!name || !name.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }

  await c.env.DB.prepare("UPDATE guests SET name = ? WHERE id = ?")
    .bind(name.trim(), guestId)
    .run();

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
    guests.push({ id, name: name.trim(), color, table_id: null });
    return c.env.DB.prepare(
      "INSERT INTO guests (id, name, color, table_id) VALUES (?, ?, ?, NULL)"
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
    "SELECT id, name FROM tables ORDER BY name"
  ).all<Table>();
  return c.json(results);
});

// Create a new table
api.post("/tables", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const id = generateId();

  await c.env.DB.prepare("INSERT INTO tables (id, name) VALUES (?, ?)")
    .bind(id, name)
    .run();

  return c.json({ id, name }, 201);
});

// Delete a table (unassigns all guests)
api.delete("/tables/:id", async (c) => {
  const tableId = c.req.param("id");

  // First, unassign all guests from this table
  await c.env.DB.prepare("UPDATE guests SET table_id = NULL WHERE table_id = ?")
    .bind(tableId)
    .run();

  // Then delete the table
  await c.env.DB.prepare("DELETE FROM tables WHERE id = ?").bind(tableId).run();

  return c.json({ success: true });
});

// Mount API routes
app.route("/api", api);

// Serve static assets for all non-API routes
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
