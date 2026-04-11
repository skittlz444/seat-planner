export interface Guest {
  id: string;
  name: string;
  color: string;
  table_id: string | null;
  table_position?: number | null;
  arrived?: number;
}

export interface Table {
  id: string;
  name: string;
  nickname: string | null;
  max_seats: number;
  sort_order: number;
  guests: Guest[];
}

export interface ColorGroup {
  hex: string;
  name: string;
}
