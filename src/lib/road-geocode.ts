/** Search results carry an explicit precision label; a street point is not a house entrance. */
export type AddressPrecision = "house" | "estimated" | "place" | "street";
export type TomTomCandidate = {
  id?: string;
  type?: string;
  score?: number;
  address?: {
    freeformAddress?: string;
    streetName?: string;
    streetNumber?: string;
    municipality?: string;
    municipalitySubdivision?: string;
  };
  poi?: { name?: string };
  position?: { lat?: number; lon?: number };
};
export type AddressResult = {
  id: string;
  name: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  source: "TomTom Search";
  precision: AddressPrecision;
  house_number: string | null;
  precision_label: string;
};

/** Includes 12/5, 12A, 12/5A, 12-14 as users commonly write VN house numbers. */
export function requestedHouseNumber(query: string): string | null {
  const match = query.trim().match(/^(?:số\s*(?:nhà\s*)?)?(\d+[a-zA-Z]?(?:[/-]\d+[a-zA-Z]?){0,4})(?=\s|,|$)/i);
  return match ? match[1].toUpperCase().replace(/-/g, "/") : null;
}
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function getHouseNumber(item: TomTomCandidate): string | null {
  const explicit = clean(item.address?.streetNumber);
  return requestedHouseNumber(explicit) ?? requestedHouseNumber(clean(item.address?.freeformAddress));
}
function validCityPoint(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 10.35 && lat <= 11.25 && lng >= 106.3 && lng <= 107.2;
}
const rank: Record<AddressPrecision, number> = { house: 0, estimated: 1, place: 2, street: 3 };
export function parseTomTomAddressResults(value: unknown, query: string): AddressResult[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { results?: unknown }).results)) return [];
  const wanted = requestedHouseNumber(query);
  const results = ((value as { results: unknown[] }).results).flatMap((unknownItem): AddressResult[] => {
    if (!unknownItem || typeof unknownItem !== "object") return [];
    const item = unknownItem as TomTomCandidate;
    const lat = item.position?.lat, lng = item.position?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !validCityPoint(lat, lng)) return [];
    const type = clean(item.type).toLowerCase();
    const number = getHouseNumber(item);
    const isPad = type === "pad" || type.includes("point address");
    const isRange = type === "addr" || type.includes("address range");
    // Never pass another numbered address off as the one the user typed.
    if (wanted && number && number !== wanted && (isPad || isRange)) return [];
    const precision: AddressPrecision = isPad && (!wanted || number === wanted)
      ? "house"
      : isRange && (!wanted || number === wanted)
        ? "estimated"
        : type === "poi" || type.includes("point of interest")
          ? "place"
          : "street";
    const street = clean(item.address?.streetName);
    const freeform = clean(item.address?.freeformAddress);
    const place = clean(item.poi?.name);
    const name = precision === "place"
      ? (place || freeform || street)
      : precision === "house" || precision === "estimated"
        ? ([number, street].filter(Boolean).join(" ") || freeform)
        : (street || freeform || place);
    if (!name) return [];
    const address = freeform || [number, street, clean(item.address?.municipalitySubdivision), clean(item.address?.municipality)].filter(Boolean).join(", ") || name;
    const precision_label = precision === "house" ? "Số nhà trong dữ liệu bản đồ"
      : precision === "estimated" ? "Vị trí số nhà nội suy (ước tính)"
        : precision === "place" ? "Địa điểm / tòa nhà"
          : "Vị trí đại diện của đường – chưa xác nhận số nhà";
    return [{ id: `${lat.toFixed(6)},${lng.toFixed(6)}:${number ?? "-"}:${precision}`, name,
      address, district: clean(item.address?.municipalitySubdivision) || clean(item.address?.municipality) || "TP.HCM",
      lat, lng, source: "TomTom Search", precision, house_number: number, precision_label }];
  });
  // Rank numbered address results before general streets; de-duplicate stable locations.
  results.sort((a, b) => rank[a.precision] - rank[b.precision]);
  const seen = new Set<string>();
  return results.filter(item => {
    const key = `${item.lat.toFixed(5)}:${item.lng.toFixed(5)}:${item.house_number ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}
