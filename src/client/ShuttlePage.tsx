import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Bus, Clock, Printer, X } from "lucide-react";
import type { Guest, ColorGroup } from "../shared/types";

interface Props {
  onBack: () => void;
}

interface ShuttleGuest extends Omit<Guest, "arrived"> {
  arrived: boolean;
}

interface TableInfo {
  id: string;
  name: string;
  nickname: string | null;
}

const ShuttlePage = ({ onBack }: Props) => {
  const [allGuests, setAllGuests] = useState<ShuttleGuest[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [tempShuttleTime, setTempShuttleTime] = useState("");

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
        fetch("/api/guests"),
        fetch("/api/tables"),
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
        }))
      );
      setTables(tablesData);
      setColorGroups(colorGroupsData);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
          g.id === guestId ? { ...g, shuttle_time: shuttleTime } : g
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

  // Group guests by shuttle_time
  const shuttleGroups: Record<string, ShuttleGuest[]> = {};
  const unassignedGuests: ShuttleGuest[] = [];

  allGuests.forEach((guest) => {
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

      <header className="max-w-5xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            aria-label="Back to planner"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Bus size={28} /> Shuttle Schedule
            </h1>
            <p className="text-slate-500 font-medium">
              {totalWithShuttle} of {allGuests.length} guests assigned a shuttle
              time • {sortedShuttleTimes.length} time slot
              {sortedShuttleTimes.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95 print:hidden"
        >
          <Printer size={20} /> Print
        </button>
      </header>

      <main className="max-w-5xl mx-auto space-y-6">
        {/* Shuttle time groups */}
        {sortedShuttleTimes.map((time) => {
          const guests = shuttleGroups[time];
          return (
            <section
              key={time}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-indigo-600" />
                  <h2 className="text-xl font-bold text-indigo-900">
                    {time}
                  </h2>
                </div>
                <span className="text-sm font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
                  {guests.length} guest{guests.length !== 1 ? "s" : ""}
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
                    {guests
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
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
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

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

export default ShuttlePage;
