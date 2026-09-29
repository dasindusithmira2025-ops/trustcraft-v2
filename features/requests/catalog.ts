/** Service categories. Seeded into service_categories; keywords drive the classifier. */
export const CATEGORIES = [
  { id: "plumbing", name: "Plumbing", keywords: ["leak", "leaking", "pipe", "tap", "faucet", "drain", "blocked", "toilet", "flush", "water", "sink", "shower", "geyser", "tank", "overflow", "drip"] },
  { id: "electrical", name: "Electrical", keywords: ["power", "socket", "switch", "breaker", "trip", "tripping", "wiring", "light", "lights", "spark", "fuse", "short", "outlet", "electric", "generator", "db", "voltage"] },
  { id: "hvac", name: "Air conditioning", keywords: ["ac", "a/c", "aircon", "air", "conditioner", "cooling", "cool", "hvac", "ahu", "chiller", "compressor", "gas", "refrigerant", "vent", "split", "inverter", "hot"] },
  { id: "carpentry", name: "Carpentry", keywords: ["door", "hinge", "cabinet", "wood", "wooden", "wardrobe", "shelf", "window", "frame", "termite", "furniture"] },
  { id: "painting", name: "Painting", keywords: ["paint", "painting", "wall", "damp", "peeling", "ceiling", "colour", "color", "stain", "mould", "mold"] },
  { id: "cleaning", name: "Cleaning", keywords: ["clean", "cleaning", "deep", "sofa", "carpet", "move", "dust", "sanitize", "pressure"] },
  { id: "appliance", name: "Appliance repair", keywords: ["fridge", "refrigerator", "washing", "machine", "microwave", "oven", "dishwasher", "freezer", "dryer"] },
  { id: "lift", name: "Lifts & escalators", keywords: ["lift", "elevator", "escalator", "stuck", "cabin"] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

/**
 * Cities providers can serve, with where they sit. ponytail: a flat Sri Lankan list; replace with a
 * geo table (and radius search) when TrustCraft leaves the launch market.
 */
export const AREA_INFO = {
  Colombo: { district: "Colombo", province: "Western" },
  "Dehiwala-Mount Lavinia": { district: "Colombo", province: "Western" },
  Nugegoda: { district: "Colombo", province: "Western" },
  Kotte: { district: "Colombo", province: "Western" },
  Moratuwa: { district: "Colombo", province: "Western" },
  Negombo: { district: "Gampaha", province: "Western" },
  Gampaha: { district: "Gampaha", province: "Western" },
  Kalutara: { district: "Kalutara", province: "Western" },
  Kandy: { district: "Kandy", province: "Central" },
  Galle: { district: "Galle", province: "Southern" },
  Matara: { district: "Matara", province: "Southern" },
  Kurunegala: { district: "Kurunegala", province: "North Western" },
  Jaffna: { district: "Jaffna", province: "Northern" },
} as const;

export type City = keyof typeof AREA_INFO;
export const CITIES = Object.keys(AREA_INFO) as [City, ...City[]];

/** Cities grouped by province and district — the service-area picker's structure. */
export function areasByProvince() {
  const out = new Map<string, Map<string, City[]>>();
  for (const city of CITIES) {
    const { province, district } = AREA_INFO[city];
    const districts = out.get(province) ?? new Map<string, City[]>();
    districts.set(district, [...(districts.get(district) ?? []), city]);
    out.set(province, districts);
  }
  return out;
}

export const URGENCY_META = {
  emergency: { label: "Emergency", hint: "Today — something is unsafe or stopped working", tone: "danger" },
  soon: { label: "This week", hint: "Within the next few days", tone: "warning" },
  flexible: { label: "Flexible", hint: "Whenever suits — compare more quotes", tone: "neutral" },
} as const;
