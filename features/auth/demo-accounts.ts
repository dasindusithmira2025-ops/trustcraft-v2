/** Sign-in shortcuts for the seeded demo world. Development only. */
export const DEMO_ENABLED = process.env.NODE_ENV !== "production" || process.env.TC_DEMO === "1";

export const DEMO_ACCOUNTS = [
  { experience: "Home", email: "tharushi@home.test", name: "Tharushi Wijesinghe", role: "Homeowner · Nugegoda" },
  { experience: "Service", email: "ruwan@abc-engineering.test", name: "Ruwan Silva", role: "Dispatcher · ABC Engineering" },
  { experience: "Service", email: "anura@abc-engineering.test", name: "Anura Bandara", role: "Owner · ABC Engineering" },
  { experience: "Service", email: "nimal@fernandoplumbing.test", name: "Nimal Fernando", role: "Independent plumber" },
  { experience: "Field", email: "kasun@abc-engineering.test", name: "Kasun Perera", role: "HVAC technician · ABC Engineering" },
  { experience: "Ops", email: "dilani@meridian-hotels.test", name: "Dilani Jayawardena", role: "Facility manager · Meridian Hospitality" },
  { experience: "Admin", email: "admin@trustcraft.test", name: "Malith Ranasinghe", role: "TrustCraft staff" },
] as const;
