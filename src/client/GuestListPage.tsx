import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Check, RotateCcw, Undo2, X, MapPin } from "lucide-react";
import type { Guest, ColorGroup } from "../shared/types";

interface Props {
  onBack: () => void;
}

interface AllGuest extends Guest {
  table_id: string | null;
  table_position?: number | null;
  arrived?: boolean;
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

  // Arrival modal state
  const [arrivalModal, setArrivalModal] = useState<{
    guest: AllGuest;
    table: TableInfo | null;
  } | null>(null);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

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
    } catch {
      // silent
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

    // Show modal when marking as arrived (not when unmarking)
    if (newArrived && guest.table_id) {
      const table = tables.find((t) => t.id === guest.table_id) ?? null;
      setArrivalModal({ guest: { ...guest, arrived: true }, table });
    }

    try {
      const response = await fetch(`/api/guests/${guest.id}/arrive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrived: newArrived }),
      });
      if (!response.ok) throw new Error("Failed to update arrival");
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

  const groupedByColor = allGuests.reduce<Record<string, AllGuest[]>>(
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

  // Mini table visualization for modal
  const renderMiniTable = (table: TableInfo, highlightGuestId: string) => {
    const maxSeats = table.max_seats;
    const half = Math.ceil(maxSeats / 2);
    const topSeats = Array.from({ length: half }, (_, i) => i);
    const bottomSeats = Array.from({ length: maxSeats - half }, (_, i) => half + i);

    const getSeatGuest = (seatIndex: number) =>
      table.guests[seatIndex] ?? null;

    const renderSeat = (seatIndex: number) => {
      const g = getSeatGuest(seatIndex);
      const isHighlighted = g?.id === highlightGuestId;
      return (
        <div
          key={seatIndex}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold border-2 transition-all ${
            isHighlighted
              ? "border-indigo-500 bg-indigo-100 text-indigo-700 scale-125 shadow-lg ring-2 ring-indigo-300"
              : g
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : "border-dashed border-slate-200 bg-white text-slate-300"
          }`}
          style={g && !isHighlighted ? { borderColor: g.color, backgroundColor: `${g.color}15` } : undefined}
          title={g ? g.name : `Seat ${seatIndex + 1}`}
        >
          {g ? g.name.charAt(0).toUpperCase() : ""}
        </div>
      );
    };

    return (
      <div className="flex flex-col items-center gap-2 my-4">
        <div className="flex gap-1.5 justify-center">
          {topSeats.map(renderSeat)}
        </div>
        <div className="w-full max-w-[200px] h-8 bg-slate-700 rounded-lg flex items-center justify-center">
          <span className="text-[9px] font-bold text-white tracking-wider">
            {table.name}
          </span>
        </div>
        <div className="flex gap-1.5 justify-center">
          {bottomSeats.map(renderSeat)}
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
                    &quot;{arrivalModal.table.nickname}&quot;
                  </p>
                )}
                <div className="text-xs text-slate-400 ml-6 mb-2">
                  Seat{" "}
                  {(arrivalModal.table.guests.findIndex(
                    (g) => g.id === arrivalModal.guest.id
                  ) ?? 0) + 1}{" "}
                  of {arrivalModal.table.max_seats}
                </div>

                {renderMiniTable(arrivalModal.table, arrivalModal.guest.id)}
              </div>
            ) : (
              <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
                <strong>No table assigned yet.</strong> This guest doesn&apos;t
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
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
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
                <span className="text-xs font-bold text-slate-400">
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
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
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
                            <span className="text-xs text-slate-400 ml-2">
                              {guestTable.name}
                              {guestTable.nickname
                                ? ` (${guestTable.nickname})`
                                : ""}
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
