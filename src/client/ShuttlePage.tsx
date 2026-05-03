import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Bus, Clock, Printer, X, Search, Check, RotateCcw, Undo2 } from "lucide-react";
import type { Guest, ColorGroup, Layout } from "../shared/types";

interface Props {
  layoutId: string;
  layouts: Layout[];
  onLayoutChange?: (id: string) => void;
  onBack: () => void;
}

interface ShuttleGuest extends Omit<Guest, "arrived" | "shuttle_checked"> {
  arrived: boolean;
  shuttle_checked: boolean;
}

interface TableInfo {
  id: string;
  name: string;
  nickname: string | null;
}

const ShuttlePage = ({ layoutId, layouts, onLayoutChange, onBack }: Props) => {
  const [activeLayoutId, setActiveLayoutId] = useState(layoutId);
  const [allGuests, setAllGuests] = useState<ShuttleGuest[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [tempShuttleTime, setTempShuttleTime] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [undoGuestIds, setUndoGuestIds] = useState<string[] | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = (message: string) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification(message);
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [guestsRes, tablesRes, colorGroupsRes] = await Promise.all([
        fetch(`/api/guests?layout=${activeLayoutId}`),
        fetch(`/api/tables?layout=${activeLayoutId}`),
        fetch("/api/color-groups"),
      ]);

      if (!guestsRes.ok || !tablesRes.ok || !colorGroupsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const guestsRaw: Guest[] = await guestsRes.json();
      const tablesData: TableInfo[] = await tablesRes.json();
      const colorGroupsData: ColorGroup[] = await colorGroupsRes.json();

      setAllGuests(
        guestsRaw.map((g) => ({
          ...g,
          arrived: Boolean(g.arrived),
          shuttle_checked: Boolean(g.shuttle_checked),
        }))
      );
      setTables(tablesData);
      setColorGroups(colorGroupsData);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeLayoutId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getColorGroupName = (hex: string): string => {
    const group = colorGroups.find(
      (cg) => cg.hex.toLowerCase() === hex.toLowerCase()
    );
    return group?.name || hex;
  };

  const getTableName = (tableId: string | null): string => {
    if (!tableId) return "Unassigned";
    const table = tables.find((t) => t.id === tableId);
    if (!table) return "Unknown";
    return table.nickname || table.name;
  };

  const updateShuttleTime = async (guestId: string, shuttleTime: string | null) => {
    try {
      const res = await fetch(`/api/guests/${guestId}/shuttle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuttle_time: shuttleTime }),
      });

      if (!res.ok) throw new Error("Failed to update shuttle time");

      setAllGuests((prev) =>
        prev.map((g) =>
          g.id === guestId
            ? {
                ...g,
                shuttle_time: shuttleTime,
                shuttle_checked: shuttleTime === null ? false : g.shuttle_checked,
              }
            : g
        )
      );
      showNotification(
        shuttleTime
          ? `Shuttle time set to ${shuttleTime}`
          : "Shuttle time removed"
      );
    } catch (err) {
      console.error("Failed to update shuttle time:", err);
      showNotification("Failed to update shuttle time");
    }
  };

  const startEditing = (guest: ShuttleGuest) => {
    setEditingGuestId(guest.id);
    setTempShuttleTime(guest.shuttle_time || "");
  };

  const saveShuttleTime = async (guestId: string) => {
    const trimmed = tempShuttleTime.trim();
    await updateShuttleTime(guestId, trimmed || null);
    setEditingGuestId(null);
    setTempShuttleTime("");
  };

  const removeShuttleTime = async (guestId: string) => {
    await updateShuttleTime(guestId, null);
    setEditingGuestId(null);
    setTempShuttleTime("");
  };

  const toggleShuttleCheck = async (guest: ShuttleGuest) => {
    const newChecked = !guest.shuttle_checked;

    // Optimistic update
    setAllGuests((prev) =>
      prev.map((g) =>
        g.id === guest.id ? { ...g, shuttle_checked: newChecked } : g
      )
    );

    try {
      const response = await fetch(`/api/guests/${guest.id}/shuttle-check`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuttle_checked: newChecked }),
      });
      if (!response.ok) throw new Error("Failed to update shuttle check");
    } catch {
      // Revert on error
      setAllGuests((prev) =>
        prev.map((g) =>
          g.id === guest.id ? { ...g, shuttle_checked: !newChecked } : g
        )
      );
      showNotification("Failed to update shuttle check");
    }
  };

  const resetAllShuttleChecks = async () => {
    setShowResetConfirm(false);

    try {
      const response = await fetch("/api/guests/reset-shuttle-checks", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to reset shuttle checks");

      const data: { undoGuestIds: string[] } = await response.json();
      setUndoGuestIds(data.undoGuestIds);

      // Update local state
      setAllGuests((prev) =>
        prev.map((g) => ({ ...g, shuttle_checked: false }))
      );
      showNotification("All shuttle check-offs have been reset");
    } catch {
      showNotification("Failed to reset shuttle checks");
    }
  };

  const undoReset = async () => {
    if (!undoGuestIds || undoGuestIds.length === 0) return;

    try {
      const response = await fetch("/api/guests/undo-reset-shuttle-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds: undoGuestIds }),
      });
      if (!response.ok) throw new Error("Failed to undo reset");

      // Restore local state
      const idsSet = new Set(undoGuestIds);
      setAllGuests((prev) =>
        prev.map((g) =>
          idsSet.has(g.id) ? { ...g, shuttle_checked: true } : g
        )
      );
      setUndoGuestIds(null);
      showNotification("Reset undone — shuttle check-offs restored");
    } catch {
      showNotification("Failed to undo reset");
    }
  };

  // Filter guests by search term
  const matchesSearch = (guest: ShuttleGuest): boolean => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    const table = guest.table_id
      ? tables.find((t) => t.id === guest.table_id)
      : null;
    return (
      guest.name.toLowerCase().includes(term) ||
      getColorGroupName(guest.color).toLowerCase().includes(term) ||
      (table?.name.toLowerCase().includes(term) ?? false) ||
      (table?.nickname?.toLowerCase().includes(term) ?? false) ||
      (guest.shuttle_time?.toLowerCase().includes(term) ?? false)
    );
  };

  // Group guests by shuttle_time
  const shuttleGroups: Record<string, ShuttleGuest[]> = {};
  const unassignedGuests: ShuttleGuest[] = [];

  allGuests.forEach((guest) => {
    if (!matchesSearch(guest)) return;
    if (guest.shuttle_time) {
      if (!shuttleGroups[guest.shuttle_time]) {
        shuttleGroups[guest.shuttle_time] = [];
      }
      shuttleGroups[guest.shuttle_time].push(guest);
    } else {
      unassignedGuests.push(guest);
    }
  });

  // Parse a time string like "5:00 PM", "11:00 AM", "14:30" into minutes since midnight
  const parseTimeToMinutes = (time: string): number => {
    const normalized = time.trim().toUpperCase();
    const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = parseInt(match12[2], 10);
      const period = match12[3];
      if (period === "AM" && hours === 12) hours = 0;
      if (period === "PM" && hours !== 12) hours += 12;
      return hours * 60 + minutes;
    }
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
    }
    return Infinity; // unparseable times sort to end
  };

  // Sort shuttle times chronologically
  const sortedShuttleTimes = Object.keys(shuttleGroups).sort(
    (a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b)
  );

  const totalWithShuttle = allGuests.filter((g) => g.shuttle_time).length;
  const checkedCount = allGuests.filter((g) => g.shuttle_checked).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
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

      {/* Undo banner */}
      {undoGuestIds && undoGuestIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-4">
          <span className="text-sm font-medium">All shuttle check-offs were reset</span>
          <button
            onClick={undoReset}
            className="flex items-center gap-1.5 bg-white text-slate-800 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-colors"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            onClick={() => setUndoGuestIds(null)}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              Reset All Shuttle Check-Offs?
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              This will uncheck all {checkedCount} checked guest{checkedCount !== 1 ? "s" : ""} from
              the shuttle list. You can undo this action.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resetAllShuttleChecks}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-5xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors print:hidden"
            aria-label="Back to planner"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Bus size={28} /> Shuttle Schedule
            </h1>
            <p className="text-slate-500 font-medium print:hidden">
              {checkedCount} of {totalWithShuttle} checked in
              {" · "}
              {totalWithShuttle} of {allGuests.length} assigned a shuttle time
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {layouts.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {layouts.map((layout) => (
                <button
                  key={layout.id}
                  onClick={() => {
                    setActiveLayoutId(layout.id);
                    onLayoutChange?.(layout.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    activeLayoutId === layout.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {layout.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
          >
            <Printer size={20} /> Print
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={checkedCount === 0}
            className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </header>

      {/* Search bar */}
      <div className="max-w-5xl mx-auto mb-6 print:hidden">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search guests, groups, tables, or shuttle times…"
            aria-label="Search shuttle guests"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <main className="max-w-5xl mx-auto space-y-6">
        {/* Shuttle time groups */}
        {sortedShuttleTimes.map((time) => {
          const guests = shuttleGroups[time];
          const groupChecked = guests.filter((g) => g.shuttle_checked).length;
          return (
            <section
              key={time}
              className="shuttle-group-print bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-indigo-600" />
                  <h2 className="text-xl font-bold text-indigo-900">
                    {time}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
                    {groupChecked}/{guests.length} checked
                  </span>
                </div>
              </div>
              <div className="p-4">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="pb-2 pl-2 w-10"></th>
                      <th className="pb-2">Guest</th>
                      <th className="pb-2">Group</th>
                      <th className="pb-2">Table</th>
                      <th className="pb-2 pr-2 print:hidden">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guests
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((guest) => (
                        <tr
                          key={guest.id}
                          className={`border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer ${
                            guest.shuttle_checked ? "bg-green-50/50" : ""
                          }`}
                          onClick={() => toggleShuttleCheck(guest)}
                        >
                          <td className="py-2 pl-2">
                            <div
                              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                guest.shuttle_checked
                                  ? "bg-green-500 border-green-500"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {guest.shuttle_checked && (
                                <Check size={14} className="text-white" strokeWidth={3} />
                              )}
                            </div>
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: guest.color }}
                              />
                              <span className={`font-medium ${
                                guest.shuttle_checked
                                  ? "text-slate-400 line-through"
                                  : "text-slate-800"
                              }`}>
                                {guest.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 text-sm text-slate-500">
                            {getColorGroupName(guest.color)}
                          </td>
                          <td className="py-2 text-sm text-slate-500">
                            {getTableName(guest.table_id)}
                          </td>
                          <td className="py-2 pr-2 print:hidden" onClick={(e) => e.stopPropagation()}>
                            {editingGuestId === guest.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={tempShuttleTime}
                                  onChange={(e) =>
                                    setTempShuttleTime(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      saveShuttleTime(guest.id);
                                    if (e.key === "Escape") {
                                      setEditingGuestId(null);
                                      setTempShuttleTime("");
                                    }
                                  }}
                                  className="px-2 py-1 text-sm border border-slate-200 rounded-md w-24 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  autoFocus
                                  placeholder="e.g. 5:00 PM"
                                />
                                <button
                                  onClick={() => saveShuttleTime(guest.id)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  aria-label="Save shuttle time"
                                >
                                  <Clock size={14} />
                                </button>
                                <button
                                  onClick={() => removeShuttleTime(guest.id)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                  aria-label="Remove shuttle time"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditing(guest)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {/* Guests without shuttle time */}
        {unassignedGuests.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden print:hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bus size={20} className="text-slate-400" />
                <h2 className="text-xl font-bold text-slate-500">
                  No Shuttle Assigned
                </h2>
              </div>
              <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {unassignedGuests.length} guest
                {unassignedGuests.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-2 pl-2">Guest</th>
                    <th className="pb-2">Group</th>
                    <th className="pb-2">Table</th>
                    <th className="pb-2 pr-2 print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedGuests
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((guest) => (
                      <tr
                        key={guest.id}
                        className="border-t border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="py-2 pl-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: guest.color }}
                            />
                            <span className="font-medium text-slate-800">
                              {guest.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-sm text-slate-500">
                          {getColorGroupName(guest.color)}
                        </td>
                        <td className="py-2 text-sm text-slate-500">
                          {getTableName(guest.table_id)}
                        </td>
                        <td className="py-2 pr-2 print:hidden">
                          {editingGuestId === guest.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={tempShuttleTime}
                                onChange={(e) =>
                                  setTempShuttleTime(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    saveShuttleTime(guest.id);
                                  if (e.key === "Escape") {
                                    setEditingGuestId(null);
                                    setTempShuttleTime("");
                                  }
                                }}
                                className="px-2 py-1 text-sm border border-slate-200 rounded-md w-24 focus:ring-2 focus:ring-indigo-500 outline-none"
                                autoFocus
                                placeholder="e.g. 5:00 PM"
                              />
                              <button
                                onClick={() => saveShuttleTime(guest.id)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                                aria-label="Save shuttle time"
                              >
                                <Clock size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingGuestId(null);
                                  setTempShuttleTime("");
                                }}
                                className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                aria-label="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(guest)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Assign Shuttle
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {sortedShuttleTimes.length === 0 && unassignedGuests.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Bus size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No guests found</p>
          </div>
        )}
      </main>

      {/* Print styles now consolidated in index.css */}
    </div>
  );
};

export default ShuttlePage;
