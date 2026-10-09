export type IncidentType = "FLOOD" | "TRAFFIC_JAM";
export type IncidentStatus = "PENDING" | "VERIFIED" | "ACTIVE";
export type IncidentSource = "AFSC_SENSOR" | "COMMUNITY";
export interface Incident {
  id: string;
  type: IncidentType;
  severity: 1 | 2 | 3;
  status: IncidentStatus;
  title: string;
  description?: string | null;
  water_depth_cm: number | null;
  geometry: { type: "Point"; coordinates: [number, number] };
  source: IncidentSource;
  sensor_id?: string | null;
  crowd_verifications: { confirms: number; rejects: number };
  photo_url?: string | null;
  created_at: string;
  expires_at: string | null;
  is_demo?: boolean;
}
export interface RouteOption {
  id: string;
  distance_m: number;
  duration_s: number;
  geometry: [number, number][];
  risk_count: number;
  risk_score: number;
  nearby_incidents: string[];
  traffic_delay_s?: number;
}
export interface Camera {
  id: string; title: string; lat: number; lng: number;
  stream_url: string | null; updated_at: string | null;
  snapshot_url?: string | null; source_url?: string | null; source?: "PUBLIC_SNAPSHOT" | "SUPABASE";
}
