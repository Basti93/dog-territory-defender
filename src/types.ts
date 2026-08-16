export interface Location {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

export interface Walk {
  id: string;
  startTime: number;
  locations: Location[];
  territory?: TerritoryPolygon;
  closed: boolean;
}

export interface TerritoryPolygon {
  coordinates: [number, number][];
  area: number;
}

export interface AppState {
  walk: Walk | null;
  isTracking: boolean;
  error: string | null;
}
