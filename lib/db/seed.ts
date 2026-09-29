/**
 * Development demo world. Fictional organizations and people in a Sri Lankan launch
 * setting, anchored to "now" so SLA clocks and schedules are live when you open the app.
 * Every account uses the password DEMO_PASSWORD and a reserved `.test` email domain.
 */
import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { AREA_INFO, CATEGORIES } from "@/features/requests/catalog";
import { hashPassword } from "@/lib/auth/password";
import * as s from "./schema";
import { seedOperations } from "./seed-operations";

export const DEMO_PASSWORD = "trustcraft";

type Db = PgliteDatabase<typeof s>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Deterministic PRNG so the demo world is identical on every machine.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const rs = (rupees: number) => rupees * 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seed(db: Db) {
  const now = new Date();
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    await tx.insert(s.serviceCategories).values(CATEGORIES.map((c) => ({ id: c.id, name: c.name, keywords: [...c.keywords] })));

    // ── People ────────────────────────────────────────────────────────────
    const person = (name: string, email: string, phone: string) => ({ name, email, phone, passwordHash });
    const [
      tharushi, fathima, anura, ruwan, kasun, chamari, sampath, nadeesha, nimal, imran, priyanka, rizwan, dilani, harsha,
      , , thilina, sandali,
    ] = await tx
      .insert(s.users)
      .values([
        person("Tharushi Wijesinghe", "tharushi@home.test", "+94 77 245 8812"),
        person("Fathima Rizvi", "fathima@home.test", "+94 76 118 4420"),
        person("Anura Bandara", "anura@abc-engineering.test", "+94 11 258 3310"),
        person("Ruwan Silva", "ruwan@abc-engineering.test", "+94 77 390 1147"),
        person("Kasun Perera", "kasun@abc-engineering.test", "+94 71 882 0934"),
        person("Chamari Dias", "chamari@abc-engineering.test", "+94 70 441 7765"),
        person("Sampath Kumara", "sampath@abc-engineering.test", "+94 75 610 2289"),
        person("Nadeesha Fonseka", "nadeesha@abc-engineering.test", "+94 77 902 5516"),
        person("Nimal Fernando", "nimal@fernandoplumbing.test", "+94 77 731 4408"),
        person("Imran Hussain", "imran@coolair.test", "+94 11 273 9901"),
        person("Priyanka Selvaraj", "priyanka@brightspark.test", "+94 76 552 3019"),
        person("Mohamed Rizwan", "rizwan@summitlifts.test", "+94 11 244 6620"),
        person("Dilani Jayawardena", "dilani@meridian-hotels.test", "+94 77 118 9043"),
        person("Harsha Gunawardena", "harsha@meridian-hotels.test", "+94 77 604 2271"),
        // TrustCraft staff (platform admin) and CoolAir's small team.
        { ...person("Malith Ranasinghe", "admin@trustcraft.test", "+94 11 700 1000"), platformRole: "admin" as const },
        person("Iresha Gamage", "iresha@coolair.test", "+94 71 300 4410"),
        person("Thilina Rajapaksa", "thilina@coolair.test", "+94 76 220 1873"),
        person("Sandali Perera", "sandali@coolair.test", "+94 77 508 3392"),
      ])
      .returning();

    // Past customers behind the historical work — real accounts, not in the demo sign-in list.
    const pastNames = [
      "Lahiru Senanayake", "Ishara Madushani", "Dinesh Rathnayake", "Shalini Pathirana", "Mohamed Nazeer",
      "Kavindya Herath", "Suresh Thevarajah", "Nirosha Ekanayake", "Chathura Wickramasinghe", "Ayesha Farook",
      "Pradeep Karunaratne", "Hasini Samarasinghe",
    ];
    const pastUsers = await tx
      .insert(s.users)
      .values(pastNames.map((n, i) => person(n, `customer${i + 1}@history.test`, `+94 77 000 ${String(1000 + i)}`)))
      .returning();

    // ── Organizations ─────────────────────────────────────────────────────
    const [abc, fernando, coolair, brightspark, summit, meridian] = await tx
      .insert(s.organizations)
      .values([
        { slug: "abc-engineering", name: "ABC Engineering (Pvt) Ltd", kind: "provider", segment: "company", modules: ["dispatch", "recurring", "reports"], phone: "+94 11 258 3300", email: "service@abc-engineering.test", address: "No. 41, Havelock Road, Colombo 05", taxRateBps: 1800, taxLabel: "VAT", paymentTermsDays: 14, invoiceFooter: "Bank transfer: ABC Engineering, Commercial Bank 8001234567. Thank you for your business." },
        { slug: "fernando-plumbing", name: "Nimal Fernando Plumbing", kind: "provider", segment: "solo", modules: [], phone: "+94 77 731 4408", email: "nimal@fernandoplumbing.test", address: "Nugegoda", paymentTermsDays: 7 },
        { slug: "coolair", name: "CoolAir Services (Pvt) Ltd", kind: "provider", segment: "team", modules: ["recurring"], phone: "+94 11 273 9900", email: "hello@coolair.test", address: "No. 9, High Level Road, Nugegoda" },
        { slug: "brightspark", name: "BrightSpark Electrical", kind: "provider", segment: "solo", modules: [], phone: "+94 76 552 3019" },
        { slug: "summit-lifts", name: "Summit Lift & Escalator", kind: "provider", segment: "team", modules: ["recurring"], phone: "+94 11 244 6600" },
        { slug: "meridian", name: "Meridian Hospitality (Pvt) Ltd", kind: "enterprise", orgType: "hotel", modules: ["locations", "assets", "maintenance"], phone: "+94 11 244 8800", email: "operations@meridian-hotels.test", address: "No. 88, Galle Road, Colombo 03" },
      ])
      .returning();

    await tx.insert(s.memberships).values([
      { userId: anura!.id, orgId: abc!.id, role: "owner", title: "Managing Director" },
      { userId: ruwan!.id, orgId: abc!.id, role: "dispatcher", title: "Service Coordinator" },
      { userId: kasun!.id, orgId: abc!.id, role: "technician", title: "Senior HVAC Technician", skills: ["hvac", "electrical"] },
      { userId: chamari!.id, orgId: abc!.id, role: "technician", title: "HVAC Technician", skills: ["hvac"] },
      { userId: sampath!.id, orgId: abc!.id, role: "technician", title: "MEP Technician", skills: ["electrical", "plumbing"] },
      { userId: nadeesha!.id, orgId: abc!.id, role: "finance", title: "Accounts" },
      { userId: nimal!.id, orgId: fernando!.id, role: "owner", title: "Master Plumber", skills: ["plumbing"] },
      { userId: imran!.id, orgId: coolair!.id, role: "owner", title: "Director" },
      { userId: sandali!.id, orgId: coolair!.id, role: "dispatcher", title: "Service Coordinator" },
      { userId: thilina!.id, orgId: coolair!.id, role: "technician", title: "AC Technician", skills: ["hvac", "appliance"] },
      { userId: priyanka!.id, orgId: brightspark!.id, role: "owner", title: "Licensed Electrician", skills: ["electrical"] },
      { userId: rizwan!.id, orgId: summit!.id, role: "owner", title: "Director" },
      { userId: dilani!.id, orgId: meridian!.id, role: "facility_manager", title: "Facilities Manager" },
      { userId: harsha!.id, orgId: meridian!.id, role: "admin", title: "Director of Operations" },
    ]);

    const verified = at(-400 * DAY);
    await tx.insert(s.providerProfiles).values([
      {
        orgId: abc!.id,
        headline: "Mechanical, electrical and plumbing services for hotels, offices and homes",
        about: "ABC Engineering maintains HVAC, electrical and plumbing systems for hospitality and commercial sites across the Western and Central provinces. 24/7 emergency cover for contracted clients.",
        categories: ["hvac", "electrical", "plumbing"],
        foundedYear: 2009,
        teamSize: 24,
        verifiedAt: verified,
        credentials: [
          { name: "CIDA registration — EM2", issuer: "Construction Industry Development Authority", expiresOn: iso(at(180 * DAY)) },
          { name: "NVQ Level 4 — Refrigeration & Air Conditioning", issuer: "Tertiary and Vocational Education Commission", expiresOn: null },
          { name: "Public liability insurance — Rs 50M", issuer: "Registered insurer (on file)", expiresOn: iso(at(34 * DAY)) },
        ],
      },
      {
        orgId: fernando!.id,
        headline: "Leaks, blockages and bathroom plumbing — same-day in Colombo south",
        about: "Independent master plumber with 18 years of residential experience. Clear fixed quotes before any work starts.",
        categories: ["plumbing"],
        foundedYear: 2008,
        teamSize: 1,
        verifiedAt: verified,
        credentials: [{ name: "NVQ Level 3 — Plumbing", issuer: "Tertiary and Vocational Education Commission", expiresOn: null }],
      },
      {
        orgId: coolair!.id,
        headline: "Split, cassette and VRF air-conditioning service and installation",
        about: "Air-conditioning specialists for homes and small offices. Authorised installer for major inverter brands.",
        categories: ["hvac", "appliance"],
        foundedYear: 2014,
        teamSize: 8,
        verifiedAt: verified,
        credentials: [{ name: "NVQ Level 4 — Refrigeration & Air Conditioning", issuer: "Tertiary and Vocational Education Commission", expiresOn: null }],
      },
      {
        orgId: brightspark!.id,
        headline: "Residential wiring, DB boards and fault finding",
        about: "Licensed electrician covering Colombo and the suburbs. Evening appointments available.",
        categories: ["electrical"],
        foundedYear: 2019,
        teamSize: 2,
        verifiedAt: verified,
        credentials: [
          { name: "Electrician licence", issuer: "Public Utilities Commission of Sri Lanka", expiresOn: iso(at(-20 * DAY)) },
        ],
      },
      {
        orgId: summit!.id,
        headline: "Lift and escalator maintenance contracts",
        about: "Maintenance and breakdown response for passenger and service lifts.",
        categories: ["lift"],
        foundedYear: 2025,
        teamSize: 6,
        verifiedAt: null,
        credentials: [],
      },
    ]);

    const area = (org: { id: string }, cities: (keyof typeof AREA_INFO)[]) =>
      cities.map((city) => ({ orgId: org.id, city, district: AREA_INFO[city].district, province: AREA_INFO[city].province }));
    await tx.insert(s.serviceAreas).values([
      ...area(abc!, ["Colombo", "Dehiwala-Mount Lavinia", "Nugegoda", "Kotte", "Kandy"]),
      ...area(fernando!, ["Nugegoda", "Kotte", "Dehiwala-Mount Lavinia", "Colombo"]),
      ...area(coolair!, ["Colombo", "Nugegoda", "Kotte", "Negombo"]),
      ...area(brightspark!, ["Colombo", "Nugegoda", "Dehiwala-Mount Lavinia"]),
      ...area(summit!, ["Colombo", "Kandy", "Galle"]),
    ]);

    // ── Meridian: locations and assets ───────────────────────────────────
    const [colombo, kandy, galle] = await tx
      .insert(s.locations)
      .values([
        { orgId: meridian!.id, kind: "site", name: "Meridian Colombo", address: "No. 88, Galle Road, Colombo 03", city: "Colombo" },
        { orgId: meridian!.id, kind: "site", name: "Meridian Kandy", address: "No. 12, Peradeniya Road, Kandy", city: "Kandy" },
        // Galle has no sub-levels — hierarchy is optional.
        { orgId: meridian!.id, kind: "site", name: "Meridian Galle Fort", address: "No. 4, Church Street, Galle Fort", city: "Galle" },
      ])
      .returning();
    const [floor4, roof, lobby, floor12, kandyKitchen, kandyPlant] = await tx
      .insert(s.locations)
      .values([
        { orgId: meridian!.id, parentId: colombo!.id, kind: "floor", name: "Floor 4" },
        { orgId: meridian!.id, parentId: colombo!.id, kind: "area", name: "Roof plant room" },
        { orgId: meridian!.id, parentId: colombo!.id, kind: "area", name: "Lobby" },
        { orgId: meridian!.id, parentId: colombo!.id, kind: "floor", name: "Floor 12" },
        { orgId: meridian!.id, parentId: kandy!.id, kind: "area", name: "Main kitchen" },
        { orgId: meridian!.id, parentId: kandy!.id, kind: "area", name: "Plant room" },
      ])
      .returning();

    const asset = (
      tag: string, name: string, categoryId: string, locationId: string, manufacturer: string, model: string,
      status: s.AssetStatus, intervalDays: number, lastDaysAgo: number, installedYearsAgo: number, warrantyYears: number,
    ) => ({
      orgId: meridian!.id, tag, name, categoryId, locationId, manufacturer, model, status,
      serial: `${tag.replace(/[^A-Z0-9]/g, "")}-${(tag.length * 7919).toString(36).toUpperCase()}`,
      serviceIntervalDays: intervalDays,
      lastServicedOn: iso(at(-lastDaysAgo * DAY)),
      nextServiceOn: iso(at((intervalDays - lastDaysAgo) * DAY)),
      installedOn: iso(at(-installedYearsAgo * 365 * DAY)),
      warrantyUntil: iso(at((warrantyYears - installedYearsAgo) * 365 * DAY)),
    });
    const [ahu04, ahu02, ch01, gen01, , pump02, fcu1208, exhaustK] = await tx
      .insert(s.assets)
      .values([
        asset("AHU-04", "Air handling unit — Floor 4", "hvac", floor4!.id, "Daikin", "Modular AHU D-AHU 12", "degraded", 90, 84, 6, 5),
        asset("AHU-02", "Air handling unit — Floor 2", "hvac", colombo!.id, "Daikin", "Modular AHU D-AHU 12", "operational", 90, 76, 6, 5),
        asset("CH-01", "Water-cooled chiller", "hvac", roof!.id, "Carrier", "30XW-0652", "operational", 30, 26, 8, 5),
        asset("GEN-01", "Standby generator 500 kVA", "electrical", roof!.id, "Cummins", "C500 D5", "operational", 30, 29, 7, 3),
        asset("LIFT-A", "Guest lift A", "lift", lobby!.id, "Schindler", "5500", "operational", 30, 41, 9, 2),
        asset("PUMP-02", "Domestic water booster pump", "plumbing", roof!.id, "Grundfos", "Hydro MPC-E", "operational", 180, 120, 4, 3),
        asset("FCU-1208", "Fan coil unit — Room 1208", "hvac", floor12!.id, "Daikin", "FWB07", "degraded", 180, 150, 6, 5),
        asset("EXH-K1", "Kitchen exhaust fan", "hvac", kandyKitchen!.id, "Kruger", "BDB 450", "down", 90, 101, 5, 3),
        asset("AHU-K1", "Air handling unit — Lobby", "hvac", kandyPlant!.id, "Carrier", "39HQ", "operational", 90, 20, 3, 5),
        asset("BLR-K1", "Hot water calorifier", "plumbing", kandyPlant!.id, "Racold", "CW-2000", "operational", 180, 200, 10, 2),
        asset("AC-G01", "Split AC — Reception", "hvac", galle!.id, "Mitsubishi Electric", "MSY-GR50", "operational", 90, 60, 2, 3),
        asset("LIFT-G", "Service lift", "lift", galle!.id, "Schindler", "3300", "operational", 30, 36, 4, 2),
      ])
      .returning();

    // ── Customers of each provider ───────────────────────────────────────
    const [abcMeridian, abcTharushi] = await tx
      .insert(s.customers)
      .values([
        { providerOrgId: abc!.id, name: "Meridian Hospitality (Pvt) Ltd", clientOrgId: meridian!.id, email: "dilani@meridian-hotels.test", phone: "+94 11 244 8800", address: "No. 88, Galle Road, Colombo 03" },
        { providerOrgId: abc!.id, name: "Tharushi Wijesinghe", userId: tharushi!.id, email: "tharushi@home.test", phone: "+94 77 245 8812", address: "No. 27/3, Stanley Thilakaratne Mawatha, Nugegoda" },
        { providerOrgId: abc!.id, name: "Fathima Rizvi", userId: fathima!.id, email: "fathima@home.test", phone: "+94 76 118 4420", address: "No. 5, Hospital Road, Kalubowila, Dehiwala" },
      ])
      .returning();

    const providers = [
      { org: abc!, jobs: 420, quality: 0.9, slaMet: 0.97, drift: 0.03, responseMin: 45, techs: [kasun!, chamari!, sampath!], cats: ["hvac", "electrical", "plumbing"], price: [8_500, 185_000] },
      { org: coolair!, jobs: 260, quality: 0.84, slaMet: 0.9, drift: 0.06, responseMin: 210, techs: [imran!], cats: ["hvac", "appliance"], price: [6_500, 95_000] },
      { org: fernando!, jobs: 64, quality: 0.95, slaMet: 0.95, drift: 0.02, responseMin: 25, techs: [nimal!], cats: ["plumbing"], price: [3_500, 42_000] },
      { org: brightspark!, jobs: 18, quality: 0.72, slaMet: 0.78, drift: 0.12, responseMin: 380, techs: [priyanka!], cats: ["electrical"], price: [4_000, 55_000] },
      { org: summit!, jobs: 2, quality: 0.9, slaMet: 1, drift: 0, responseMin: 90, techs: [rizwan!], cats: ["lift"], price: [25_000, 120_000] },
    ];

    const pastCustomerRows = await tx
      .insert(s.customers)
      .values(
        providers.flatMap((p) =>
          pastUsers.map((u) => ({ providerOrgId: p.org.id, name: u.name, userId: u.id, email: u.email, phone: u.phone, address: "Colombo" })),
        ),
      )
      .returning();

    await seedHistory(tx, { providers, pastCustomers: pastCustomerRows, pastUsers, now });

    // ── Live work for ABC Engineering ────────────────────────────────────
    const checklist = (labels: string[], done: number): s.ChecklistItem[] =>
      labels.map((label, i) => ({ id: `c${i + 1}`, label, done: i < done }));
    const HVAC_CHECKS = [
      "Isolate unit and confirm lock-out",
      "Inspect coil and drain pan",
      "Check refrigerant pressures",
      "Inspect fan belt and bearings",
      "Clean or replace filters",
      "Restore power and test cooling",
      "Record supply-air temperature",
    ];
    const colomboAddress = "Meridian Colombo, No. 88, Galle Road, Colombo 03";
    const kandyAddress = "Meridian Kandy, No. 12, Peradeniya Road, Kandy";
    const base = { providerOrgId: abc!.id, currency: "LKR" };
    const meridianWo = { ...base, customerId: abcMeridian!.id, clientOrgId: meridian!.id };

    const live = await tx
      .insert(s.workOrders)
      .values([
        {
          ...meridianWo, title: "HVAC cooling failure — AHU-04", categoryId: "hvac", priority: "critical", status: "in_progress",
          description: "Floor 4 guest corridor and rooms 401–420 above 29 °C. Unit running but supply air is warm. Suspected iced coil.",
          address: colomboAddress, locationId: floor4!.id, assetId: ahu04!.id, assigneeUserId: kasun!.id,
          scheduledStart: at(-70 * MIN), scheduledEnd: at(110 * MIN), slaDueAt: at(102 * MIN), amountMinor: rs(48_500),
          checklist: checklist(HVAC_CHECKS, 4), startedAt: at(-52 * MIN), createdAt: at(-138 * MIN),
        },
        {
          ...meridianWo, title: "Chiller low refrigerant pressure alarm", categoryId: "hvac", priority: "high", status: "scheduled",
          description: "BMS reporting low suction pressure on circuit B intermittently since last night.",
          address: colomboAddress, locationId: roof!.id, assetId: ch01!.id, assigneeUserId: chamari!.id,
          scheduledStart: at(3 * HOUR), scheduledEnd: at(5 * HOUR), slaDueAt: at(9 * HOUR), amountMinor: rs(36_000),
          checklist: checklist(HVAC_CHECKS, 0), createdAt: at(-3 * HOUR),
        },
        {
          ...meridianWo, title: "Kitchen exhaust fan not starting", categoryId: "hvac", priority: "high", status: "open",
          description: "Main kitchen exhaust tripped during breakfast service and will not restart. Kitchen running on reduced capacity.",
          address: kandyAddress, locationId: kandyKitchen!.id, assetId: exhaustK!.id,
          slaDueAt: at(38 * MIN), amountMinor: null, checklist: [], createdAt: at(-11 * HOUR - 22 * MIN),
        },
        {
          ...meridianWo, title: "Noisy fan coil unit — Room 1208", categoryId: "hvac", priority: "normal", status: "open",
          description: "Guest complaint: rattling noise from ceiling unit at night.",
          address: colomboAddress, locationId: floor12!.id, assetId: fcu1208!.id,
          slaDueAt: at(31 * HOUR), checklist: [], createdAt: at(-17 * HOUR),
        },
        {
          ...meridianWo, title: "Quarterly filter change — AHU-02", categoryId: "hvac", priority: "low", status: "scheduled",
          description: "Planned maintenance: replace pre-filters and bag filters, check belt tension.",
          address: colomboAddress, locationId: colombo!.id, assetId: ahu02!.id, assigneeUserId: kasun!.id,
          scheduledStart: at(5 * HOUR + 30 * MIN), scheduledEnd: at(7 * HOUR), slaDueAt: at(4 * DAY), amountMinor: rs(22_000),
          checklist: checklist(["Isolate unit", "Replace pre-filters", "Replace bag filters", "Check belt tension", "Record pressure drop"], 0),
          createdAt: at(-6 * DAY),
        },
        {
          ...meridianWo, title: "Generator monthly service — GEN-01", categoryId: "electrical", priority: "low", status: "scheduled",
          description: "Monthly load test, oil and coolant check, battery inspection.",
          address: colomboAddress, locationId: roof!.id, assetId: gen01!.id, assigneeUserId: sampath!.id,
          scheduledStart: at(DAY + 2 * HOUR), scheduledEnd: at(DAY + 4 * HOUR), slaDueAt: at(3 * DAY), amountMinor: rs(18_500),
          checklist: checklist(["Check oil and coolant", "Inspect batteries", "Run 30-min load test", "Log hours"], 0),
          createdAt: at(-9 * DAY),
        },
        {
          ...meridianWo, title: "DB board tripping — Level 2 corridor", categoryId: "electrical", priority: "normal", status: "on_hold",
          holdReason: "Waiting for replacement 63A RCCB — supplier delivery tomorrow",
          description: "Distribution board DB-L2 trips when housekeeping equipment is in use.",
          address: kandyAddress, locationId: kandy!.id, assigneeUserId: sampath!.id,
          scheduledStart: at(-DAY), scheduledEnd: at(-DAY + 2 * HOUR), slaDueAt: at(26 * HOUR), amountMinor: rs(27_500),
          checklist: checklist(["Isolate DB", "Megger test circuits", "Replace RCCB", "Load test"], 2), startedAt: at(-DAY + 20 * MIN),
          createdAt: at(-2 * DAY),
        },
        {
          ...meridianWo, title: "Lobby lighting circuit repair", categoryId: "electrical", priority: "normal", status: "awaiting_verification",
          description: "Half of the lobby downlights off. Faulty driver suspected.",
          address: colomboAddress, locationId: lobby!.id, assigneeUserId: sampath!.id,
          scheduledStart: at(-5 * HOUR), scheduledEnd: at(-3 * HOUR), slaDueAt: at(20 * HOUR), amountMinor: rs(31_200),
          checklist: checklist(["Isolate circuit", "Replace faulty drivers", "Test all fittings"], 3),
          completionNote: "Replaced 6 failed LED drivers (Philips Xitanium 36W). All 24 lobby downlights tested and working.",
          startedAt: at(-5 * HOUR), completedAt: at(-3 * HOUR - 10 * MIN), createdAt: at(-26 * HOUR),
        },
        {
          ...base, customerId: abcTharushi!.id, title: "Split AC leaking water — master bedroom", categoryId: "hvac", priority: "normal",
          status: "awaiting_verification", description: "Water dripping from the indoor unit onto the floor when running.",
          address: "No. 27/3, Stanley Thilakaratne Mawatha, Nugegoda", assigneeUserId: kasun!.id,
          scheduledStart: at(-22 * HOUR), scheduledEnd: at(-20 * HOUR), slaDueAt: at(26 * HOUR), amountMinor: rs(9_500),
          checklist: checklist(["Inspect drain line", "Clear blockage", "Clean indoor coil", "Test for 20 minutes"], 4),
          completionNote: "Drain line was blocked with algae. Flushed and cleared, cleaned indoor coil and filter. Ran for 20 minutes with no leak.",
          startedAt: at(-22 * HOUR), completedAt: at(-20 * HOUR - 25 * MIN), createdAt: at(-2 * DAY),
        },
      ])
      .returning();
    const [woAhu, woChiller, woExhaust, woFcu, woFilter, woGen, woDb, woLobby, woTharushi] = live;

    const ev = (workOrderId: string, userId: string, type: string, summary: string, occurredAt: Date, data = {}) => ({
      workOrderId, actorUserId: userId, type, summary, occurredAt, data,
    });
    await tx.insert(s.activityEvents).values([
      ev(woAhu!.id, dilani!.id, "created", "Work order created by Dilani Jayawardena", at(-138 * MIN)),
      ev(woAhu!.id, ruwan!.id, "assigned", "Assigned to Kasun Perera", at(-131 * MIN)),
      ev(woAhu!.id, kasun!.id, "accepted", "Kasun Perera accepted the job", at(-126 * MIN)),
      ev(woAhu!.id, kasun!.id, "en_route", "Kasun Perera is on the way", at(-95 * MIN)),
      ev(woAhu!.id, kasun!.id, "started", "Checked in on site", at(-52 * MIN)),
      ev(woAhu!.id, kasun!.id, "asset_scanned", "Scanned AHU-04", at(-50 * MIN)),
      ev(woAhu!.id, kasun!.id, "evidence", "Added 2 photos", at(-44 * MIN)),
      ev(woAhu!.id, kasun!.id, "checklist", "Completed 4 of 7 checklist steps", at(-12 * MIN)),
      ev(woChiller!.id, dilani!.id, "created", "Work order created by Dilani Jayawardena", at(-3 * HOUR)),
      ev(woChiller!.id, ruwan!.id, "assigned", "Assigned to Chamari Dias", at(-2 * HOUR - 40 * MIN)),
      ev(woExhaust!.id, harsha!.id, "created", "Work order created by Harsha Gunawardena", at(-11 * HOUR - 22 * MIN)),
      ev(woFcu!.id, dilani!.id, "created", "Work order created by Dilani Jayawardena", at(-17 * HOUR)),
      ev(woFilter!.id, ruwan!.id, "created", "Planned maintenance generated for AHU-02", at(-6 * DAY)),
      ev(woFilter!.id, ruwan!.id, "assigned", "Assigned to Kasun Perera", at(-5 * DAY)),
      ev(woGen!.id, ruwan!.id, "created", "Planned maintenance generated for GEN-01", at(-9 * DAY)),
      ev(woGen!.id, ruwan!.id, "assigned", "Assigned to Sampath Kumara", at(-8 * DAY)),
      ev(woDb!.id, harsha!.id, "created", "Work order created by Harsha Gunawardena", at(-2 * DAY)),
      ev(woDb!.id, ruwan!.id, "assigned", "Assigned to Sampath Kumara", at(-2 * DAY + 30 * MIN)),
      ev(woDb!.id, sampath!.id, "started", "Checked in on site", at(-DAY + 20 * MIN)),
      ev(woDb!.id, sampath!.id, "on_hold", "Paused — waiting for replacement 63A RCCB", at(-DAY + 95 * MIN)),
      ev(woLobby!.id, dilani!.id, "created", "Work order created by Dilani Jayawardena", at(-26 * HOUR)),
      ev(woLobby!.id, ruwan!.id, "assigned", "Assigned to Sampath Kumara", at(-25 * HOUR)),
      ev(woLobby!.id, sampath!.id, "started", "Checked in on site", at(-5 * HOUR)),
      ev(woLobby!.id, sampath!.id, "evidence", "Added 2 photos", at(-3 * HOUR - 20 * MIN)),
      ev(woLobby!.id, sampath!.id, "completed", "Work completed — awaiting your verification", at(-3 * HOUR - 10 * MIN)),
      ev(woTharushi!.id, tharushi!.id, "created", "Booked by Tharushi Wijesinghe", at(-2 * DAY)),
      ev(woTharushi!.id, ruwan!.id, "assigned", "Assigned to Kasun Perera", at(-2 * DAY + 40 * MIN)),
      ev(woTharushi!.id, kasun!.id, "started", "Checked in on site", at(-22 * HOUR)),
      ev(woTharushi!.id, kasun!.id, "evidence", "Added 2 photos", at(-20 * HOUR - 40 * MIN)),
      ev(woTharushi!.id, kasun!.id, "completed", "Work completed — awaiting your verification", at(-20 * HOUR - 25 * MIN)),
    ]);

    const photo = (workOrderId: string, userId: string, phase: "before" | "during" | "after", caption: string, capturedAt: Date) => ({
      workOrderId, capturedByUserId: userId, kind: "photo" as const, phase, caption, capturedAt,
    });
    await tx.insert(s.evidence).values([
      { workOrderId: woAhu!.id, capturedByUserId: kasun!.id, kind: "scan", phase: "before", caption: "Asset tag AHU-04 scanned on site", capturedAt: at(-50 * MIN) },
      photo(woAhu!.id, kasun!.id, "before", "Evaporator coil iced over", at(-46 * MIN)),
      photo(woAhu!.id, kasun!.id, "before", "Condensate drain pan overflowing", at(-44 * MIN)),
      photo(woLobby!.id, sampath!.id, "before", "Failed LED drivers removed", at(-4 * HOUR)),
      photo(woLobby!.id, sampath!.id, "after", "All lobby downlights working", at(-3 * HOUR - 20 * MIN)),
      photo(woTharushi!.id, kasun!.id, "before", "Algae blockage in drain line", at(-21 * HOUR)),
      photo(woTharushi!.id, kasun!.id, "after", "Cleaned coil and clear drain", at(-20 * HOUR - 40 * MIN)),
      { workOrderId: woTharushi!.id, capturedByUserId: kasun!.id, kind: "note", phase: "after", caption: "Recommend cleaning the drain line every 6 months.", capturedAt: at(-20 * HOUR - 30 * MIN) },
    ]);

    // Recent finished work for Meridian with invoices — one paid, one due, one overdue.
    const finished = await tx
      .insert(s.workOrders)
      .values([
        {
          ...meridianWo, title: "Booster pump pressure fault — PUMP-02", categoryId: "plumbing", priority: "high", status: "completed",
          address: colomboAddress, locationId: roof!.id, assetId: pump02!.id, assigneeUserId: sampath!.id,
          slaDueAt: at(-6 * DAY), amountMinor: rs(64_800), checklist: [], startedAt: at(-7 * DAY), completedAt: at(-7 * DAY + 3 * HOUR),
          verifiedAt: at(-6 * DAY - 12 * HOUR), createdAt: at(-7 * DAY - 2 * HOUR),
          completionNote: "Replaced pressure transmitter, recalibrated set point to 4.2 bar.",
        },
        {
          ...meridianWo, title: "AHU-04 belt replacement", categoryId: "hvac", priority: "normal", status: "completed",
          address: colomboAddress, locationId: floor4!.id, assetId: ahu04!.id, assigneeUserId: kasun!.id,
          slaDueAt: at(-80 * DAY), amountMinor: rs(28_400), checklist: [], startedAt: at(-84 * DAY), completedAt: at(-84 * DAY + 2 * HOUR),
          verifiedAt: at(-83 * DAY), createdAt: at(-85 * DAY), completionNote: "Replaced worn drive belt set and aligned pulleys.",
        },
        {
          ...meridianWo, title: "Kitchen exhaust fan bearing replacement", categoryId: "hvac", priority: "high", status: "completed",
          address: kandyAddress, locationId: kandyKitchen!.id, assetId: exhaustK!.id, assigneeUserId: chamari!.id,
          slaDueAt: at(-40 * DAY), amountMinor: rs(41_000), checklist: [], startedAt: at(-41 * DAY), completedAt: at(-41 * DAY + 4 * HOUR),
          verifiedAt: at(-40 * DAY), createdAt: at(-41 * DAY - 5 * HOUR), completionNote: "Replaced both bearings; vibration within limits.",
        },
      ])
      .returning();
    await tx.insert(s.invoices).values([
      { workOrderId: finished[0]!.id, providerOrgId: abc!.id, customerId: abcMeridian!.id, amountMinor: rs(64_800), currency: "LKR", status: "issued", issuedAt: at(-6 * DAY), dueAt: at(8 * DAY) },
      { workOrderId: finished[1]!.id, providerOrgId: abc!.id, customerId: abcMeridian!.id, amountMinor: rs(28_400), currency: "LKR", status: "paid", issuedAt: at(-83 * DAY), dueAt: at(-69 * DAY), paidAt: at(-70 * DAY) },
      { workOrderId: finished[2]!.id, providerOrgId: abc!.id, customerId: abcMeridian!.id, amountMinor: rs(41_000), currency: "LKR", status: "issued", issuedAt: at(-40 * DAY), dueAt: at(-26 * DAY) },
    ]);
    for (const f of finished) {
      await tx.insert(s.activityEvents).values([
        ev(f.id, dilani!.id, "created", "Work order created by Dilani Jayawardena", f.createdAt),
        ev(f.id, f.assigneeUserId!, "completed", "Work completed", f.completedAt!),
        ev(f.id, dilani!.id, "verified", "Verified by Dilani Jayawardena", f.verifiedAt!),
      ]);
    }

    // ── Open service requests (the marketplace side) ─────────────────────
    const [sinkReq, fanReq, poolReq] = await tx
      .insert(s.serviceRequests)
      .values([
        {
          requesterUserId: tharushi!.id, categoryId: "plumbing", title: "Kitchen sink blocked and draining slowly",
          description: "The kitchen sink has been draining slowly for a week and is now fully blocked. There is a bad smell from the drain.",
          address: "No. 27/3, Stanley Thilakaratne Mawatha, Nugegoda", urgency: "soon", createdAt: at(-5 * HOUR),
        },
        {
          requesterUserId: fathima!.id, categoryId: "electrical", title: "Ceiling fan wobbling and sparking at the switch",
          description: "Living room ceiling fan wobbles at high speed and the wall switch sparked twice this morning.",
          address: "No. 5, Hospital Road, Kalubowila, Dehiwala", urgency: "emergency", createdAt: at(-40 * MIN),
        },
        {
          requesterUserId: dilani!.id, requesterOrgId: meridian!.id, categoryId: "plumbing", title: "Pool circulation pump making grinding noise",
          description: "Pool pump at Meridian Colombo started grinding this morning. Pool still circulating.",
          address: colomboAddress, locationId: colombo!.id, urgency: "soon", createdAt: at(-2 * HOUR),
        },
      ])
      .returning();
    await tx.insert(s.requestInvites).values([
      { requestId: sinkReq!.id, providerOrgId: fernando!.id, status: "quoted", createdAt: at(-5 * HOUR) },
      { requestId: sinkReq!.id, providerOrgId: abc!.id, status: "quoted", createdAt: at(-5 * HOUR) },
      { requestId: fanReq!.id, providerOrgId: abc!.id, status: "pending", createdAt: at(-40 * MIN) },
      { requestId: fanReq!.id, providerOrgId: brightspark!.id, status: "pending", createdAt: at(-40 * MIN) },
      { requestId: poolReq!.id, providerOrgId: abc!.id, status: "pending", createdAt: at(-2 * HOUR) },
    ]);
    await tx.insert(s.quotes).values([
      {
        requestId: sinkReq!.id, providerOrgId: fernando!.id, authorUserId: nimal!.id, currency: "LKR", totalMinor: rs(6_500),
        lines: [
          { description: "Call-out and inspection", quantity: 1, unitMinor: rs(1_500) },
          { description: "Clear blockage with drain machine", quantity: 1, unitMinor: rs(3_500) },
          { description: "Replace sink trap (PVC)", quantity: 1, unitMinor: rs(1_500) },
        ],
        note: "Can come tomorrow between 9 and 11 am. Price is fixed unless the pipe inside the wall is damaged — I will tell you before doing anything extra.",
        earliestStart: at(DAY), createdAt: at(-4 * HOUR - 35 * MIN),
      },
      {
        requestId: sinkReq!.id, providerOrgId: abc!.id, authorUserId: ruwan!.id, currency: "LKR", totalMinor: rs(9_800),
        lines: [
          { description: "Plumbing technician visit (2 hours)", quantity: 1, unitMinor: rs(6_000) },
          { description: "High-pressure drain jetting", quantity: 1, unitMinor: rs(3_800) },
        ],
        note: "Technician available today after 4 pm.",
        earliestStart: at(4 * HOUR), createdAt: at(-3 * HOUR - 50 * MIN),
      },
    ]);
    await tx.insert(s.activityEvents).values([
      { requestId: sinkReq!.id, actorUserId: tharushi!.id, type: "created", summary: "Request sent to 2 professionals", occurredAt: at(-5 * HOUR) },
      { requestId: sinkReq!.id, actorUserId: nimal!.id, type: "quoted", summary: "Nimal Fernando Plumbing sent a quote", occurredAt: at(-4 * HOUR - 35 * MIN) },
      { requestId: sinkReq!.id, actorUserId: ruwan!.id, type: "quoted", summary: "ABC Engineering sent a quote", occurredAt: at(-3 * HOUR - 50 * MIN) },
      { requestId: fanReq!.id, actorUserId: fathima!.id, type: "created", summary: "Request sent to 2 professionals", occurredAt: at(-40 * MIN) },
      { requestId: poolReq!.id, actorUserId: dilani!.id, type: "created", summary: "Request sent to ABC Engineering", occurredAt: at(-2 * HOUR) },
    ]);

    // ── Notifications ────────────────────────────────────────────────────
    await tx.insert(s.notifications).values([
      { userId: tharushi!.id, kind: "action", title: "Confirm your AC repair", body: "Kasun Perera marked the work complete. Check the photos and confirm.", href: "/home/work/" + woTharushi!.number, createdAt: at(-20 * HOUR - 25 * MIN) },
      { userId: tharushi!.id, kind: "update", title: "2 quotes for your blocked sink", body: "Compare prices and TrustScores before you choose.", href: "/home/requests/" + sinkReq!.number, createdAt: at(-3 * HOUR - 50 * MIN) },
      { userId: dilani!.id, kind: "action", title: "Verify lobby lighting repair", body: "Sampath Kumara completed WO-" + woLobby!.number + ".", href: "/w/meridian/work-orders/" + woLobby!.number, createdAt: at(-3 * HOUR - 10 * MIN) },
      { userId: dilani!.id, kind: "update", title: "Kitchen exhaust SLA at risk", body: "WO-" + woExhaust!.number + " is still unassigned at ABC Engineering.", href: "/w/meridian/work-orders/" + woExhaust!.number, createdAt: at(-20 * MIN) },
      { userId: ruwan!.id, kind: "action", title: "Emergency request from Fathima Rizvi", body: "Ceiling fan sparking — Dehiwala.", href: "/w/abc-engineering/requests", createdAt: at(-40 * MIN) },
      { userId: ruwan!.id, kind: "action", title: "Kitchen exhaust fan — SLA at risk", body: "WO-" + woExhaust!.number + " needs a technician.", href: "/w/abc-engineering/work-orders/" + woExhaust!.number, createdAt: at(-20 * MIN) },
      { userId: kasun!.id, kind: "update", title: "New job this afternoon", body: "Quarterly filter change — AHU-02.", href: "/field/jobs/" + woFilter!.number, createdAt: at(-5 * DAY) },
    ]);

    await seedOperations(tx, now);
  });
}

type ProviderSpec = {
  org: typeof s.organizations.$inferSelect;
  jobs: number;
  quality: number;
  slaMet: number;
  drift: number;
  responseMin: number;
  techs: (typeof s.users.$inferSelect)[];
  cats: string[];
  price: number[];
};

const HISTORY_TITLES: Record<string, string[]> = {
  hvac: ["AC not cooling", "AC service — 3 units", "Water leaking from indoor unit", "Gas top-up and leak test", "Noisy outdoor unit"],
  electrical: ["Breaker tripping repeatedly", "Install new power sockets", "Rewire kitchen circuit", "DB board inspection", "Outdoor lighting repair"],
  plumbing: ["Leaking kitchen tap", "Blocked bathroom drain", "Replace toilet cistern", "Water tank float valve", "Geyser pipe leak"],
  appliance: ["Fridge not cooling", "Washing machine not draining"],
  lift: ["Lift stopping between floors", "Monthly lift maintenance"],
};

/** Verified past work that the TrustScore engine reads. */
async function seedHistory(
  tx: Tx,
  input: {
    providers: ProviderSpec[];
    pastCustomers: (typeof s.customers.$inferSelect)[];
    pastUsers: (typeof s.users.$inferSelect)[];
    now: Date;
  },
) {
  const rand = rng(20260929);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;

  for (const p of input.providers) {
    const customers = input.pastCustomers.filter((c) => c.providerOrgId === p.org.id);
    const rows: (typeof s.workOrders.$inferInsert)[] = [];
    const meta: { rating: number | null; quoted: number | null; responseMin: number; userId: string }[] = [];

    for (let i = 0; i < p.jobs; i++) {
      const createdAt = new Date(input.now.getTime() - (8 + rand() * 530) * DAY);
      const category = pick(p.cats);
      const windowH = pick([4, 12, 48, 48, 120]);
      const slaDueAt = new Date(createdAt.getTime() + windowH * HOUR);
      const met = rand() < p.slaMet;
      const completedAt = new Date(slaDueAt.getTime() + (met ? -rand() * windowH * 0.6 : rand() * 10 + 0.5) * HOUR);
      const [lo, hi] = p.price as [number, number];
      const amount = Math.round((lo + rand() ** 2 * (hi - lo)) / 100) * 100;
      const quoted = i % 4 === 0;
      const drift = quoted ? (rand() < 0.75 ? 0 : (rand() * 2 - 0.5) * p.drift * 3) : 0;
      const customer = pick(customers);
      rows.push({
        providerOrgId: p.org.id, customerId: customer.id, currency: "LKR", categoryId: category,
        title: pick(HISTORY_TITLES[category] ?? ["Service visit"]), priority: windowH <= 4 ? "critical" : windowH <= 12 ? "high" : "normal",
        status: "completed", address: customer.address ?? "Colombo", assigneeUserId: pick(p.techs).id,
        slaDueAt, amountMinor: rs(Math.round(amount * (1 + drift))), checklist: [],
        startedAt: new Date(completedAt.getTime() - 2 * HOUR), completedAt,
        verifiedAt: new Date(completedAt.getTime() + (2 + rand() * 20) * HOUR), createdAt, updatedAt: completedAt,
      });
      const r = rand();
      const rating = rand() < 0.7 ? (r < p.quality ? (rand() < 0.75 ? 5 : 4) : pick([2, 3, 3, 4])) : null;
      meta.push({ rating, quoted: quoted ? rs(amount) : null, responseMin: p.responseMin * (0.4 + rand() * 1.4), userId: customer.userId! });
    }

    const inserted = await tx.insert(s.workOrders).values(rows).returning({ id: s.workOrders.id, createdAt: s.workOrders.createdAt, amountMinor: s.workOrders.amountMinor, customerId: s.workOrders.customerId, completedAt: s.workOrders.completedAt, verifiedAt: s.workOrders.verifiedAt, categoryId: s.workOrders.categoryId, title: s.workOrders.title, address: s.workOrders.address });

    const reviewRows: (typeof s.reviews.$inferInsert)[] = [];
    const invoiceRows: (typeof s.invoices.$inferInsert)[] = [];
    for (const [i, wo] of inserted.entries()) {
      const m = meta[i]!;
      if (m.rating !== null) {
        reviewRows.push({
          workOrderId: wo.id, providerOrgId: p.org.id, authorUserId: m.userId, rating: m.rating,
          comment: m.rating >= 5 ? pick(REVIEW_GOOD) : m.rating >= 4 ? pick(REVIEW_OK) : pick(REVIEW_POOR),
          createdAt: wo.verifiedAt!,
        });
      }
      invoiceRows.push({
        workOrderId: wo.id, providerOrgId: p.org.id, customerId: wo.customerId, amountMinor: wo.amountMinor!, currency: "LKR",
        status: "paid", issuedAt: wo.verifiedAt!, dueAt: new Date(wo.verifiedAt!.getTime() + 14 * DAY),
        paidAt: new Date(wo.verifiedAt!.getTime() + (1 + rand() * 10) * DAY),
      });
      if (m.quoted !== null) {
        const requestCreated = new Date(wo.createdAt.getTime() - m.responseMin * MIN - 30 * MIN);
        const [req] = await tx
          .insert(s.serviceRequests)
          .values({
            requesterUserId: m.userId, categoryId: wo.categoryId, title: wo.title, description: wo.title,
            address: wo.address, urgency: "soon", status: "accepted", createdAt: requestCreated,
          })
          .returning({ id: s.serviceRequests.id });
        await tx.insert(s.requestInvites).values({ requestId: req!.id, providerOrgId: p.org.id, status: "quoted", createdAt: requestCreated });
        const [q] = await tx
          .insert(s.quotes)
          .values({
            requestId: req!.id, providerOrgId: p.org.id, authorUserId: p.techs[0]!.id, currency: "LKR", totalMinor: m.quoted,
            lines: [{ description: wo.title, quantity: 1, unitMinor: m.quoted }], status: "accepted",
            createdAt: new Date(requestCreated.getTime() + m.responseMin * MIN),
          })
          .returning({ id: s.quotes.id });
        await tx.update(s.workOrders).set({ requestId: req!.id, quoteId: q!.id }).where(eqId(wo.id));
      }
    }
    if (reviewRows.length) await tx.insert(s.reviews).values(reviewRows);
    await tx.insert(s.invoices).values(invoiceRows);
    const invoices = await tx.select({ id: s.invoices.id, amountMinor: s.invoices.amountMinor, paidAt: s.invoices.paidAt }).from(s.invoices).where(eqProvider(p.org.id));
    await tx.insert(s.payments).values(
      invoices
        .filter((inv) => inv.paidAt)
        .map((inv, i) => ({ invoiceId: inv.id, amountMinor: inv.amountMinor, currency: "LKR", method: i % 3 ? "Bank transfer" : "Card (demo)", reference: `PAY-${(900000 + i).toString(36).toUpperCase()}`, createdAt: inv.paidAt! })),
    );
  }
}

const eqId = (id: string) => eq(s.workOrders.id, id);
const eqProvider = (orgId: string) => eq(s.invoices.providerOrgId, orgId);

const REVIEW_GOOD = [
  "Arrived on time, explained the problem clearly and left everything clean.",
  "Very professional. Showed me before and after photos.",
  "Fixed it properly the first time. Price was exactly as quoted.",
  "Quick response and honest advice — did not try to upsell.",
];
const REVIEW_OK = ["Good work, arrived a little late.", "Job done well. Communication could be better.", "Solid work, slightly above the quote."];
const REVIEW_POOR = ["Had to call twice before anyone came.", "Problem came back after a week; they did return to fix it.", "Final price was higher than the quote."];
