import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Users, GripVertical, Search, Trash2, X, UserPlus, LayoutDashboard, ClipboardList, Check, Bus, Printer } from "lucide-react";
import TableLayoutPage from "./TableLayoutPage";
import GuestListPage from "./GuestListPage";
import ShuttlePage from "./ShuttlePage";
import type { Guest, Table, ColorGroup, Layout } from "../shared/types";

// Default configuration constants
const DEFAULT_MAX_GUESTS_PER_TABLE = 16;

interface GroupColor {
  name: string;
  hex: string;
}

const App = () => {
  // Page navigation
  const [currentPage, setCurrentPage] = useState<"planner" | "layout" | "guestlist" | "shuttle">("planner");

  // Layout management
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [currentLayoutId, setCurrentLayoutId] = useState("default");
  const [showNewLayoutModal, setShowNewLayoutModal] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [cloneFromLayoutId, setCloneFromLayoutId] = useState<string | null>(null);

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
  const fetchRequestIdRef = useRef(0);
  
  // Per-table seat configuration
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tempMaxSeats, setTempMaxSeats] = useState("");
  
  // Edit guest name state
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestName, setEditingGuestName] = useState("");
  
  // Edit guest color state
  const [editingColorGuestId, setEditingColorGuestId] = useState<string | null>(null);
  
  // Edit table nickname state
  const [editingNicknameTableId, setEditingNicknameTableId] = useState<string | null>(null);
  const [tempNickname, setTempNickname] = useState("");
  
  // Seat drop target state (which seat slot is being hovered)
  const [seatDropTarget, setSeatDropTarget] = useState<{
    tableId: string;
    position: number;
  } | null>(null);

  // Bulk add modal state
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkAddNames, setBulkAddNames] = useState("");
  const [bulkAddColor, setBulkAddColor] = useState("#3b82f6");

  // Table drag reorder state
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null);
  const [tableDropTarget, setTableDropTarget] = useState<number | null>(null);

  // Color group name editing
  const [editingColorGroupHex, setEditingColorGroupHex] = useState<string | null>(null);
  const [tempColorGroupName, setTempColorGroupName] = useState("");
  const [colorGroupNames, setColorGroupNames] = useState<Record<string, string>>({});

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const defaultGroupColors: GroupColor[] = [
    { name: "Blue", hex: "#3b82f6" },
    { name: "Pink", hex: "#ec4899" },
    { name: "Green", hex: "#10b981" },
    { name: "Purple", hex: "#8b5cf6" },
    { name: "Red", hex: "#ef4444" },
    { name: "Amber", hex: "#f59e0b" },
    { name: "Cyan", hex: "#06b6d4" },
    { name: "Indigo", hex: "#6366f1" },
  ];

  // Merge saved color group names with defaults
  const groupColors: GroupColor[] = defaultGroupColors.map((c) => ({
    ...c,
    name: colorGroupNames[c.hex] || c.name,
  }));

  const fetchData = useCallback(async () => {
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
    const layoutId = currentLayoutId;
    const layoutQuery = encodeURIComponent(layoutId);

    try {
      setLoading(true);
      const [guestsRes, tablesRes, colorGroupsRes] = await Promise.all([
        fetch(`/api/guests?layout=${layoutQuery}`),
        fetch(`/api/tables?layout=${layoutQuery}`),
        fetch("/api/color-groups"),
      ]);

      if (!guestsRes.ok || !tablesRes.ok || !colorGroupsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const guestsData: Guest[] = await guestsRes.json();
      const tablesData: Array<{ id: string; name: string; nickname: string | null; max_seats: number; sort_order: number }> = await tablesRes.json();
      const colorGroupsData: ColorGroup[] = await colorGroupsRes.json();

      if (requestId !== fetchRequestIdRef.current) return;

      setGuests(guestsData.filter((g: Guest) => !g.table_id));
      setTables(
        tablesData.map((t: { id: string; name: string; nickname: string | null; max_seats: number; sort_order: number }) => {
          const tableGuests = guestsData
            .filter((g: Guest) => g.table_id === t.id)
            .sort((a, b) => (a.table_position ?? Infinity) - (b.table_position ?? Infinity));

          // Normalize: assign first available seat to guests with null/undefined table_position.
          // slotCount accounts for max_seats, guest count, and the highest existing
          // position so that sparse/high positions from past capacity reductions
          // remain addressable without renumbering.
          const maxPosition = tableGuests.reduce(
            (max, g) => (g.table_position != null && g.table_position > max ? g.table_position : max),
            -1
          );
          const slotCount = Math.max(t.max_seats, tableGuests.length, maxPosition + 1);

          const usedPositions = new Set(
            tableGuests
              .map((g) => g.table_position)
              .filter((p): p is number => p !== null && p !== undefined && p >= 0 && p < slotCount)
          );
          let nextFree = 0;
          const normalized = tableGuests.map((g) => {
            if (g.table_position === null || g.table_position === undefined || g.table_position < 0) {
              while (usedPositions.has(nextFree)) nextFree++;
              const assigned = nextFree;
              usedPositions.add(assigned);
              nextFree++;
              return { ...g, table_position: assigned };
            }
            return g;
          });

          return { ...t, guests: normalized };
        })
      );

      // Load saved color group names
      const namesMap: Record<string, string> = {};
      colorGroupsData.forEach((cg) => {
        namesMap[cg.hex] = cg.name;
      });
      setColorGroupNames(namesMap);
      setError(null);
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentLayoutId]);

  const fetchLayouts = useCallback(async () => {
    const layoutId = currentLayoutId;

    try {
      const res = await fetch("/api/layouts");
      if (!res.ok) return;
      const data: Layout[] = await res.json();
      setLayouts(data);
      // Reset to the first available layout only if the layout selected when
      // this request started was deleted and the user has not switched since.
      setCurrentLayoutId((selectedLayoutId) =>
        data.length > 0 &&
        selectedLayoutId === layoutId &&
        !data.some((layout) => layout.id === selectedLayoutId)
          ? data[0].id
          : selectedLayoutId
      );
    } catch {
      // non-fatal
    }
  }, [currentLayoutId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchLayouts();
  }, [fetchLayouts]);

  // Precompute position→guest maps per table for O(1) slot lookups
  const seatMaps = useMemo(() => {
    const maps: Record<string, Map<number, Guest>> = {};
    for (const table of tables) {
      const map = new Map<number, Guest>();
      for (const guest of table.guests) {
        if (guest.table_position !== null && guest.table_position !== undefined) {
          map.set(guest.table_position, guest);
        }
      }
      maps[table.id] = map;
    }
    return maps;
  }, [tables]);

  // Precompute effective slot count per table: max of max_seats, guest count,
  // and (highest table_position + 1) so sparse positions are always rendered.
  const slotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const maxPos = table.guests.reduce(
        (max, g) => (g.table_position != null && g.table_position > max ? g.table_position : max),
        -1
      );
      counts[table.id] = Math.max(table.max_seats, table.guests.length, maxPos + 1);
    }
    return counts;
  }, [tables]);

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim()) return;

    try {
      const response = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGuestName, color: newGuestColor, layoutId: currentLayoutId }),
      });

      if (!response.ok) throw new Error("Failed to add guest");

      const newGuest: Guest = await response.json();
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
        body: JSON.stringify({ name: newTableName, maxSeats: DEFAULT_MAX_GUESTS_PER_TABLE, layoutId: currentLayoutId }),
      });

      if (!response.ok) throw new Error("Failed to add table");

      const newTable: { id: string; name: string; nickname: string | null; max_seats: number; sort_order: number } = await response.json();
      setTables((prev) => [...prev, { ...newTable, guests: [] }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add table");
    }
  };

  const removeTable = async (tableId: string) => {
    const tableToRemove = tables.find((t) => t.id === tableId);
    if (!tableToRemove) return;

    if (!window.confirm(`Delete table "${tableToRemove.name}"?`)) return;

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

  // Edit guest name functions
  const startEditingGuest = (guest: Guest, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGuestId(guest.id);
    setEditingGuestName(guest.name);
  };

  const saveGuestName = async (guestId: string, tableId: string | null) => {
    if (!editingGuestName.trim()) {
      setEditingGuestId(null);
      return;
    }

    try {
      const response = await fetch(`/api/guests/${guestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingGuestName.trim() }),
      });

      if (!response.ok) throw new Error("Failed to update guest name");

      // Update in local state
      if (tableId === null) {
        setGuests((prev) =>
          prev.map((g) =>
            g.id === guestId ? { ...g, name: editingGuestName.trim() } : g
          )
        );
      } else {
        setTables((prev) =>
          prev.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  guests: t.guests.map((g) =>
                    g.id === guestId ? { ...g, name: editingGuestName.trim() } : g
                  ),
                }
              : t
          )
        );
      }
      showNotification("Guest name updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update guest name");
    } finally {
      setEditingGuestId(null);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, guestId: string, tableId: string | null) => {
    if (e.key === "Enter") {
      saveGuestName(guestId, tableId);
    } else if (e.key === "Escape") {
      setEditingGuestId(null);
    }
  };

  // Delete guest
  const deleteGuest = async (guestId: string, tableId: string | null, guestName: string) => {
    if (!window.confirm(`Delete "${guestName}"?`)) return;

    try {
      const response = await fetch(`/api/guests/${guestId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete guest");

      if (tableId === null) {
        setGuests((prev) => prev.filter((g) => g.id !== guestId));
      } else {
        setTables((prev) =>
          prev.map((t) =>
            t.id === tableId
              ? { ...t, guests: t.guests.filter((g) => g.id !== guestId) }
              : t
          )
        );
      }
      showNotification("Guest deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete guest");
    }
  };

  // Change guest color
  const changeGuestColor = async (guestId: string, tableId: string | null, newColor: string) => {
    try {
      const response = await fetch(`/api/guests/${guestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: newColor }),
      });

      if (!response.ok) throw new Error("Failed to update guest color");

      if (tableId === null) {
        setGuests((prev) =>
          prev.map((g) =>
            g.id === guestId ? { ...g, color: newColor } : g
          )
        );
      } else {
        setTables((prev) =>
          prev.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  guests: t.guests.map((g) =>
                    g.id === guestId ? { ...g, color: newColor } : g
                  ),
                }
              : t
          )
        );
      }
      setEditingColorGuestId(null);
      showNotification("Guest color updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update guest color");
    }
  };

  // Bulk add guests
  const handleBulkAdd = async () => {
    const names = bulkAddNames.split("\n").filter((name) => name.trim());
    if (names.length === 0) return;

    try {
      const response = await fetch("/api/guests/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, color: bulkAddColor, layoutId: currentLayoutId }),
      });

      if (!response.ok) throw new Error("Failed to bulk add guests");

      const newGuests: Guest[] = await response.json();
      setGuests((prev) => [...newGuests, ...prev]);
      showNotification(`Added ${newGuests.length} guests`);
      setShowBulkAddModal(false);
      setBulkAddNames("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk add guests");
    }
  };

  // Update table max seats
  const updateTableMaxSeats = async (tableId: string) => {
    const newMax = parseInt(tempMaxSeats, 10);
    if (isNaN(newMax) || newMax < 1) {
      showNotification("Invalid seat count");
      return;
    }

    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSeats: newMax }),
      });

      if (!response.ok) throw new Error("Failed to update table");

      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, max_seats: newMax } : t))
      );
      showNotification(`Table capacity updated to ${newMax}`);
      setEditingTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update table");
    }
  };

  const updateTableNickname = async (tableId: string) => {
    const newNickname = tempNickname.trim() || null;

    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: newNickname }),
      });

      if (!response.ok) throw new Error("Failed to update table nickname");

      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, nickname: newNickname } : t))
      );
      showNotification(newNickname ? `Table nickname set to "${newNickname}"` : "Table nickname removed");
      setEditingNicknameTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update table nickname");
    }
  };

  const saveColorGroupName = async (hex: string) => {
    const name = tempColorGroupName.trim();
    if (!name) {
      setEditingColorGroupHex(null);
      return;
    }

    try {
      const response = await fetch(`/api/color-groups/${encodeURIComponent(hex)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) throw new Error("Failed to save color group name");

      setColorGroupNames((prev) => ({ ...prev, [hex]: name }));
      showNotification(`Color group renamed to "${name}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save color group name");
    } finally {
      setEditingColorGroupHex(null);
    }
  };

  // Layout management

  const createLayout = async () => {
    const name = newLayoutName.trim();
    if (!name) return;

    try {
      const body: { name: string; cloneFrom?: string } = { name };
      if (cloneFromLayoutId) body.cloneFrom = cloneFromLayoutId;

      const response = await fetch("/api/layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to create layout");

      const newLayout: Layout = await response.json();
      setLayouts((prev) => [...prev, newLayout]);
      setCurrentLayoutId(newLayout.id);
      setShowNewLayoutModal(false);
      setNewLayoutName("");
      setCloneFromLayoutId(null);
      showNotification(`Layout "${newLayout.name}" created`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create layout");
    }
  };

  const deleteLayout = async (layoutId: string) => {
    const layout = layouts.find((l) => l.id === layoutId);
    if (!layout) return;
    if (!window.confirm(`Delete layout "${layout.name}"? This will remove all its tables and seating assignments.`)) return;

    try {
      const response = await fetch(`/api/layouts/${layoutId}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json() as { error: string };
        throw new Error(err.error || "Failed to delete layout");
      }

      const remaining = layouts.filter((l) => l.id !== layoutId);
      setLayouts(remaining);
      if (currentLayoutId === layoutId && remaining.length > 0) {
        setGuests([]);
        setTables([]);
        setLoading(true);
        setCurrentLayoutId(remaining[0].id);
      }
      showNotification(`Layout "${layout.name}" deleted`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete layout");
    }
  };

  const primeDrag = (guestId: string, fromTableId: string | null) => {
    if (editingGuestId === guestId) return; // Don't start drag if editing this guest
    setDraggedGuestId({ guestId, fromTableId });
  };

  const onDragStart = (
    e: React.DragEvent,
    guestId: string,
    fromTableId: string | null = null
  ) => {
    if (editingGuestId === guestId) {
      e.preventDefault();
      return;
    }
    setDraggedGuestId({ guestId, fromTableId });
    e.dataTransfer.setData("text/plain", guestId);
    e.dataTransfer.effectAllowed = "move";
    e.currentTarget.setAttribute("style", "opacity: 0.4");
  };

  const onDragEnd = (e: React.DragEvent) => {
    e.currentTarget.setAttribute("style", "opacity: 1");
    setDraggedGuestId(null);
    setSeatDropTarget(null);
  };

  const onDrop = async (e: React.DragEvent, toTableId: string | null, toPosition?: number) => {
    e.preventDefault();
    if (!draggedGuestId) return;

    const { guestId, fromTableId } = draggedGuestId;

    // Handle within-table seat move
    if (
      fromTableId === toTableId &&
      toTableId !== null &&
      toPosition !== undefined
    ) {
      const table = tables.find((t) => t.id === toTableId);
      if (!table) return;

      const guest = table.guests.find((g) => g.id === guestId);
      if (!guest) return;

      const oldPosition = guest.table_position;
      if (
        oldPosition !== null &&
        oldPosition !== undefined &&
        oldPosition === toPosition
      ) {
        setSeatDropTarget(null);
        return;
      }

      // Optimistic UI update
      setTables((prev) =>
        prev.map((t) =>
          t.id === toTableId
            ? {
                ...t,
                guests: t.guests.map((g) =>
                  g.id === guestId ? { ...g, table_position: toPosition } : g
                ),
              }
            : t
        )
      );
      setSeatDropTarget(null);

      try {
        const response = await fetch(`/api/guests/${guestId}/move`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableId: toTableId, position: toPosition, layoutId: currentLayoutId }),
        });
        if (!response.ok) throw new Error("Failed to move guest");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move guest");
        fetchData(); // Revert on error
      }
      return;
    }

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
      if (targetTable && targetTable.guests.length >= targetTable.max_seats) {
        showNotification(`This table is full! (Max ${targetTable.max_seats} people)`);
        return;
      }
    }

    try {
      const response = await fetch(`/api/guests/${guestId}/move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: toTableId, position: toPosition ?? undefined, layoutId: currentLayoutId }),
      });

      if (!response.ok) throw new Error("Failed to move guest");

      const data: { success: boolean; position: number | null } = await response.json();

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
        setGuests((prev) => [{ ...guestToMove!, table_id: null, table_position: null }, ...prev]);
      } else {
        const assignedPosition = toPosition ?? data.position;
        if (assignedPosition === null || assignedPosition === undefined) {
          // Unexpected: backend should always return a position for table assignments
          fetchData();
          return;
        }
        setTables((prev) =>
          prev.map((t) =>
            t.id === toTableId
              ? {
                  ...t,
                  guests: [...t.guests, { ...guestToMove!, table_id: toTableId, table_position: assignedPosition }],
                }
              : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move guest");
    }
    setSeatDropTarget(null);
  };

  const onSeatDragOver = (e: React.DragEvent, tableId: string, position: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedGuestId) return;

    if (!seatDropTarget || seatDropTarget.tableId !== tableId || seatDropTarget.position !== position) {
      setSeatDropTarget({ tableId, position });
    }
  };

  // Table drag-to-reorder handlers
  const onTableDragStart = (e: React.DragEvent, tableId: string) => {
    setDraggedTableId(tableId);
    e.dataTransfer.setData("text/plain", `table:${tableId}`);
    e.dataTransfer.effectAllowed = "move";
    e.currentTarget.setAttribute("style", "opacity: 0.4");
  };

  const onTableDragEnd = (e: React.DragEvent) => {
    e.currentTarget.setAttribute("style", "opacity: 1");
    setDraggedTableId(null);
    setTableDropTarget(null);
  };

  const onTableDragOver = (e: React.DragEvent, tableIndex: number) => {
    if (!draggedTableId) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midY ? tableIndex : tableIndex + 1;

    if (tableDropTarget !== insertIndex) {
      setTableDropTarget(insertIndex);
    }
  };

  const onTableDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTableId || tableDropTarget === null) return;

    const currentIndex = tables.findIndex((t) => t.id === draggedTableId);
    if (currentIndex === -1) return;

    let targetIndex = tableDropTarget;
    const newTables = [...tables];
    const [moved] = newTables.splice(currentIndex, 1);
    if (targetIndex > currentIndex) targetIndex--;

    if (targetIndex === currentIndex) {
      setDraggedTableId(null);
      setTableDropTarget(null);
      return;
    }

    newTables.splice(targetIndex, 0, moved);

    // Update table names and sort_order to match new positions
    const renamedTables = newTables.map((t, i) => ({
      ...t,
      name: `Table ${i + 1}`,
      sort_order: i,
    }));

    // Optimistic UI update
    setTables(renamedTables);
    setDraggedTableId(null);
    setTableDropTarget(null);

    try {
      const response = await fetch("/api/tables/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableIds: newTables.map((t) => t.id), layoutId: currentLayoutId }),
      });
      if (!response.ok) throw new Error("Failed to reorder tables");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder tables");
      fetchData(); // Revert on error
    }
  };

  const getTableDropBorderClass = (tableIndex: number): string => {
    if (!draggedTableId || tableDropTarget === null) return "";
    const draggedIndex = tables.findIndex((t) => t.id === draggedTableId);
    if (draggedIndex === tableIndex) return "";

    if (tableDropTarget === tableIndex) {
      return "border-t-4 border-t-indigo-500";
    }
    if (tableDropTarget === tableIndex + 1) {
      return "border-b-4 border-b-indigo-500";
    }
    return "";
  };

  const filteredUnassigned = guests.filter((g) =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Render layout page if selected
  if (currentPage === "layout") {
    return <TableLayoutPage layoutId={currentLayoutId} onBack={() => setCurrentPage("planner")} />;
  }

  // Render guest list page if selected
  if (currentPage === "guestlist") {
    return <GuestListPage layoutId={currentLayoutId} onBack={() => setCurrentPage("planner")} />;
  }

  // Render shuttle page if selected
  if (currentPage === "shuttle") {
    return <ShuttlePage layoutId={currentLayoutId} onBack={() => setCurrentPage("planner")} />;
  }

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
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-lg">
          {notification}
        </div>
      )}



      {/* New Layout Modal */}
      {showNewLayoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">New Layout</h3>
              <button
                onClick={() => { setShowNewLayoutModal(false); setNewLayoutName(""); setCloneFromLayoutId(null); }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Layout Name</label>
                <input
                  type="text"
                  value={newLayoutName}
                  onChange={(e) => setNewLayoutName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createLayout(); }}
                  placeholder="e.g. Wet Weather"
                  autoFocus
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clone from (optional)</label>
                <select
                  value={cloneFromLayoutId ?? ""}
                  onChange={(e) => setCloneFromLayoutId(e.target.value || null)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                >
                  <option value="">Blank layout</option>
                  {layouts.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={createLayout}
                disabled={!newLayoutName.trim()}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cloneFromLayoutId ? "Clone Layout" : "Create Layout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {showBulkAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Bulk Add Guests</h3>
              <button
                onClick={() => setShowBulkAddModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Guest Names (one per line)
                </label>
                <textarea
                  value={bulkAddNames}
                  onChange={(e) => setBulkAddNames(e.target.value)}
                  placeholder={"John Smith\nJane Doe\nBob Wilson"}
                  rows={8}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Group Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {groupColors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setBulkAddColor(c.hex)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        bulkAddColor === c.hex
                          ? "border-slate-800 scale-110 shadow-sm"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={handleBulkAdd}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700"
              >
                Add Guests
              </button>
            </div>
          </div>
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

        {/* Layout switcher */}
        <div className="relative">
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {layouts.map((layout) => (
              <div key={layout.id} className="flex items-center">
                <button
                  onClick={() => { setCurrentLayoutId(layout.id); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    currentLayoutId === layout.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {layout.name}
                </button>
                {layouts.length > 1 && currentLayoutId === layout.id && (
                  <button
                    onClick={() => deleteLayout(layout.id)}
                    className="p-1 text-slate-300 hover:text-red-400 rounded transition-all"
                    title="Delete this layout"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => { setShowNewLayoutModal(true); setCloneFromLayoutId(currentLayoutId); setNewLayoutName(""); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-all"
              title="New layout"
            >
              <Plus size={14} /> New
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95 print:hidden"
          >
            <Printer size={20} /> Print
          </button>
          <button
            onClick={() => setCurrentPage("guestlist")}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
          >
            <ClipboardList size={20} /> Guest List
          </button>
          <button
            onClick={() => setCurrentPage("shuttle")}
            className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
          >
            <Bus size={20} /> Shuttle
          </button>
          <button
            onClick={() => setCurrentPage("layout")}
            className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
          >
            <LayoutDashboard size={20} /> Table Layout
          </button>
          <button
            onClick={addTable}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
          >
            <Plus size={20} /> Add Table
          </button>
        </div>
      </header>

      <main className="planner-page max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">
              <Users size={20} className="text-indigo-600" />
              Guest Manager
            </h2>

            <form onSubmit={addGuest} className="mb-4 space-y-3">
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

            {/* Bulk Add Button */}
            <button
              onClick={() => setShowBulkAddModal(true)}
              className="w-full mb-6 flex items-center justify-center gap-2 bg-indigo-100 text-indigo-700 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-200 transition-colors"
            >
              <UserPlus size={16} /> Bulk Add Guests
            </button>

            {/* Color Group Legend */}
            <div className="pt-4 border-t border-slate-100 mb-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Color Groups
              </h3>
              <div className="space-y-1">
                {groupColors.map((c) => (
                  <div key={c.hex} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: c.hex }}
                    />
                    {editingColorGroupHex === c.hex ? (
                      <input
                        type="text"
                        value={tempColorGroupName}
                        onChange={(e) => setTempColorGroupName(e.target.value)}
                        onBlur={() => saveColorGroupName(c.hex)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") setEditingColorGroupHex(null);
                        }}
                        autoFocus
                        className="flex-1 text-xs text-slate-700 bg-white px-2 py-0.5 rounded border border-indigo-300 outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex-1 text-xs text-slate-600 text-left hover:text-indigo-600 cursor-pointer bg-transparent border-none p-0 truncate"
                        onClick={() => {
                          setEditingColorGroupHex(c.hex);
                          setTempColorGroupName(c.name);
                        }}
                        title="Click to rename group"
                      >
                        {c.name}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

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
                onDragEnter={(e) => e.preventDefault()}
              >
                <div className="space-y-1.5">
                  {filteredUnassigned.map((guest) => (
                    <div
                      key={guest.id}
                      draggable={editingGuestId !== guest.id}
                      onMouseDown={() => primeDrag(guest.id, null)}
                      onDragStart={(e) => onDragStart(e, guest.id, null)}
                      onDragEnd={onDragEnd}
                      className="flex items-center gap-3 bg-white p-2.5 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 border border-transparent transition-all select-none"
                    >
                      <GripVertical
                        size={14}
                        className="text-slate-300 shrink-0"
                      />
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          className="w-2.5 h-2.5 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition-all border-0 p-0"
                          style={{ backgroundColor: guest.color }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingColorGuestId(editingColorGuestId === guest.id ? null : guest.id);
                          }}
                          aria-label={`Change color for ${guest.name}`}
                        />
                        {editingColorGuestId === guest.id && (
                          <div className="absolute top-5 left-0 z-50 bg-white rounded-lg shadow-lg border border-slate-200 p-2 flex flex-wrap gap-1.5 w-[120px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {groupColors.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => changeGuestColor(guest.id, null, c.hex)}
                                className={`w-5 h-5 rounded-full border-2 transition-all ${
                                  guest.color === c.hex
                                    ? "border-slate-800 scale-110"
                                    : "border-transparent hover:border-slate-300"
                                }`}
                                style={{ backgroundColor: c.hex }}
                                title={c.name}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      {editingGuestId === guest.id ? (
                        <input
                          type="text"
                          value={editingGuestName}
                          onChange={(e) => setEditingGuestName(e.target.value)}
                          onBlur={() => saveGuestName(guest.id, null)}
                          onKeyDown={(e) => handleEditKeyDown(e, guest.id, null)}
                          autoFocus
                          className="flex-1 text-xs font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-indigo-300 outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          {!!guest.arrived && (
                            <Check size={12} className="text-green-500 shrink-0" strokeWidth={3} role="img" aria-label="Arrived" />
                          )}
                          <span
                            className="font-semibold text-xs truncate text-slate-700 cursor-pointer hover:text-indigo-600 flex-1"
                            onClick={(e) => startEditingGuest(guest, e)}
                            title="Click to edit name"
                          >
                            {guest.name}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteGuest(guest.id, null, guest.name);
                        }}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all shrink-0"
                        aria-label={`Delete ${guest.name}`}
                      >
                        <X size={12} />
                      </button>
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
          {tables.map((table, tableIndex) => (
            <div
              key={table.id}
              onDragOver={(e) => {
                if (draggedTableId) {
                  onTableDragOver(e, tableIndex);
                } else {
                  e.preventDefault();
                }
              }}
              onDragEnter={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (draggedTableId) {
                  onTableDrop(e);
                } else {
                  onDrop(e, table.id);
                }
              }}
              onDragLeave={(e) => {
                if (draggedTableId) {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setTableDropTarget(null);
                  }
                } else {
                  // Clear seat drop target when leaving the table container
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setSeatDropTarget(null);
                  }
                }
              }}
              className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all duration-150 ${
                draggedGuestId
                  ? "border-indigo-200 bg-indigo-50/20"
                  : draggedTableId && draggedTableId !== table.id
                  ? "border-indigo-200 bg-indigo-50/20"
                  : "border-white"
              } ${getTableDropBorderClass(tableIndex)}`}
            >
              <div className="flex justify-between items-center mb-4">
                <div
                  draggable={!draggedGuestId}
                  onDragStart={(e) => {
                    if (draggedGuestId) return;
                    onTableDragStart(e, table.id);
                  }}
                  onDragEnd={(e) => {
                    if (draggedTableId) onTableDragEnd(e);
                  }}
                  className="flex items-center gap-2 flex-1 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical
                    size={16}
                    className="text-slate-300 shrink-0 print:hidden"
                  />
                  <div className="flex-1">
                    <h3 className="text-md font-bold text-slate-800">
                    {table.name}
                  </h3>
                  {editingNicknameTableId === table.id ? (
                    <input
                      type="text"
                      value={tempNickname}
                      onChange={(e) => setTempNickname(e.target.value)}
                      onBlur={() => updateTableNickname(table.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateTableNickname(table.id);
                        } else if (e.key === "Escape") {
                          setEditingNicknameTableId(null);
                        }
                      }}
                      autoFocus
                      placeholder="Add nickname…"
                      className="text-xs text-slate-500 bg-white px-1 py-0.5 rounded border border-indigo-300 outline-none w-full mt-0.5 print:hidden"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-slate-400 cursor-pointer hover:text-indigo-600 italic block mt-0.5 truncate bg-transparent border-none p-0 text-left w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNicknameTableId(table.id);
                        setTempNickname(table.nickname ?? "");
                      }}
                      title="Click to edit nickname"
                    >
                      {table.nickname || "Add nickname…"}
                    </button>
                  )}
                  <div className="flex items-center gap-2 mt-1 print:hidden">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          table.guests.length >= table.max_seats
                            ? "bg-red-500"
                            : "bg-indigo-500"
                        }`}
                        style={{
                          width: `${
                            table.max_seats > 0
                              ? Math.min((table.guests.length / table.max_seats) * 100, 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    {editingTableId === table.id ? (
                      <input
                        type="number"
                        min="1"
                        value={tempMaxSeats}
                        onChange={(e) => setTempMaxSeats(e.target.value)}
                        onBlur={() => updateTableMaxSeats(table.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            updateTableMaxSeats(table.id);
                          } else if (e.key === "Escape") {
                            setEditingTableId(null);
                          }
                        }}
                        autoFocus
                        className="w-12 text-[10px] font-bold text-slate-700 bg-white px-1 py-0.5 rounded border border-indigo-300 outline-none text-center"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className={`text-[10px] font-bold cursor-pointer hover:text-indigo-600 ${
                          table.guests.length >= table.max_seats
                            ? "text-red-500"
                            : "text-slate-400"
                        }`}
                        onClick={() => {
                          setEditingTableId(table.id);
                          setTempMaxSeats(table.max_seats.toString());
                        }}
                        title="Click to edit capacity"
                      >
                        {table.guests.length}/{table.max_seats}
                      </span>
                    )}
                  </div>
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
                {Array.from({ length: slotCounts[table.id] ?? table.max_seats }, (_, slotIndex) => {
                  const guest = seatMaps[table.id]?.get(slotIndex);
                  const isDropHighlight =
                    seatDropTarget &&
                    seatDropTarget.tableId === table.id &&
                    seatDropTarget.position === slotIndex &&
                    draggedGuestId &&
                    draggedGuestId.guestId !== guest?.id;

                  if (guest) {
                    return (
                      <div
                        key={guest.id}
                        draggable={editingGuestId !== guest.id}
                        onMouseDown={() => primeDrag(guest.id, table.id)}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          onDragStart(e, guest.id, table.id);
                        }}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          onDrop(e, table.id);
                        }}
                        className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md transition-all border-l-4 select-none"
                        style={{ borderLeftColor: guest.color }}
                      >
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            className="w-2 h-2 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition-all border-0 p-0"
                            style={{ backgroundColor: guest.color }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingColorGuestId(editingColorGuestId === guest.id ? null : guest.id);
                            }}
                            aria-label={`Change color for ${guest.name}`}
                          />
                          {editingColorGuestId === guest.id && (
                            <div className="absolute top-4 left-0 z-50 bg-white rounded-lg shadow-lg border border-slate-200 p-2 flex flex-wrap gap-1.5 w-[120px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {groupColors.map((c) => (
                                <button
                                  key={c.hex}
                                  type="button"
                                  onClick={() => changeGuestColor(guest.id, table.id, c.hex)}
                                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                                    guest.color === c.hex
                                      ? "border-slate-800 scale-110"
                                      : "border-transparent hover:border-slate-300"
                                  }`}
                                  style={{ backgroundColor: c.hex }}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        {editingGuestId === guest.id ? (
                          <input
                            type="text"
                            value={editingGuestName}
                            onChange={(e) => setEditingGuestName(e.target.value)}
                            onBlur={() => saveGuestName(guest.id, table.id)}
                            onKeyDown={(e) => handleEditKeyDown(e, guest.id, table.id)}
                            autoFocus
                            className="flex-1 text-[11px] font-bold text-slate-700 bg-white px-2 py-1 rounded border border-indigo-300 outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            {!!guest.arrived && (
                              <span className="shrink-0 inline-flex items-center">
                                <Check size={10} className="text-green-500" strokeWidth={3} aria-hidden="true" />
                                <span className="sr-only">Arrived</span>
                              </span>
                            )}
                            <span
                              className="text-[11px] font-bold truncate text-slate-700 cursor-pointer hover:text-indigo-600 flex-1"
                              onClick={(e) => startEditingGuest(guest, e)}
                              title="Click to edit name"
                            >
                              {guest.name}
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteGuest(guest.id, table.id, guest.name);
                          }}
                          className="p-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all shrink-0"
                          aria-label={`Delete ${guest.name}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  }

                  // Empty seat slot
                  return (
                    <div
                      key={`empty-${slotIndex}`}
                      onDragOver={(e) => onSeatDragOver(e, table.id, slotIndex)}
                      onDragEnter={(e) => e.preventDefault()}
                      onDragLeave={() => {
                        if (
                          seatDropTarget &&
                          seatDropTarget.tableId === table.id &&
                          seatDropTarget.position === slotIndex
                        ) {
                          setSeatDropTarget(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        onDrop(e, table.id, slotIndex);
                      }}
                      className={`flex items-center justify-center p-2 rounded-lg border-2 border-dashed transition-all min-h-[36px] ${
                        isDropHighlight
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-100 bg-slate-50/50"
                      }`}
                    >
                      <span className="text-[10px] text-slate-300 font-medium select-none">
                        {isDropHighlight ? "Drop here" : `Seat ${slotIndex + 1}`}
                      </span>
                    </div>
                  );
                })}
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
