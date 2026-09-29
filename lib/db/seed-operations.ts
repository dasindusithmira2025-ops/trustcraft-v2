/**
 * Phase 2 demo world: the parts of a service company's week that make Dispatch, Calendar,
 * CRM, Recurring and Invoices worth opening — unassigned and at-risk work, a technician on
 * leave, a deliberate double-booking, a job outside the service area, customers with history,
 * invoices in every state, and recurring services. Anchored to "now", like the rest of the seed.
 */
import { eq, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { computeTotals } from "@/features/commercial/totals";
import { nextOccurrence } from "@/features/recurring/schedule";
import * as s from "./schema";

type Db = PgliteDatabase<typeof s>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const rs = (rupees: number) => rupees * 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function seedOperations(tx: Tx, now: Date) {
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  const user = async (email: string) => (await tx.select().from(s.users).where(eq(s.users.email, email)))[0]!;
  const org = async (slug: string) => (await tx.select().from(s.organizations).where(eq(s.organizations.slug, slug)))[0]!;
  // One at a time: a transaction owns a single connection, and node-postgres does not allow overlapping queries on it.
  const people: Awaited<ReturnType<typeof user>>[] = [];
  for (const n of ["ruwan", "kasun", "chamari", "sampath", "dilani", "harsha", "nadeesha", "tharushi", "fathima", "anura"]) {
    people.push(await user(n === "tharushi" || n === "fathima" ? `${n}@home.test` : n === "dilani" || n === "harsha" ? `${n}@meridian-hotels.test` : `${n}@abc-engineering.test`));
  }
  const [ruwan, kasun, chamari, sampath, dilani, harsha, nadeesha, tharushi, , anura] = people;
  const abc = await org("abc-engineering");
  const meridian = await org("meridian");
  const [colombo] = await tx.select().from(s.locations).where(eq(s.locations.name, "Meridian Colombo"));
  const [galle] = await tx.select().from(s.locations).where(eq(s.locations.name, "Meridian Galle Fort"));
  const [roof] = await tx.select().from(s.locations).where(eq(s.locations.name, "Roof plant room"));
  const [gen01] = await tx.select().from(s.assets).where(eq(s.assets.tag, "GEN-01"));
  const [acG01] = await tx.select().from(s.assets).where(eq(s.assets.tag, "AC-G01"));
  const [ch01] = await tx.select().from(s.assets).where(eq(s.assets.tag, "CH-01"));

  // ── Normalise everything the older seed wrote so Phase 2 screens have complete data ──
  await tx.execute(sql`
    update work_orders set city = case
      when address ilike '%Galle Fort%' then 'Galle' when address ilike '%Kandy%' then 'Kandy' when address ilike '%Nugegoda%' then 'Nugegoda'
      when address ilike '%Dehiwala%' or address ilike '%Kalubowila%' then 'Dehiwala-Mount Lavinia' else 'Colombo' end where city is null`);
  await tx.execute(sql`
    update service_requests set city = case
      when address ilike '%Galle Fort%' then 'Galle' when address ilike '%Kandy%' then 'Kandy' when address ilike '%Nugegoda%' then 'Nugegoda'
      when address ilike '%Dehiwala%' or address ilike '%Kalubowila%' then 'Dehiwala-Mount Lavinia' else 'Colombo' end where city is null`);
  await tx.execute(sql`update customers set city = case
      when address ilike '%Kandy%' then 'Kandy' when address ilike '%Nugegoda%' then 'Nugegoda'
      when address ilike '%Dehiwala%' or address ilike '%Kalubowila%' then 'Dehiwala-Mount Lavinia' else 'Colombo' end where city is null`);
  await tx.execute(sql`update quotes set subtotal_minor = total_minor, sent_at = created_at where subtotal_minor is null`);
  await tx.execute(sql`update quotes set valid_until = created_at + interval '7 days' where valid_until is null`);
  await tx.execute(sql`update activity_events e set org_id = w.provider_org_id from work_orders w where e.work_order_id = w.id and e.org_id is null`);
  await tx.execute(sql`update notifications set category = case
      when title ilike '%SLA%' then 'sla' when title ilike '%quote%' then 'quote' when title ilike '%verif%' or title ilike '%confirm%' then 'verification'
      when title ilike '%job%' then 'assignment' when title ilike '%payment%' then 'invoice' else 'work' end where category = 'system'`);

  // Two live quotes get the full commercial treatment.
  await tx.update(s.quotes).set({ inclusions: "Call-out, drain machine, replacement PVC trap, cleaning up after the work.", exclusions: "Repairs to pipes inside the wall — quoted separately if found." }).where(sql`${s.quotes.number} in (select min(number) from quotes where request_id in (select id from service_requests where title like 'Kitchen sink%'))`);
  await tx.update(s.quotes).set({ status: "viewed", viewedAt: at(-2 * HOUR), inclusions: "Technician visit and high-pressure jetting.", exclusions: "Pipe replacement and any civil work." }).where(sql`${s.quotes.providerOrgId} = ${abc.id} and ${s.quotes.status} = 'sent'`);

  // ── Customers with history ────────────────────────────────────────────
  const [sunrise, greenLeaf, kamal] = await tx
    .insert(s.customers)
    .values([
      { providerOrgId: abc.id, name: "Sunrise Dental Clinic", email: "front@sunrise-dental.test", phone: "+94 11 269 4410", address: "No. 14, Bauddhaloka Mawatha, Colombo 07", city: "Colombo" },
      { providerOrgId: abc.id, name: "Green Leaf Café", email: "hello@greenleaf-cafe.test", phone: "+94 77 410 2288", address: "No. 3, Galle Road, Dehiwala", city: "Dehiwala-Mount Lavinia" },
      { providerOrgId: abc.id, name: "Kamal Jayasuriya", phone: "+94 71 903 7745", address: "No. 55, Peradeniya Road, Kandy", city: "Kandy" },
    ])
    .returning();
  const [meridianCustomer] = await tx.select().from(s.customers).where(sql`${s.customers.providerOrgId} = ${abc.id} and ${s.customers.clientOrgId} = ${meridian.id}`);
  const [tharushiCustomer] = await tx.select().from(s.customers).where(sql`${s.customers.providerOrgId} = ${abc.id} and ${s.customers.userId} = ${tharushi.id}`);

  await tx.insert(s.customerNotes).values([
    { customerId: sunrise!.id, authorUserId: ruwan.id, body: "Clinic is closed Sundays. Reception opens the gate — ring Dr. Gomez's assistant on arrival.", createdAt: at(-30 * DAY) },
    { customerId: sunrise!.id, authorUserId: anura.id, body: "Prefers a call before any work above Rs 25,000. Pays by bank transfer within a week.", createdAt: at(-12 * DAY) },
    { customerId: meridianCustomer!.id, authorUserId: ruwan.id, body: "Kitchen work in Kandy must avoid 6–9 am breakfast service. Roof plant room needs a permit from the duty engineer.", createdAt: at(-60 * DAY) },
  ]);

  // ── Live work: unassigned, at risk, outside the area, double-booked, on leave ──
  const base = { providerOrgId: abc.id, currency: "LKR" };
  const check = (labels: string[]): s.ChecklistItem[] => labels.map((label, i) => ({ id: `c${i + 1}`, label, done: false }));
  const live = await tx
    .insert(s.workOrders)
    .values([
      {
        ...base, customerId: meridianCustomer!.id, clientOrgId: meridian.id, title: "Burst pipe — staff washroom, Level 3", categoryId: "plumbing", priority: "high", status: "open",
        description: "Water on the corridor floor from a split supply pipe. Isolated at the riser; staff washroom out of use.",
        address: "Meridian Colombo, No. 88, Galle Road, Colombo 03", city: "Colombo", locationId: colombo!.id, slaDueAt: at(4 * HOUR), amountMinor: null, checklist: [], createdAt: at(-HOUR - 10 * MIN),
      },
      {
        ...base, customerId: tharushiCustomer!.id, title: "Study-room socket sparking", categoryId: "electrical", priority: "high", status: "open",
        description: "Wall socket sparked when a laptop charger was plugged in. Breaker has been switched off.",
        address: "No. 27/3, Stanley Thilakaratne Mawatha, Nugegoda", city: "Nugegoda", slaDueAt: at(9 * HOUR), amountMinor: null, checklist: [], createdAt: at(-3 * HOUR),
      },
      {
        ...base, customerId: meridianCustomer!.id, clientOrgId: meridian.id, title: "Reception split AC — six-monthly service", categoryId: "hvac", priority: "low", status: "open",
        description: "Planned service for the reception split AC at the Galle Fort property.",
        address: "Meridian Galle Fort, No. 4, Church Street, Galle Fort", city: "Galle", locationId: galle!.id, assetId: acG01!.id, slaDueAt: at(3 * DAY), amountMinor: rs(9_500), checklist: [], createdAt: at(-2 * DAY),
      },
      {
        ...base, customerId: meridianCustomer!.id, clientOrgId: meridian.id, title: "Cooling tower inspection", categoryId: "hvac", priority: "normal", status: "scheduled",
        description: "Monthly visual inspection of the cooling tower fill, basin and water treatment dosing.",
        address: "Meridian Colombo, No. 88, Galle Road, Colombo 03", city: "Colombo", locationId: roof!.id, assetId: ch01!.id, assigneeUserId: kasun.id,
        scheduledStart: at(6 * HOUR), scheduledEnd: at(8 * HOUR), slaDueAt: at(2 * DAY), amountMinor: rs(15_000),
        checklist: check(["Inspect fill and drift eliminators", "Check basin level and float", "Test water treatment dosing", "Photograph basin"]), createdAt: at(-4 * DAY),
      },
      {
        ...base, customerId: greenLeaf!.id, title: "Café split ACs — annual service (3 units)", categoryId: "hvac", priority: "normal", status: "scheduled",
        description: "Annual clean and gas check on the three split ACs in the café dining area.",
        address: "No. 3, Galle Road, Dehiwala", city: "Dehiwala-Mount Lavinia", assigneeUserId: chamari.id,
        scheduledStart: at(2 * DAY + 2 * HOUR), scheduledEnd: at(2 * DAY + 5 * HOUR), slaDueAt: at(4 * DAY), amountMinor: rs(18_000),
        checklist: check(["Clean indoor coils and filters", "Clean outdoor coils", "Check refrigerant pressures", "Test cooling"]), createdAt: at(-3 * DAY),
      },
      {
        ...base, customerId: sunrise!.id, title: "Waiting-room AC not cooling", categoryId: "hvac", priority: "normal", status: "scheduled",
        description: "Cassette AC in the waiting room runs but the room stays warm.",
        address: "No. 14, Bauddhaloka Mawatha, Colombo 07", city: "Colombo", assigneeUserId: kasun.id,
        scheduledStart: at(DAY + 3 * HOUR), scheduledEnd: at(DAY + 5 * HOUR), slaDueAt: at(2 * DAY), amountMinor: rs(12_000),
        checklist: check(["Check refrigerant", "Clean coil", "Test cooling"]), createdAt: at(-DAY),
      },
    ])
    .returning();
  const [woBurst, woSocket, woGalle, woTower, woCafe, woWaiting] = live;

  // ── Finished work and invoices in every state ─────────────────────────
  const done = await tx
    .insert(s.workOrders)
    .values([
      {
        ...base, customerId: sunrise!.id, title: "Server-room AC replacement", categoryId: "hvac", priority: "normal", status: "completed", city: "Colombo",
        address: "No. 14, Bauddhaloka Mawatha, Colombo 07", assigneeUserId: kasun.id, slaDueAt: at(-18 * DAY), amountMinor: rs(94_400), checklist: [],
        startedAt: at(-20 * DAY), completedAt: at(-20 * DAY + 5 * HOUR), verifiedAt: at(-19 * DAY), createdAt: at(-24 * DAY), completionNote: "Replaced the 2 TR split unit and re-piped the condensate line.",
      },
      {
        ...base, customerId: sunrise!.id, title: "Distribution board upgrade", categoryId: "electrical", priority: "normal", status: "completed", city: "Colombo",
        address: "No. 14, Bauddhaloka Mawatha, Colombo 07", assigneeUserId: sampath.id, slaDueAt: at(-38 * DAY), amountMinor: rs(59_000), checklist: [],
        startedAt: at(-41 * DAY), completedAt: at(-41 * DAY + 6 * HOUR), verifiedAt: at(-40 * DAY), createdAt: at(-44 * DAY), completionNote: "New 12-way board with RCCB protection, labelled and tested.",
      },
      {
        ...base, customerId: greenLeaf!.id, title: "Cold-room compressor fault", categoryId: "hvac", priority: "high", status: "completed", city: "Dehiwala-Mount Lavinia",
        address: "No. 3, Galle Road, Dehiwala", assigneeUserId: chamari.id, slaDueAt: at(-8 * DAY), amountMinor: rs(41_300), checklist: [],
        startedAt: at(-9 * DAY), completedAt: at(-9 * DAY + 4 * HOUR), verifiedAt: at(-8 * DAY - 6 * HOUR), createdAt: at(-9 * DAY - 3 * HOUR), completionNote: "Replaced the start capacitor and contactor; cold room back to 3 °C.",
      },
      {
        ...base, customerId: kamal!.id, title: "Water heater element replacement", categoryId: "electrical", priority: "low", status: "completed", city: "Kandy",
        address: "No. 55, Peradeniya Road, Kandy", assigneeUserId: sampath.id, slaDueAt: at(-3 * DAY), amountMinor: rs(11_800), checklist: [],
        startedAt: at(-5 * DAY), completedAt: at(-5 * DAY + 2 * HOUR), verifiedAt: at(-4 * DAY), createdAt: at(-8 * DAY), completionNote: "Fitted a new 3 kW element and tested the thermostat.",
      },
    ])
    .returning();
  const [woServer, woBoard, woCold, woHeater] = done;

  const vat = 1800;
  const invoice = (wo: (typeof done)[number], lines: s.InvoiceLine[], over: { status: s.InvoiceStatus; issuedAt: Date; dueAt: Date; paidAt?: Date }) => {
    const t = computeTotals(lines, { taxBps: vat });
    return { workOrderId: wo.id, providerOrgId: abc.id, customerId: wo.customerId, lines, taxBps: vat, subtotalMinor: t.subtotalMinor, taxMinor: t.taxMinor, amountMinor: t.totalMinor, currency: "LKR", ...over };
  };
  const [invServer, invBoard, invCold, invHeater] = await tx
    .insert(s.invoices)
    .values([
      invoice(woServer!, [{ description: "2 TR inverter split unit (supplied)", kind: "material", quantity: 1, unit: "each", unitMinor: rs(62_000) }, { description: "Installation and re-piping", kind: "labor", quantity: 1, unit: "job", unitMinor: rs(18_000) }], { status: "paid", issuedAt: at(-19 * DAY), dueAt: at(-5 * DAY), paidAt: at(-14 * DAY) }),
      invoice(woBoard!, [{ description: "12-way distribution board and RCCB", kind: "material", quantity: 1, unit: "each", unitMinor: rs(31_000) }, { description: "Electrician labour", kind: "labor", quantity: 12, unit: "hour", unitMinor: rs(1_500) }, { description: "Testing and labelling", kind: "labor", quantity: 1, unit: "job", unitMinor: rs(1_000) }], { status: "issued", issuedAt: at(-40 * DAY), dueAt: at(-26 * DAY) }),
      invoice(woCold!, [{ description: "Start capacitor and contactor", kind: "material", quantity: 1, unit: "set", unitMinor: rs(9_800) }, { description: "Refrigeration technician", kind: "labor", quantity: 4, unit: "hour", unitMinor: rs(2_300) }, { description: "Emergency call-out", kind: "other", quantity: 1, unit: "visit", unitMinor: rs(16_000) }], { status: "partially_paid", issuedAt: at(-8 * DAY), dueAt: at(6 * DAY) }),
      invoice(woHeater!, [{ description: "3 kW water heater element", kind: "material", quantity: 1, unit: "each", unitMinor: rs(4_800) }, { description: "Electrician labour", kind: "labor", quantity: 3, unit: "hour", unitMinor: rs(1_500) }], { status: "draft", issuedAt: at(-4 * DAY), dueAt: at(10 * DAY) }),
    ])
    .returning();
  await tx.update(s.invoices).set({ amountPaidMinor: invServer!.amountMinor }).where(eq(s.invoices.id, invServer!.id));
  const coldPaid = Math.round(invCold!.amountMinor * 0.5);
  await tx.update(s.invoices).set({ amountPaidMinor: coldPaid }).where(eq(s.invoices.id, invCold!.id));
  await tx.insert(s.payments).values([
    { invoiceId: invServer!.id, amountMinor: invServer!.amountMinor, currency: "LKR", method: "Bank transfer", reference: "PAY-SRV001", payerUserId: null, recordedByUserId: nadeesha.id, createdAt: at(-14 * DAY) },
    { invoiceId: invCold!.id, amountMinor: coldPaid, currency: "LKR", method: "Cash", reference: "PAY-CAFE01", note: "Deposit collected on site", recordedByUserId: nadeesha.id, createdAt: at(-7 * DAY) },
  ]);
  void invBoard; void invHeater;

  // Meridian's Booster-pump invoice is part-paid too.
  const [pumpInvoice] = await tx.select().from(s.invoices).where(sql`${s.invoices.providerOrgId} = ${abc.id} and ${s.invoices.status} = 'issued' and ${s.invoices.amountMinor} = ${rs(64_800)}`);
  if (pumpInvoice) {
    await tx.update(s.invoices).set({ status: "partially_paid", amountPaidMinor: rs(30_000) }).where(eq(s.invoices.id, pumpInvoice.id));
    await tx.insert(s.payments).values({ invoiceId: pumpInvoice.id, amountMinor: rs(30_000), currency: "LKR", method: "Bank transfer", reference: "PAY-MER301", recordedByUserId: nadeesha.id, createdAt: at(-3 * DAY) });
  }
  await tx.execute(sql`update invoices set amount_paid_minor = amount_minor where status = 'paid' and amount_paid_minor = 0`);
  await tx.execute(sql`update invoices set subtotal_minor = amount_minor where subtotal_minor is null`);
  await tx.execute(sql`update invoices i set lines = jsonb_build_array(jsonb_build_object('description', w.title, 'kind', 'other', 'quantity', 1, 'unit', 'job', 'unitMinor', i.amount_minor))
    from work_orders w where w.id = i.work_order_id and i.lines = '[]'::jsonb`);

  // ── Time off ──────────────────────────────────────────────────────────
  await tx.insert(s.timeOff).values([
    { orgId: abc.id, userId: chamari.id, startsOn: iso(at(2 * DAY)), endsOn: iso(at(3 * DAY)), reason: "Annual leave", createdByUserId: ruwan.id },
    { orgId: abc.id, userId: sampath.id, startsOn: iso(at(9 * DAY)), endsOn: iso(at(9 * DAY)), reason: "Training day", createdByUserId: ruwan.id },
  ]);

  // ── Recurring services ────────────────────────────────────────────────
  const monday = (() => {
    let d = iso(at(DAY));
    while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = iso(new Date(new Date(`${d}T00:00:00Z`).getTime() + DAY));
    return d;
  })();
  const genTomorrow = iso(at(DAY + 2 * HOUR));
  const [planGen, , planChiller, planPump] = await tx
    .insert(s.recurringPlans)
    .values([
      {
        orgId: abc.id, customerId: meridianCustomer!.id, title: "Generator monthly service — GEN-01", categoryId: "electrical", priority: "low", address: "Meridian Colombo, No. 88, Galle Road, Colombo 03", city: "Colombo",
        preferredUserId: sampath.id, durationMinutes: 120, startTime: "09:00", intervalUnit: "month", intervalCount: 1, startsOn: iso(at(-5 * 30 * DAY)), nextRunOn: iso(new Date(new Date(`${genTomorrow}T00:00:00Z`).getTime() + 30 * DAY)),
        amountMinor: rs(18_500), currency: "LKR", checklist: ["Check oil and coolant", "Inspect batteries", "Run 30-min load test", "Log hours"], createdByUserId: ruwan.id,
      },
      {
        orgId: abc.id, customerId: tharushiCustomer!.id, title: "Quarterly split AC service — master bedroom", categoryId: "hvac", priority: "low", address: "No. 27/3, Stanley Thilakaratne Mawatha, Nugegoda", city: "Nugegoda",
        preferredUserId: kasun.id, durationMinutes: 90, startTime: "10:00", intervalUnit: "month", intervalCount: 3, startsOn: iso(at(-80 * DAY)), nextRunOn: iso(at(9 * DAY)),
        amountMinor: rs(6_500), currency: "LKR", checklist: ["Clean filters and coil", "Check drain", "Test cooling"], createdByUserId: ruwan.id,
      },
      {
        orgId: abc.id, customerId: meridianCustomer!.id, title: "Weekly chiller log and inspection", categoryId: "hvac", priority: "normal", address: "Meridian Colombo, No. 88, Galle Road, Colombo 03", city: "Colombo",
        preferredUserId: kasun.id, durationMinutes: 60, startTime: "07:30", intervalUnit: "week", intervalCount: 1, weekday: 0, startsOn: iso(at(-60 * DAY)), nextRunOn: monday,
        amountMinor: rs(4_500), currency: "LKR", checklist: ["Record pressures and temperatures", "Check for leaks", "Log runtime hours"], createdByUserId: ruwan.id,
      },
      {
        orgId: abc.id, customerId: meridianCustomer!.id, title: "Six-monthly booster pump check", categoryId: "plumbing", priority: "low", address: "Meridian Colombo, No. 88, Galle Road, Colombo 03", city: "Colombo",
        preferredUserId: sampath.id, durationMinutes: 120, startTime: "09:00", intervalUnit: "month", intervalCount: 6, startsOn: iso(at(-120 * DAY)), nextRunOn: iso(at(60 * DAY)), status: "paused",
        amountMinor: rs(14_000), currency: "LKR", checklist: ["Check pressure set-points", "Inspect seals", "Test changeover"], createdByUserId: ruwan.id,
      },
    ])
    .returning();
  // The generator service scheduled for tomorrow already came from its plan.
  await tx.update(s.workOrders).set({ recurringPlanId: planGen!.id, occurrenceOn: genTomorrow }).where(sql`${s.workOrders.title} = 'Generator monthly service — GEN-01' and ${s.workOrders.providerOrgId} = ${abc.id}`);
  void nextOccurrence; void gen01;

  // ── Audit trail for everything above ──────────────────────────────────
  const ev = (wo: { id: string; customerId: string }, actor: string | null, type: string, summary: string, occurredAt: Date) => ({ orgId: abc.id, workOrderId: wo.id, customerId: wo.customerId, actorUserId: actor, type, summary, occurredAt });
  await tx.insert(s.activityEvents).values([
    ev(woBurst!, harsha.id, "created", "Work order created by Harsha Gunawardena", at(-HOUR - 10 * MIN)),
    ev(woSocket!, tharushi.id, "created", "Booked by Tharushi Wijesinghe", at(-3 * HOUR)),
    ev(woGalle!, dilani.id, "created", "Work order created by Dilani Jayawardena", at(-2 * DAY)),
    ev(woTower!, ruwan.id, "created", "Planned maintenance generated for CH-01", at(-4 * DAY)),
    ev(woTower!, ruwan.id, "assigned", "Assigned to Kasun Perera", at(-3 * DAY)),
    ev(woCafe!, ruwan.id, "created", "Work order created by Ruwan Silva", at(-3 * DAY)),
    ev(woCafe!, ruwan.id, "assigned", "Assigned to Chamari Dias", at(-3 * DAY + HOUR)),
    ev(woWaiting!, ruwan.id, "created", "Work order created by Ruwan Silva", at(-DAY)),
    ev(woWaiting!, ruwan.id, "assigned", "Assigned to Kasun Perera", at(-DAY + HOUR)),
    ...[woServer!, woBoard!, woCold!, woHeater!].flatMap((w) => [
      ev(w, ruwan.id, "created", "Work order created by Ruwan Silva", w.createdAt),
      ev(w, w.assigneeUserId, "completed", "Work completed — awaiting verification", w.completedAt!),
      ev(w, ruwan.id, "verified", "Verified by the customer", w.verifiedAt!),
    ]),
    ev(woServer!, null, "invoiced", `Invoice INV-${invServer!.number} issued`, at(-19 * DAY)),
    ev(woServer!, nadeesha.id, "paid", `INV-${invServer!.number} paid — Bank transfer (PAY-SRV001)`, at(-14 * DAY)),
    ev(woBoard!, null, "invoiced", `Invoice INV-${invBoard!.number} issued`, at(-40 * DAY)),
    ev(woCold!, null, "invoiced", `Invoice INV-${invCold!.number} issued`, at(-8 * DAY)),
    ev(woCold!, nadeesha.id, "paid", `Rs ${(coldPaid / 100).toLocaleString("en")} received on INV-${invCold!.number} — Cash`, at(-7 * DAY)),
    { orgId: abc.id, customerId: sunrise!.id, actorUserId: ruwan.id, type: "customer_created", summary: "Customer added by Ruwan Silva", occurredAt: at(-44 * DAY) },
    { orgId: abc.id, customerId: sunrise!.id, actorUserId: anura.id, type: "note", summary: "Note added — prefers a call before work above Rs 25,000", occurredAt: at(-12 * DAY) },
    { orgId: abc.id, recurringPlanId: planGen!.id, actorUserId: ruwan.id, type: "plan_created", summary: "Recurring service created — every month", occurredAt: at(-150 * DAY) },
    { orgId: abc.id, recurringPlanId: planChiller!.id, actorUserId: ruwan.id, type: "plan_created", summary: "Recurring service created — every Monday", occurredAt: at(-60 * DAY) },
    { orgId: abc.id, recurringPlanId: planPump!.id, actorUserId: ruwan.id, type: "plan_paused", summary: "Recurring service paused — awaiting Meridian's maintenance window", occurredAt: at(-10 * DAY) },
  ]);

  // ── Ruwan's saved views ───────────────────────────────────────────────
  await tx.insert(s.savedViews).values([
    { userId: ruwan.id, orgId: abc.id, scope: "work_orders", name: "Needs a technician", params: { view: "unassigned" } },
    { userId: ruwan.id, orgId: abc.id, scope: "work_orders", name: "SLA risk", params: { view: "risk" } },
    { userId: ruwan.id, orgId: abc.id, scope: "work_orders", name: "High-priority HVAC", params: { view: "open", category: "hvac", priority: "high" } },
  ]);

  // A few notifications with the richer model.
  await tx.insert(s.notifications).values([
    { userId: ruwan.id, kind: "action", category: "sla", title: "Burst pipe — SLA at risk", body: `WO-${woBurst!.number} has no technician yet.`, href: `/w/abc-engineering/dispatch`, entityType: "work_order", entityId: woBurst!.id, dedupeKey: `sla:${woBurst!.id}:risk`, createdAt: at(-10 * MIN) },
    { userId: kasun.id, kind: "update", category: "assignment", title: "Waiting-room AC — tomorrow 10:00", body: "Sunrise Dental Clinic, Colombo 07.", href: `/field/jobs/${woWaiting!.number}`, createdAt: at(-DAY + HOUR) },
  ]);
}
