export interface Guest {
  id: string;
  name: string;
  color: string;
  table_id: string | null;
  table_position?: number | null;
}

export interface Table {
  id: string;
  name: string;
  max_seats: number;
  guests: Guest[];
}
