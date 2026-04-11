import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ArrowLeft, Check, RotateCcw, Undo2, X, MapPin, Search } from "lucide-react";
import type { Guest, ColorGroup } from "../shared/types";

interface Props {
  onBack: () => void;
}

interface AllGuest extends Omit<Guest, "arrived"> {
  table_id: string | null;
  table_position?: number | null;
  arrived: boolean;
}

interface TableInfo {
  id: string;
  name: string;
  nickname: string | null;
  max_seats: number;
  guests: AllGuest[];
}

const GuestListPage = ({ onBack }: Props) => {
  const [allGuests, setAllGuests] = useState<AllGuest[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Reset undo state
  const [undoGuestIds, setUndoGuestIds] = useState<string[] | null>(null);

  // Confirmation modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Notification timer ref
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Arrival modal state
  const [arrivalModal, setArrivalModal] = useState<{
    guest: AllGuest;
    table: TableInfo | null;
  } | null>(null);

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

  // Cleanup timer on unmount
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

      const guestsData: AllGuest[] = await guestsRes.json();
      const tablesData: TableInfo[] = await tablesRes.json();
      const colorGroupsData: ColorGroup[] = await colorGroupsRes.json();

      // Map arrived from number to boolean
      const mappedGuests = guestsData.map((g) => ({
        ...g,
        arrived: Boolean(g.arrived),
      }));

      setAllGuests(mappedGuests);

      // Enrich tables with their guests
      const enrichedTables = tablesData.map((t) => ({
        ...t,
        guests: mappedGuests
          .filter((g) => g.table_id === t.id)
          .sort((a, b) => (a.table_position ?? 0) - (b.table_position ?? 0)),
      }));
      setTables(enrichedTables);
      setColorGroups(colorGroupsData);
    } catch (error) {
      console.error("Failed to load guest list data", error);
      showNotification("Failed to load guest list data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleArrival = async (guest: AllGuest) => {
    const newArrived = !guest.arrived;

    // Optimistic update
    setAllGuests((prev) =>
      prev.map((g) => (g.id === guest.id ? { ...g, arrived: newArrived } : g))
    );
    setTables((prev) =>
      prev.map((t) => ({
        ...t,
        guests: t.guests.map((g) =>
          g.id === guest.id ? { ...g, arrived: newArrived } : g
        ),
      }))
    );

    try {
      const response = await fetch(`/api/guests/${guest.id}/arrive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrived: newArrived }),
      });
      if (!response.ok) throw new Error("Failed to update arrival");

      // Show modal when marking as arrived (only after successful API call)
      if (newArrived && guest.table_id) {
        const table = tables.find((t) => t.id === guest.table_id) ?? null;
        setArrivalModal({ guest: { ...guest, arrived: true }, table });
      }
    } catch {
      // Revert on error
      setAllGuests((prev) =>
        prev.map((g) =>
          g.id === guest.id ? { ...g, arrived: !newArrived } : g
        )
      );
      setTables((prev) =>
        prev.map((t) => ({
          ...t,
          guests: t.guests.map((g) =>
            g.id === guest.id ? { ...g, arrived: !newArrived } : g
          ),
        }))
      );
      setArrivalModal(null);
      showNotification("Failed to update arrival status");
    }
  };

  const resetAllArrivals = async () => {
    setShowResetConfirm(false);

    try {
      const response = await fetch("/api/guests/reset-arrivals", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to reset arrivals");

      const data: { undoGuestIds: string[] } = await response.json();
      const ids = data.undoGuestIds;
      setUndoGuestIds(ids);

      // Update local state
      setAllGuests((prev) => prev.map((g) => ({ ...g, arrived: false })));
      setTables((prev) =>
        prev.map((t) => ({
          ...t,
          guests: t.guests.map((g) => ({ ...g, arrived: false })),
        }))
      );
      showNotification("All arrivals have been reset");
    } catch {
      showNotification("Failed to reset arrivals");
    }
  };

  const undoReset = async () => {
    if (!undoGuestIds || undoGuestIds.length === 0) return;

    try {
      const response = await fetch("/api/guests/undo-reset-arrivals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds: undoGuestIds }),
      });
      if (!response.ok) throw new Error("Failed to undo reset");

      // Restore local state
      const idsSet = new Set(undoGuestIds);
      setAllGuests((prev) =>
        prev.map((g) => (idsSet.has(g.id) ? { ...g, arrived: true } : g))
      );
      setTables((prev) =>
        prev.map((t) => ({
          ...t,
          guests: t.guests.map((g) =>
            idsSet.has(g.id) ? { ...g, arrived: true } : g
          ),
        }))
      );
      setUndoGuestIds(null);
      showNotification("Reset undone — arrivals restored");
    } catch {
      showNotification("Failed to undo reset");
    }
  };

  // Group guests by color
  const getColorGroupName = (hex: string): string => {
    const group = colorGroups.find((cg) => cg.hex === hex);
    return group ? group.name : hex;
  };

  const tableMap = useMemo(
    () => new Map(tables.map((t) => [t.id, t])),
    [tables]
  );

  const groupedByColor = allGuests
    .filter((g) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.trim().toLowerCase();
      const table = g.table_id ? tableMap.get(g.table_id) : null;
      return (
        g.name.toLowerCase().includes(term) ||
        getColorGroupName(g.color).toLowerCase().includes(term) ||
        (table?.name.toLowerCase().includes(term) ?? false) ||
        (table?.nickname?.toLowerCase().includes(term) ?? false)
      );
    })
    .reduce<Record<string, AllGuest[]>>(
      (acc, guest) => {
        const key = guest.color;
        if (!acc[key]) acc[key] = [];
        acc[key].push(guest);
        return acc;
      },
      {}
    );

  // Sort groups by name
  const sortedColorKeys = Object.keys(groupedByColor).sort((a, b) =>
    getColorGroupName(a).localeCompare(getColorGroupName(b))
  );

  const totalGuests = allGuests.length;
  const arrivedCount = allGuests.filter((g) => g.arrived).length;

  // Mini table visualization for modal – 2-column layout matching planner view
  const renderMiniTable = (table: TableInfo, highlightGuestId: string) => {
    const rows = Math.ceil(table.max_seats / 2);

    return (
      <div className="my-4 mx-auto w-full max-w-[260px] rounded-lg border-2 border-amber-700 overflow-hidden" style={{ backgroundColor: "#f5e6d3" }}>
        {/* Header */}
        <div
          className="px-2 py-1.5 text-center font-bold text-xs truncate"
          style={{ backgroundColor: "#d4a574", color: "#3d2b1f" }}
        >
          {table.nickname || table.name}
          <span className="ml-1 font-normal opacity-70">
            {table.guests.length}/{table.max_seats}
          </span>
        </div>

        {/* Guest rows */}
        <div className="px-2 py-1" style={{ fontSize: 11 }}>
          {Array.from({ length: rows }).map((_, rowIdx) => {
            const leftGuest = table.guests[rowIdx * 2];
            const rightGuest = table.guests[rowIdx * 2 + 1];

            const renderSide = (guest: AllGuest | undefined, side: "left" | "right", seatIndex: number) => {
              if (!guest) {
                return (
                  <span className="w-2.5 h-2.5 rounded-full border border-amber-300 opacity-40 shrink-0" title={`Seat ${seatIndex + 1}`} />
                );
              }
              const isHighlighted = guest.id === highlightGuestId;
              const dot = (
                <span
                  className={`inline-block shrink-0 rounded-full ${isHighlighted ? "w-3 h-3 ring-2 ring-indigo-400 ring-offset-1" : "w-2.5 h-2.5"}`}
                  style={{ backgroundColor: guest.color }}
                />
              );
              const name = (
                <span
                  className={`truncate ${isHighlighted ? "text-indigo-700 font-extrabold text-xs" : "font-medium"}`}
                  style={!isHighlighted ? { color: "#3d2b1f" } : undefined}
                  title={guest.name}
                >
                  {guest.name}
                </span>
              );
              return side === "left" ? <>{dot}{name}</> : <>{name}{dot}</>;
            };

            const leftIsHighlighted = leftGuest?.id === highlightGuestId;
            const rightIsHighlighted = rightGuest?.id === highlightGuestId;

            return (
              <div
                key={rowIdx}
                className="flex items-center"
                style={{ height: 24 }}
              >
                {/* Left side */}
                <div className={`flex-1 flex items-center gap-1 min-w-0 px-0.5 ${leftIsHighlighted ? "seat-highlight" : ""}`}>
                  {renderSide(leftGuest, "left", rowIdx * 2)}
                </div>

                {/* Divider */}
                <div className="w-px h-3 bg-amber-400 opacity-40 mx-1" />

                {/* Right side */}
                <div className={`flex-1 flex items-center gap-1 justify-end min-w-0 px-0.5 ${rightIsHighlighted ? "seat-highlight" : ""}`}>
                  {renderSide(rightGuest, "right", rowIdx * 2 + 1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
          <span className="text-sm font-medium">All arrivals were reset</span>
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
              Reset All Arrivals?
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              This will mark all {arrivedCount} arrived guest{arrivedCount !== 1 ? "s" : ""} as
              not arrived. You can undo this action.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resetAllArrivals}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arrival Modal */}
      {arrivalModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setArrivalModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Welcome! 🎉
                </h3>
                <p className="text-sm text-slate-500">
                  {arrivalModal.guest.name} has arrived
                </p>
              </div>
              <button
                onClick={() => setArrivalModal(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {arrivalModal.table ? (
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={16} className="text-indigo-600" />
                  <span className="text-sm font-bold text-slate-700">
                    {arrivalModal.table.name}
                  </span>
                </div>
                {arrivalModal.table.nickname && (
                  <p className="text-xs text-slate-500 italic ml-6 mb-2">
                    "{arrivalModal.table.nickname}"
                  </p>
                )}
                <div className="text-xs text-slate-400 ml-6 mb-2">
                  {(() => {
                    const seatNumber =
                      arrivalModal.guest.table_position != null
                        ? arrivalModal.guest.table_position + 1
                        : (() => {
                            const guestIndex = arrivalModal.table.guests.findIndex(
                              (g) => g.id === arrivalModal.guest.id
                            );
                            return guestIndex >= 0 ? guestIndex + 1 : null;
                          })();

                    return seatNumber != null ? (
                      <>
                        Seat {seatNumber} of {arrivalModal.table.max_seats}
                      </>
                    ) : (
                      <>Seat unknown</>
                    );
                  })()}
                </div>

                {renderMiniTable(arrivalModal.table, arrivalModal.guest.id)}
              </div>
            ) : (
              <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
                <strong>No table assigned yet.</strong> This guest doesn't
                have a table assignment.
              </div>
            )}

            <button
              onClick={() => setArrivalModal(null)}
              className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Guest List
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              {arrivedCount} of {totalGuests} arrived
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={arrivedCount === 0}
              className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw size={16} /> Reset
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mt-4 print:hidden">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search guests, groups, or tables…"
            aria-label="Search guests"
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

        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{
              width: totalGuests > 0 ? `${(arrivedCount / totalGuests) * 100}%` : "0%",
            }}
          />
        </div>
      </header>

      {/* Guest Groups */}
      <main className="max-w-4xl mx-auto space-y-6">
        {sortedColorKeys.map((colorHex) => {
          const groupGuests = groupedByColor[colorHex];
          const groupArrived = groupGuests.filter((g) => g.arrived).length;
          const groupName = getColorGroupName(colorHex);

          return (
            <section
              key={colorHex}
              className="guest-group-print-page bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ borderLeft: `4px solid ${colorHex}` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                  <h2 className="font-bold text-slate-800">{groupName}</h2>
                </div>
                <span className="text-xs font-bold text-slate-400 print:hidden">
                  {groupArrived}/{groupGuests.length} arrived
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {groupGuests
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((guest) => {
                    const guestTable = guest.table_id
                      ? tables.find((t) => t.id === guest.table_id)
                      : null;

                    return (
                      <div
                        key={guest.id}
                        className={`guest-list-row-print-safe flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                          guest.arrived ? "bg-green-50/50" : ""
                        }`}
                        onClick={() => toggleArrival(guest)}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                            guest.arrived
                              ? "bg-green-500 border-green-500"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {guest.arrived && (
                            <Check size={16} className="text-white" strokeWidth={3} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`font-semibold text-sm ${
                              guest.arrived
                                ? "text-slate-400 line-through"
                                : "text-slate-700"
                            }`}
                          >
                            {guest.name}
                          </span>
                          {guestTable && (
                            <span className="text-sm font-medium text-slate-600 ml-2 px-2 py-0.5 rounded border border-slate-200 bg-slate-100 print:bg-transparent whitespace-nowrap">
                              {guestTable.name}
                              {guestTable.nickname && (
                                <span className="print:hidden">
                                  {` (${guestTable.nickname})`}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {guest.arrived && (
                          <span className="text-xs font-bold text-green-500">
                            ✓ Here
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          );
        })}

        {sortedColorKeys.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <p className="text-lg font-medium">No guests yet</p>
            <p className="text-sm">Add guests from the planner page</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default GuestListPage;
