import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
/** Money is stored in minor units (cents). ponytail: JS number is exact to 9e15 minor units, move to bigint mode past that. */
const money = (name: string) => bigint(name, { mode: "number" });

// ── Identity ────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  /** TrustCraft staff get "admin"; everyone else is "user". */
  platformRole: text("platform_role", { enum: ["user", "admin"] }).notNull().default("user"),
  /** Notification categories the person has muted: `{ invoice: false }`. Absent means on. */
  notificationPrefs: jsonb("notification_prefs").$type<Record<string, boolean>>().notNull().default({}),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  /** sha256 of the cookie token — the raw token never touches the database. */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  userAgent: text("user_agent"),
  lastSeenAt: ts("last_seen_at"),
  createdAt: createdAt(),
});

/** Where a person is in setup. Progress is resumable; what was already created stays created. */
export const ONBOARDING_PATHS = ["professional", "business", "facility"] as const;
export type OnboardingPath = (typeof ONBOARDING_PATHS)[number];

export const onboarding = pgTable("onboarding", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  path: text("path", { enum: ONBOARDING_PATHS }).notNull(),
  step: text("step").notNull(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  completedAt: ts("completed_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ── Organizations ───────────────────────────────────────────────────────────

export const ORG_KINDS = ["provider", "enterprise"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

/** Provider size. Drives navigation shape and default modules; changes automatically as the team grows. */
export const SEGMENTS = ["solo", "team", "company"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const ORG_TYPES = ["hotel", "hospital", "office", "retail", "industrial", "property", "other"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const MODULES = ["assets", "locations", "maintenance", "dispatch", "recurring", "reports"] as const;
export type Module = (typeof MODULES)[number];

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
/** Opening hours per weekday in the organization's timezone; null = closed. */
export type BusinessHours = Record<Weekday, { open: string; close: string } | null>;

export const DEFAULT_HOURS: BusinessHours = {
  mon: { open: "08:00", close: "17:00" },
  tue: { open: "08:00", close: "17:00" },
  wed: { open: "08:00", close: "17:00" },
  thu: { open: "08:00", close: "17:00" },
  fri: { open: "08:00", close: "17:00" },
  sat: { open: "08:00", close: "13:00" },
  sun: null,
};

export const organizations = pgTable("organizations", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ORG_KINDS }).notNull(),
  segment: text("segment", { enum: SEGMENTS }),
  orgType: text("org_type", { enum: ORG_TYPES }),
  modules: text("modules").array().$type<Module[]>().notNull().default([]),
  currency: text("currency").notNull().default("LKR"),
  locale: text("locale").notNull().default("en-LK"),
  timezone: text("timezone").notNull().default("Asia/Colombo"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  businessHours: jsonb("business_hours").$type<BusinessHours>().notNull().default(DEFAULT_HOURS),
  /** Invoice defaults. Tax is basis points (1500 = 15%). */
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  taxLabel: text("tax_label").notNull().default("VAT"),
  invoiceFooter: text("invoice_footer"),
  createdAt: createdAt(),
});

export const ROLES = [
  "owner",
  "admin",
  "dispatcher",
  "technician",
  "finance",
  "facility_manager",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    title: text("title"),
    skills: text("skills").array().$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] }), index("memberships_org_idx").on(t.orgId)],
);

/** Someone asked to join an organization. No email transport yet: the owner copies the link. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    title: text("title"),
    skills: text("skills").array().$type<string[]>().notNull().default([]),
    /** sha256 of the link token — the token itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

/** Days a technician (or any member) is unavailable. Dispatch warns instead of assigning into leave. */
export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason").notNull().default("Leave"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("time_off_org_idx").on(t.orgId, t.startsOn)],
);

export const serviceCategories = pgTable("service_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Plain-language words a customer might use — powers the deterministic classifier. */
  keywords: text("keywords").array().$type<string[]>().notNull().default([]),
});

/** The public, network-facing side of a provider organization. */
export const providerProfiles = pgTable("provider_profiles", {
  orgId: uuid("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  about: text("about").notNull(),
  /** Service categories the provider offers. */
  categories: text("categories").array().$type<string[]>().notNull().default([]),
  foundedYear: smallint("founded_year"),
  teamSize: smallint("team_size").notNull().default(1),
  verifiedAt: ts("verified_at"),
  /** Credentials shown on the profile; expiry drives compliance state. */
  credentials: jsonb("credentials")
    .$type<{ name: string; issuer: string; expiresOn: string | null }[]>()
    .notNull()
    .default([]),
});

/**
 * Where a provider works. Practical, not GIS: country › province › district › city, with an
 * optional radius for providers who travel. Drives marketplace eligibility, dispatch warnings
 * and the public profile.
 */
export const serviceAreas = pgTable(
  "service_areas",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    country: text("country").notNull().default("LK"),
    province: text("province"),
    district: text("district"),
    city: text("city").notNull(),
    radiusKm: smallint("radius_km"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("service_areas_org_city_idx").on(t.orgId, t.city)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    providerOrgId: uuid("provider_org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    /** Linked TrustCraft account or organization, when the customer has one. */
    userId: uuid("user_id").references(() => users.id),
    clientOrgId: uuid("client_org_id").references(() => organizations.id),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_provider_idx").on(t.providerOrgId)],
);

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: id(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("customer_notes_customer_idx").on(t.customerId)],
);

// ── Places and things ───────────────────────────────────────────────────────

export const LOCATION_KINDS = ["region", "site", "building", "floor", "area"] as const;

export const locations = pgTable(
  "locations",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    /** Optional hierarchy — a site does not need a region above it. */
    parentId: uuid("parent_id"),
    kind: text("kind", { enum: LOCATION_KINDS }).notNull(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    createdAt: createdAt(),
  },
  (t) => [index("locations_org_idx").on(t.orgId)],
);

export const ASSET_STATUSES = ["operational", "degraded", "down", "retired"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const assets = pgTable(
  "assets",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    locationId: uuid("location_id").references(() => locations.id),
    tag: text("tag").notNull(),
    name: text("name").notNull(),
    categoryId: text("category_id").references(() => serviceCategories.id),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serial: text("serial"),
    status: text("status", { enum: ASSET_STATUSES }).notNull().default("operational"),
    installedOn: date("installed_on"),
    warrantyUntil: date("warranty_until"),
    serviceIntervalDays: integer("service_interval_days"),
    lastServicedOn: date("last_serviced_on"),
    nextServiceOn: date("next_service_on"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("assets_org_tag_idx").on(t.orgId, t.tag)],
);

// ── Demand: service requests and quotes ────────────────────────────────────

export const URGENCIES = ["emergency", "soon", "flexible"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const REQUEST_STATUSES = ["open", "accepted", "cancelled"] as const;

export const serviceRequests = pgTable("service_requests", {
  id: id(),
  number: integer("number").generatedAlwaysAsIdentity({ startWith: 2040 }).notNull(),
  requesterUserId: uuid("requester_user_id").notNull().references(() => users.id),
  /** Set when an organization (not an individual) is asking. */
  requesterOrgId: uuid("requester_org_id").references(() => organizations.id),
  categoryId: text("category_id").notNull().references(() => serviceCategories.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  address: text("address").notNull(),
  city: text("city"),
  locationId: uuid("location_id").references(() => locations.id),
  assetId: uuid("asset_id").references(() => assets.id),
  urgency: text("urgency", { enum: URGENCIES }).notNull(),
  status: text("status", { enum: REQUEST_STATUSES }).notNull().default("open"),
  createdAt: createdAt(),
});

/** Which providers were asked to quote on a request. */
export const requestInvites = pgTable(
  "request_invites",
  {
    requestId: uuid("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
    providerOrgId: uuid("provider_org_id").notNull().references(() => organizations.id),
    status: text("status", { enum: ["pending", "quoted", "declined", "closed"] }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.providerOrgId] }), index("invites_provider_idx").on(t.providerOrgId)],
);

export const QUOTE_LINE_KINDS = ["labor", "material", "other"] as const;
export type QuoteLineKind = (typeof QUOTE_LINE_KINDS)[number];
/** Lines written before Phase 2 have no kind or unit — treat them as "other" and "each". */
export type QuoteLine = { description: string; kind?: QuoteLineKind; quantity: number; unit?: string; unitMinor: number };

export const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "declined", "revised", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const quotes = pgTable("quotes", {
  id: id(),
  number: integer("number").generatedAlwaysAsIdentity({ startWith: 7300 }).notNull(),
  requestId: uuid("request_id").notNull().references(() => serviceRequests.id),
  providerOrgId: uuid("provider_org_id").notNull().references(() => organizations.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  lines: jsonb("lines").$type<QuoteLine[]>().notNull(),
  /** subtotal − discount + tax. Always integer minor units. */
  subtotalMinor: money("subtotal_minor"),
  discountMinor: money("discount_minor").notNull().default(0),
  taxBps: integer("tax_bps").notNull().default(0),
  taxMinor: money("tax_minor").notNull().default(0),
  totalMinor: money("total_minor").notNull(),
  currency: text("currency").notNull(),
  note: text("note"),
  inclusions: text("inclusions"),
  exclusions: text("exclusions"),
  earliestStart: ts("earliest_start"),
  validUntil: ts("valid_until"),
  revision: integer("revision").notNull().default(1),
  revisesQuoteId: uuid("revises_quote_id"),
  status: text("status", { enum: QUOTE_STATUSES }).notNull().default("sent"),
  sentAt: ts("sent_at"),
  viewedAt: ts("viewed_at"),
  respondedAt: ts("responded_at"),
  createdAt: createdAt(),
});

export const quoteAttachments = pgTable(
  "quote_attachments",
  {
    id: id(),
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quote_attachments_quote_idx").on(t.quoteId)],
);

// ── Work ────────────────────────────────────────────────────────────────────

export const WORK_ORDER_STATUSES = [
  "open",
  "scheduled",
  "in_progress",
  "on_hold",
  "awaiting_verification",
  "completed",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ChecklistItem = { id: string; label: string; done: boolean };

/**
 * A repeating service a provider runs for a customer. Each occurrence becomes an ordinary
 * work order (a copy — editing the plan never rewrites history).
 */
export const RECURRING_UNITS = ["day", "week", "month"] as const;
export type RecurringUnit = (typeof RECURRING_UNITS)[number];
export const RECURRING_STATUSES = ["active", "paused", "ended"] as const;
export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

export const recurringPlans = pgTable(
  "recurring_plans",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    categoryId: text("category_id").notNull().references(() => serviceCategories.id),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("normal"),
    address: text("address").notNull(),
    city: text("city"),
    preferredUserId: uuid("preferred_user_id").references(() => users.id),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    /** Local start time in the organization's timezone, "HH:MM". */
    startTime: text("start_time").notNull().default("09:00"),
    intervalUnit: text("interval_unit", { enum: RECURRING_UNITS }).notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    /** 0 = Monday … 6 = Sunday. Only for weekly plans. */
    weekday: smallint("weekday"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    nextRunOn: date("next_run_on"),
    status: text("status", { enum: RECURRING_STATUSES }).notNull().default("active"),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    checklist: text("checklist").array().$type<string[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("recurring_org_idx").on(t.orgId, t.status)],
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: id(),
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 10460 }).notNull(),
    providerOrgId: uuid("provider_org_id").notNull().references(() => organizations.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    /** The enterprise that owns the location/asset, when there is one. */
    clientOrgId: uuid("client_org_id").references(() => organizations.id),
    requestId: uuid("request_id").references(() => serviceRequests.id),
    quoteId: uuid("quote_id").references(() => quotes.id),
    recurringPlanId: uuid("recurring_plan_id").references(() => recurringPlans.id),
    /** Which occurrence of the plan this is — makes generation idempotent. */
    occurrenceOn: date("occurrence_on"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    categoryId: text("category_id").notNull().references(() => serviceCategories.id),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("normal"),
    status: text("status", { enum: WORK_ORDER_STATUSES }).notNull().default("open"),
    holdReason: text("hold_reason"),
    address: text("address").notNull(),
    city: text("city"),
    locationId: uuid("location_id").references(() => locations.id),
    assetId: uuid("asset_id").references(() => assets.id),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    scheduledStart: ts("scheduled_start"),
    scheduledEnd: ts("scheduled_end"),
    slaDueAt: ts("sla_due_at"),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    completionNote: text("completion_note"),
    /** The technician tapped "On my way" — customer and dispatch can see travel has begun. */
    travelStartedAt: ts("travel_started_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("wo_provider_idx").on(t.providerOrgId, t.status),
    index("wo_client_idx").on(t.clientOrgId),
    index("wo_assignee_idx").on(t.assigneeUserId),
    index("wo_asset_idx").on(t.assetId),
    index("wo_customer_idx").on(t.customerId),
    uniqueIndex("wo_plan_occurrence_idx").on(t.recurringPlanId, t.occurrenceOn).where(sql`${t.recurringPlanId} is not null`),
  ],
);

/** Parts and materials a technician used. Retry-safe through `clientOpId`. */
export const workOrderParts = pgTable(
  "work_order_parts",
  {
    id: id(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    addedByUserId: uuid("added_by_user_id").notNull().references(() => users.id),
    clientOpId: text("client_op_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("parts_wo_idx").on(t.workOrderId)],
);

export const EVIDENCE_KINDS = ["photo", "note", "signature", "scan", "document"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: EVIDENCE_KINDS }).notNull(),
    phase: text("phase", { enum: ["before", "during", "after"] }).notNull(),
    caption: text("caption").notNull(),
    /** Storage key of the file (see lib/storage), for photos and documents. */
    fileKey: text("file_key"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    /** Client-generated id so a retried upload never creates a second row. */
    clientOpId: text("client_op_id").unique(),
    capturedByUserId: uuid("captured_by_user_id").notNull().references(() => users.id),
    capturedAt: createdAt(),
  },
  (t) => [index("evidence_wo_idx").on(t.workOrderId)],
);

/** Metadata for every object in storage. An upload is "pending" until the bytes are verified. */
export const storedFiles = pgTable(
  "stored_files",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    purpose: text("purpose", { enum: ["evidence", "quote_attachment"] }).notNull(),
    /** The work order or quote the upload was authorised for. */
    subjectId: uuid("subject_id"),
    status: text("status", { enum: ["pending", "ready"] }).notNull().default("pending"),
    uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("stored_files_user_idx").on(t.uploadedByUserId)],
);

/**
 * Append-only audit trail. Every meaningful state change writes one row, scoped to the
 * things it is about so each timeline (work order, request, customer, recurring plan,
 * organization) is a filter over the same table.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => serviceRequests.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    recurringPlanId: uuid("recurring_plan_id").references(() => recurringPlans.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: createdAt(),
  },
  (t) => [
    index("activity_wo_idx").on(t.workOrderId),
    index("activity_request_idx").on(t.requestId),
    index("activity_customer_idx").on(t.customerId),
    index("activity_plan_idx").on(t.recurringPlanId),
    index("activity_org_idx").on(t.orgId, t.occurredAt),
  ],
);

// ── Money and reputation ────────────────────────────────────────────────────

export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "void", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceLine = { description: string; kind?: QuoteLineKind; quantity: number; unit?: string; unitMinor: number };

export const invoices = pgTable("invoices", {
  id: id(),
  number: integer("number").generatedAlwaysAsIdentity({ startWith: 3100 }).notNull(),
  workOrderId: uuid("work_order_id").notNull().unique().references(() => workOrders.id),
  providerOrgId: uuid("provider_org_id").notNull().references(() => organizations.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  lines: jsonb("lines").$type<InvoiceLine[]>().notNull().default([]),
  subtotalMinor: money("subtotal_minor"),
  discountMinor: money("discount_minor").notNull().default(0),
  taxBps: integer("tax_bps").notNull().default(0),
  taxMinor: money("tax_minor").notNull().default(0),
  /** The invoice total (subtotal − discount + tax). */
  amountMinor: money("amount_minor").notNull(),
  amountPaidMinor: money("amount_paid_minor").notNull().default(0),
  currency: text("currency").notNull(),
  status: text("status", { enum: INVOICE_STATUSES }).notNull().default("issued"),
  notes: text("notes"),
  issuedAt: createdAt(),
  dueAt: ts("due_at").notNull(),
  paidAt: ts("paid_at"),
});

export const payments = pgTable("payments", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  /** Negative for refunds. */
  amountMinor: money("amount_minor").notNull(),
  currency: text("currency").notNull(),
  /** Which payment rail handled it. Card data never reaches TrustCraft. */
  method: text("method").notNull(),
  reference: text("reference").notNull(),
  note: text("note"),
  payerUserId: uuid("payer_user_id").references(() => users.id),
  /** Set when a provider records a payment received outside TrustCraft (cash, bank transfer). */
  recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
  createdAt: createdAt(),
});

export const reviews = pgTable("reviews", {
  id: id(),
  workOrderId: uuid("work_order_id").notNull().unique().references(() => workOrders.id),
  providerOrgId: uuid("provider_org_id").notNull().references(() => organizations.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  rating: smallint("rating").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

// ── Platform ────────────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = ["assignment", "work", "quote", "verification", "invoice", "sla", "team", "system"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["action", "update"] }).notNull(),
    category: text("category", { enum: NOTIFICATION_CATEGORIES }).notNull().default("system"),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    /** Periodic generators set this so the same warning is never delivered twice. */
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.readAt),
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

/** A filter/sort combination someone wants back with one click. `params` is the URL query. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    params: jsonb("params").$type<Record<string, string>>().notNull().default({}),
    /** "org" is reserved for views shared with a whole organization. */
    visibility: text("visibility", { enum: ["personal", "org"] }).notNull().default("personal"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_views_owner_name_idx").on(t.userId, t.orgId, t.scope, t.name)],
);

/** Fixed-window rate limit counters. In the database so limits hold across server processes. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
});

/** Security-relevant events: failed sign-ins, lockouts, password changes, privileged actions. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    ip: text("ip"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("security_events_created_idx").on(t.createdAt)],
);

/** Outcomes of client-tagged operations, so a retried mutation returns the original result. */
export const clientOps = pgTable(
  "client_ops",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);
