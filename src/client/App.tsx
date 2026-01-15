import { useState, useEffect, useCallback } from "react";
import { Plus, Users, GripVertical, Search, Trash2 } from "lucide-react";

// Configuration constants
const MAX_GUESTS_PER_TABLE = 16;

interface Guest {
  id: string;
  name: string;
  color: string;
  table_id: string | null;
}

interface Table {
  id: string;
  name: string;
  guests: Guest[];
}

interface GroupColor {
  name: string;
  hex: string;
}

const App = () => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestColor, setNewGuestColor] = useState("#3b82f6");
  const [draggedGuestId, setDraggedGuestId] = useState<{
    guestId: string;
    fromTableId: string | null;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const groupColors: GroupColor[] = [
    { name: "Singapore - Hayden", hex: "#3b82f6" },
    { name: "Singapore - Taryn", hex: "#ec4899" },
    { name: "Sydney - Hayden", hex: "#10b981" },
    { name: "Family - Hayden", hex: "#8b5cf6" },
    { name: "Family - Taryn", hex: "#ef4444" },
    { name: "KKU - Taryn", hex: "#f59e0b" },
    { name: "UP - Taryn", hex: "#06b6d4" },
    { name: "UDIS - Taryn", hex: "#6366f1" },
  ];

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [guestsRes, tablesRes] = await Promise.all([
        fetch("/api/guests"),
        fetch("/api/tables"),
      ]);

      if (!guestsRes.ok || !tablesRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const guestsData = await guestsRes.json();
      const tablesData = await tablesRes.json();

      setGuests(guestsData.filter((g: Guest) => !g.table_id));
      setTables(
        tablesData.map((t: { id: string; name: string }) => ({
          ...t,
          guests: guestsData.filter((g: Guest) => g.table_id === t.id),
        }))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim()) return;

    try {
      const response = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGuestName, color: newGuestColor }),
      });

      if (!response.ok) throw new Error("Failed to add guest");

      const newGuest = await response.json();
      setGuests((prev) => [newGuest, ...prev]);
      setNewGuestName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add guest");
    }
  };

  const addTable = async () => {
    try {
      const newTableName = `Table ${tables.length + 1}`;
      const response = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTableName }),
      });

      if (!response.ok) throw new Error("Failed to add table");

      const newTable = await response.json();
      setTables((prev) => [...prev, { ...newTable, guests: [] }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add table");
    }
  };

  const removeTable = async (tableId: string) => {
    const tableToRemove = tables.find((t) => t.id === tableId);
    if (!tableToRemove) return;

    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to remove table");

      // Move guests back to unassigned pool
      setGuests((prev) => [...prev, ...tableToRemove.guests]);
      setTables((prev) => prev.filter((t) => t.id !== tableId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove table");
    }
  };

  const primeDrag = (guestId: string, fromTableId: string | null) => {
    setDraggedGuestId({ guestId, fromTableId });
  };

  const onDragStart = (
    e: React.DragEvent,
    guestId: string,
    fromTableId: string | null = null
  ) => {
    setDraggedGuestId({ guestId, fromTableId });
    e.dataTransfer.setData("text/plain", guestId);
    e.dataTransfer.effectAllowed = "move";
    e.currentTarget.setAttribute("style", "opacity: 0.4");
  };

  const onDragEnd = (e: React.DragEvent) => {
    e.currentTarget.setAttribute("style", "opacity: 1");
    setDraggedGuestId(null);
  };

  const onDrop = async (e: React.DragEvent, toTableId: string | null) => {
    e.preventDefault();
    if (!draggedGuestId) return;

    const { guestId, fromTableId } = draggedGuestId;
    if (fromTableId === toTableId) return;

    let guestToMove: Guest | undefined;
    if (fromTableId === null) {
      guestToMove = guests.find((g) => g.id === guestId);
    } else {
      const fromTable = tables.find((t) => t.id === fromTableId);
      guestToMove = fromTable?.guests.find((g) => g.id === guestId);
    }

    if (!guestToMove) return;

    if (toTableId !== null) {
      const targetTable = tables.find((t) => t.id === toTableId);
      if (targetTable && targetTable.guests.length >= MAX_GUESTS_PER_TABLE) {
        showNotification(`This table is full! (Max ${MAX_GUESTS_PER_TABLE} people)`);
        return;
      }
    }

    try {
      const response = await fetch(`/api/guests/${guestId}/move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: toTableId }),
      });

      if (!response.ok) throw new Error("Failed to move guest");

      // Process State Changes
      if (fromTableId === null) {
        setGuests((prev) => prev.filter((g) => g.id !== guestId));
      } else {
        setTables((prev) =>
          prev.map((t) =>
            t.id === fromTableId
              ? { ...t, guests: t.guests.filter((g) => g.id !== guestId) }
              : t
          )
        );
      }

      if (toTableId === null) {
        setGuests((prev) => [{ ...guestToMove!, table_id: null }, ...prev]);
      } else {
        setTables((prev) =>
          prev.map((t) =>
            t.id === toTableId
              ? {
                  ...t,
                  guests: [...t.guests, { ...guestToMove!, table_id: toTableId }],
                }
              : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move guest");
    }
  };

  const filteredUnassigned = guests.filter((g) =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-xl text-red-600">Error: {error}</div>
        <button
          onClick={fetchData}
          className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-lg animate-pulse">
          {notification}
        </div>
      )}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            Wedding Table Planner
          </h1>
          <p className="text-slate-500 font-medium">
            {guests.length + tables.reduce((acc, t) => acc + t.guests.length, 0)}{" "}
            Total Guests • {guests.length} Unassigned
          </p>
        </div>
        <button
          onClick={addTable}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
        >
          <Plus size={20} /> Add Table
        </button>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">
              <Users size={20} className="text-indigo-600" />
              Guest Manager
            </h2>

            <form onSubmit={addGuest} className="mb-6 space-y-3">
              <input
                type="text"
                placeholder="New guest name..."
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
              />
              <div className="flex flex-wrap gap-2">
                {groupColors.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setNewGuestColor(c.hex)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      newGuestColor === c.hex
                        ? "border-slate-800 scale-110 shadow-sm"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              <button
                type="submit"
                className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
              >
                Add Guest
              </button>
            </form>

            <div className="pt-4 border-t border-slate-100">
              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Find a guest..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>

              <div
                className="h-[400px] overflow-y-auto bg-slate-50 rounded-xl p-3 border-2 border-dashed border-slate-200 scrollbar-hide"
                onDrop={(e) => onDrop(e, null)}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="space-y-1.5">
                  {filteredUnassigned.map((guest) => (
                    <div
                      key={guest.id}
                      draggable
                      onMouseDown={() => primeDrag(guest.id, null)}
                      onDragStart={(e) => onDragStart(e, guest.id, null)}
                      onDragEnd={onDragEnd}
                      className="flex items-center gap-3 bg-white p-2.5 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 border border-transparent transition-all select-none"
                    >
                      <GripVertical
                        size={14}
                        className="text-slate-300 shrink-0"
                      />
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: guest.color }}
                      />
                      <span className="font-semibold text-xs truncate text-slate-700">
                        {guest.name}
                      </span>
                    </div>
                  ))}
                  {filteredUnassigned.length === 0 && (
                    <p className="text-center text-slate-400 text-xs py-8 italic font-medium">
                      Pool is empty
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tables area */}
        <section className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {tables.map((table) => (
            <div
              key={table.id}
              onDrop={(e) => onDrop(e, table.id)}
              onDragOver={(e) => e.preventDefault()}
              className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all duration-150 ${
                draggedGuestId
                  ? "border-indigo-200 bg-indigo-50/20"
                  : "border-white"
              }`}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex-1">
                  <h3 className="text-md font-bold text-slate-800">
                    {table.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          table.guests.length >= MAX_GUESTS_PER_TABLE
                            ? "bg-red-500"
                            : "bg-indigo-500"
                        }`}
                        style={{
                          width: `${(table.guests.length / MAX_GUESTS_PER_TABLE) * 100}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-bold ${
                        table.guests.length >= MAX_GUESTS_PER_TABLE
                          ? "text-red-500"
                          : "text-slate-400"
                      }`}
                    >
                      {table.guests.length}/{MAX_GUESTS_PER_TABLE}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => removeTable(table.id)}
                  className="p-2 text-slate-200 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                  title="Remove Table"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 min-h-[140px] content-start">
                {table.guests.map((guest) => (
                  <div
                    key={guest.id}
                    draggable
                    onMouseDown={() => primeDrag(guest.id, table.id)}
                    onDragStart={(e) => onDragStart(e, guest.id, table.id)}
                    onDragEnd={onDragEnd}
                    className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md transition-all border-l-4 select-none"
                    style={{ borderLeftColor: guest.color }}
                  >
                    <span className="text-[11px] font-bold truncate text-slate-700">
                      {guest.name}
                    </span>
                  </div>
                ))}

                {table.guests.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 text-slate-200 border-2 border-dashed border-slate-50 rounded-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">
                      Drag Guests Here
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={addTable}
            className="flex flex-col items-center justify-center gap-3 p-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group min-h-[220px] bg-white/50"
          >
            <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <span className="font-bold text-xs uppercase tracking-tighter">
              Add New Table
            </span>
          </button>
        </section>
      </main>
    </div>
  );
};

export default App;
