/**
 * Build a position → guest map that preserves empty-seat gaps.
 *
 * Guests with a valid non-negative integer `table_position` are placed at that
 * position.  Guests whose position is null, undefined, negative, or a duplicate
 * of an already-occupied seat are assigned to the first free seat so they remain
 * visible in every view that renders seat slots.
 */
export function buildSeatMap<T extends { table_position?: number | null }>(
  guests: T[]
): Map<number, T> {
  const seatMap = new Map<number, T>();
  const occupiedSeats = new Set<number>();
  const unpositioned: T[] = [];

  for (const g of guests) {
    const pos = g.table_position;
    if (
      typeof pos === "number" &&
      Number.isInteger(pos) &&
      pos >= 0 &&
      !occupiedSeats.has(pos)
    ) {
      seatMap.set(pos, g);
      occupiedSeats.add(pos);
    } else {
      unpositioned.push(g);
    }
  }

  let nextFree = 0;
  for (const g of unpositioned) {
    while (occupiedSeats.has(nextFree)) {
      nextFree += 1;
    }
    seatMap.set(nextFree, g);
    occupiedSeats.add(nextFree);
    nextFree += 1;
  }

  return seatMap;
}
