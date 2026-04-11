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
  nickname: string | null;
  max_seats: number;
  sort_order: number;
  guests: Guest[];
}
