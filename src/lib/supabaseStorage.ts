// src/lib/supabaseStorage.ts
// Supabase-backed data functions for TrayFlow (Customers, Orders, Tasks, Events, Varieties)
//
// Notes:
// - Dates are stored as DATE in Supabase, but in the app we keep them as "YYYY-MM-DD" strings.
// - This file exports BOTH the "plain" names and "*SB" aliases to avoid breaking imports.

import { supabase } from "../utils/supabaseClient";

/* ----------------- Types ----------------- */

export type StandingOrderItem = {
  id: string;
  dayOfWeek: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  varietyId?: string;
  varietyName?: string;
  quantity: number; // trays
  packSize?: string; // e.g. "4oz clamshell"
  notes?: string;
};

export type Customer = {
  id: string;
  name: string;

  // legacy
  contact?: string;

  // profile
  contactName?: string;
  email?: string;
  phone?: string;

  // delivery
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  deliveryDays?: string[];
  deliveryWindow?: string;
  dropoffInstructions?: string;

  // billing
  priceTier?: string;
  paymentTerms?: string;
  preferredPaymentMethod?: string;
  taxExempt?: boolean;

  // ops
  packagingPrefs?: any;
  tags?: string[];
  standingOrders?: StandingOrderItem[];
  notes?: string;
  active?: boolean;
};

// ✅ Add packed
export type OrderStatus = "draft" | "confirmed" | "packed" | "delivered";

export type Order = {
  id: string;
  customerId: string;
  varietyId: string;
  quantity: number;
  deliveryDate: string; // YYYY-MM-DD
  status: OrderStatus;
  created_at?: string;
};

export type TaskStatus = "planned" | "in_progress" | "ready" | "delivered" | "done";

// Matches DB check constraint:
// CHECK (task_type = ANY (ARRAY['sow','spray','water','blackout','lights_on','harvest','delivery','other']))
export type TaskType =
  | "sow"
  | "spray"
  | "water"
  | "blackout"
  | "lights_on"
  | "harvest"
  | "delivery"
  | "other";

export type Task = {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  status: TaskStatus;
  orderId?: string | null;
  created_at?: string;

  // optional (exists in DB)
  task_type?: TaskType | null;
  source?: string | null;
  phase?: string | null;
  generator_key?: string | null;
};

export type EventType = "sow" | "harvest" | "delivery" | "other";

export type Event = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  orderId?: string | null;
  taskId?: string | null;
  created_at?: string;
};

// Minimal Variety shape used across the app.
// (Some screens call it `name`, some DBs use `variety`.)
export type Variety = {
  id: string;
  name: string;
  daysToHarvest: number;
  blackoutDays?: number;
  soakHours?: number;
};

/* ----------------- Helpers ----------------- */

function assertOk<T>(data: T | null, error: any) {
  if (error) throw new Error(error.message ?? "Supabase error");
  return data as T;
}

function mapCustomer(r: any): Customer {
  return {
    id: r.id,
    name: r.name ?? "",
    contact: r.contact ?? undefined,

    contactName: r.contact_name ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,

    addressLine1: r.address_line1 ?? undefined,
    addressLine2: r.address_line2 ?? undefined,
    city: r.city ?? undefined,
    state: r.state ?? undefined,
    zip: r.zip ?? undefined,

    deliveryDays: Array.isArray(r.delivery_days) ? r.delivery_days : [],
    deliveryWindow: r.delivery_window ?? undefined,
    dropoffInstructions: r.dropoff_instructions ?? undefined,

    priceTier: r.price_tier ?? undefined,
    paymentTerms: r.payment_terms ?? undefined,
    preferredPaymentMethod: r.preferred_payment_method ?? undefined,
    taxExempt: Boolean(r.tax_exempt),

    packagingPrefs: r.packaging_prefs ?? {},
    tags: Array.isArray(r.tags) ? r.tags : [],
    standingOrders: Array.isArray(r.standing_orders) ? r.standing_orders : [],
    notes: r.notes ?? undefined,
    active: r.active === undefined ? true : Boolean(r.active),
  };
}

function toUtcYMD(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return toUtcYMD(dt);
}

function subtractDaysYMD(ymd: string, days: number) {
  return addDaysYMD(ymd, -Number(days || 0));
}

function listDates(startYMD: string, days: number): string[] {
  return Array.from({ length: Math.max(0, days) }, (_, i) => addDaysYMD(startYMD, i));
}

function addToMap(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) ?? 0) + Number(qty || 0));
}

/* ----------------- Customers ----------------- */

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from("customers").select("*").order("name", {
    ascending: true,
  });

  const rows = assertOk<any[]>(data ?? [], error);
  return rows.map(mapCustomer);
}

export async function addCustomer(input: Omit<Customer, "id">): Promise<Customer> {
  const payload = {
    name: input.name.trim(),
    contact: input.contact?.trim() || null,

    contact_name: input.contactName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,

    address_line1: input.addressLine1?.trim() || null,
    address_line2: input.addressLine2?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    zip: input.zip?.trim() || null,

    delivery_days: input.deliveryDays ?? [],
    delivery_window: input.deliveryWindow?.trim() || null,
    dropoff_instructions: input.dropoffInstructions?.trim() || null,

    price_tier: input.priceTier ?? "standard",
    payment_terms: input.paymentTerms ?? "due_on_receipt",
    preferred_payment_method: input.preferredPaymentMethod?.trim() || null,
    tax_exempt: input.taxExempt ?? false,

    packaging_prefs: input.packagingPrefs ?? {},
    tags: input.tags ?? [],
    standing_orders: input.standingOrders ?? [],
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };

  const { data, error } = await supabase.from("customers").insert(payload).select("*").single();
  const row = assertOk<any>(data, error);
  return mapCustomer(row);
}

export async function updateCustomer(
  id: string,
  input: Partial<Omit<Customer, "id">>
): Promise<Customer> {
  const payload: any = {};

  if (input.name !== undefined) payload.name = input.name;
  if (input.contact !== undefined) payload.contact = input.contact ?? null;

  if (input.contactName !== undefined) payload.contact_name = input.contactName ?? null;
  if (input.email !== undefined) payload.email = input.email ?? null;
  if (input.phone !== undefined) payload.phone = input.phone ?? null;

  if (input.addressLine1 !== undefined) payload.address_line1 = input.addressLine1 ?? null;
  if (input.addressLine2 !== undefined) payload.address_line2 = input.addressLine2 ?? null;
  if (input.city !== undefined) payload.city = input.city ?? null;
  if (input.state !== undefined) payload.state = input.state ?? null;
  if (input.zip !== undefined) payload.zip = input.zip ?? null;

  if (input.deliveryDays !== undefined) payload.delivery_days = input.deliveryDays ?? [];
  if (input.deliveryWindow !== undefined) payload.delivery_window = input.deliveryWindow ?? null;
  if (input.dropoffInstructions !== undefined)
    payload.dropoff_instructions = input.dropoffInstructions ?? null;

  if (input.priceTier !== undefined) payload.price_tier = input.priceTier ?? "standard";
  if (input.paymentTerms !== undefined) payload.payment_terms = input.paymentTerms ?? "due_on_receipt";
  if (input.preferredPaymentMethod !== undefined)
    payload.preferred_payment_method = input.preferredPaymentMethod ?? null;
  if (input.taxExempt !== undefined) payload.tax_exempt = Boolean(input.taxExempt);

  if (input.packagingPrefs !== undefined) payload.packaging_prefs = input.packagingPrefs ?? {};
  if (input.tags !== undefined) payload.tags = input.tags ?? [];
  if (input.standingOrders !== undefined) payload.standing_orders = input.standingOrders ?? [];
  if (input.notes !== undefined) payload.notes = input.notes ?? null;
  if (input.active !== undefined) payload.active = Boolean(input.active);

  const { data, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  const row = assertOk<any>(data, error);
  return mapCustomer(row);
}

/* ----------------- Varieties ----------------- */

// ✅ Used by New Order + Production Sheet.
// Your DB seems to store variety name as `variety` and days as `harvest_days`.
// Some parts of the app expect `name` + `daysToHarvest`.
export async function fetchVarietiesForOrders(): Promise<Variety[]> {
  const { data, error } = await supabase
    .from("varieties")
    .select("id, variety, harvest_days, blackout_days, soak_hours")
    .order("variety", { ascending: true });

  const rows = assertOk<any[]>(data ?? [], error);

  return rows.map((r) => ({
    id: r.id,
    name: (r.variety ?? "").toString(),
    daysToHarvest: Number(r.harvest_days ?? 0),
    blackoutDays: Number(r.blackout_days ?? 0),
    soakHours: Number(r.soak_hours ?? 0),
  }));
}

/* ----------------- Orders ----------------- */

export async function getOrders(): Promise<Order[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase.from("orders").select("*").order("delivery_date", {
    ascending: true,
  });

  const rows = assertOk<any[]>(data ?? [], error);
  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    varietyId: r.variety_id,
    quantity: Number(r.quantity ?? 0),
    deliveryDate: r.delivery_date,
    status: (r.status as OrderStatus) ?? "draft",
    created_at: r.created_at,
  }));
}

export async function addOrder(input: {
  customerId: string;
  varietyId: string;
  quantity: number;
  deliveryDate: string; // YYYY-MM-DD
  status: OrderStatus;
}): Promise<Order> {
  const payload = {
    customer_id: input.customerId,
    variety_id: input.varietyId,
    quantity: Number(input.quantity),
    delivery_date: input.deliveryDate,
    status: input.status,
  };

  // 1) Create the order
  const { data, error } = await supabase.from("orders").insert(payload).select("*").single();
  const r = assertOk<any>(data, error);

  // 2) ALSO create a grow batch so "Active Trays" enforcement works
  // account_id should auto-fill via DB default (current_account_id()).
  const growPayload = {
    variety_id: input.varietyId,
    tray_count: Number(input.quantity),
    status: "seeded",
  };

  const { error: gErr } = await supabase.from("grows").insert(growPayload);
  if (gErr) {
    // Best-effort rollback: delete the order we just created
    await supabase.from("orders").delete().eq("id", r.id);
    throw new Error(gErr.message);
  }

  return {
    id: r.id,
    customerId: r.customer_id,
    varietyId: r.variety_id,
    quantity: Number(r.quantity ?? 0),
    deliveryDate: r.delivery_date,
    status: (r.status as OrderStatus) ?? "draft",
    created_at: r.created_at,
  };
}

// ✅ Needed by some screens that update multiple order rows.
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

/* ----------------- Tasks ----------------- */

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("tasks").select("*").order("due_date", {
    ascending: true,
  });

  const rows = assertOk<any[]>(data ?? [], error);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueDate: r.due_date,
    status: (r.status as TaskStatus) ?? "planned",
    orderId: r.order_id ?? null,
    created_at: r.created_at,

    task_type: (r.task_type as TaskType) ?? null,
    source: r.source ?? null,
    phase: r.phase ?? null,
    generator_key: r.generator_key ?? null,
  }));
}

export async function addTask(input: {
  title: string;
  dueDate: string; // YYYY-MM-DD
  status: TaskStatus;
  orderId?: string;
}): Promise<Task> {
  const payload = {
    title: input.title.trim(),
    due_date: input.dueDate,
    status: input.status,
    order_id: input.orderId ?? null,
  };

  const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();
  const r = assertOk<any>(data, error);

  return {
    id: r.id,
    title: r.title,
    dueDate: r.due_date,
    status: (r.status as TaskStatus) ?? "planned",
    orderId: r.order_id ?? null,
    created_at: r.created_at,

    task_type: (r.task_type as TaskType) ?? null,
    source: r.source ?? null,
    phase: r.phase ?? null,
    generator_key: r.generator_key ?? null,
  };
}

/* ----------------- Events ----------------- */

export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase.from("events").select("*").order("date", {
    ascending: true,
  });

  const rows = assertOk<any[]>(data ?? [], error);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    type: (r.type as EventType) ?? "other",
    orderId: r.order_id ?? null,
    taskId: r.task_id ?? null,
    created_at: r.created_at,
  }));
}

export async function addEvent(input: {
  title: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  orderId?: string;
  taskId?: string;
}): Promise<Event> {
  const payload = {
    title: input.title.trim(),
    date: input.date,
    type: input.type,
    order_id: input.orderId ?? null,
    task_id: input.taskId ?? null,
  };

  const { data, error } = await supabase.from("events").insert(payload).select("*").single();
  const r = assertOk<any>(data, error);

  return {
    id: r.id,
    title: r.title,
    date: r.date,
    type: (r.type as EventType) ?? "other",
    orderId: r.order_id ?? null,
    taskId: r.task_id ?? null,
    created_at: r.created_at,
  };
}

/* ----------------- Phase Task Sync (grouped SYS + SYS:DETAIL) ----------------- */

type PhaseKey = "soak" | "sow" | "spray" | "lights_on" | "water" | "harvest" | "deliver";

function phaseSummaryTitle(key: PhaseKey): string {
  switch (key) {
    case "soak":
      return "Soak (12h)";
    case "sow":
      return "Sow + Stack (Blackout)";
    case "spray":
      return "Spray (Blackout) — AM/PM as needed";
    case "lights_on":
      return "Lights On (Unstack + First Water)";
    case "water":
      return "Water (Lights On) — AM/PM as needed";
    case "harvest":
      return "Harvest";
    case "deliver":
      return "Deliver";
    default:
      return "Task";
  }
}

function taskTypeForPhase(phase: PhaseKey): TaskType {
  switch (phase) {
    case "sow":
      return "sow";
    case "spray":
      return "spray";
    case "lights_on":
      return "lights_on";
    case "water":
      return "water";
    case "harvest":
      return "harvest";
    case "deliver":
      return "delivery";
    case "soak":
    default:
      return "other"; // DB constraint doesn't include "soak"
  }
}

const PHASE_ORDER: PhaseKey[] = ["soak", "sow", "spray", "lights_on", "water", "harvest", "deliver"];

function makeGeneratorKey(due: string, phase: PhaseKey, kind: "summary" | "detail") {
  return `phase:${due}:${phase}:${kind}`;
}

function sortedEntries(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, qty]) => ({ label, qty }))
    .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));
}

function groupKey(variety: string, customer: string) {
  return `${variety} → ${customer}`;
}

export async function syncPhaseTasksRange(startYMD: string, days: number) {
  const dates = listDates(startYMD, days);
  if (dates.length === 0) return;

  const start = dates[0];
  const end = dates[dates.length - 1];

  const { error: delErr } = await supabase
    .from("tasks")
    .delete()
    .gte("due_date", start)
    .lte("due_date", end)
    .eq("source", "generated");

  if (delErr) throw new Error(delErr.message);

  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select(
      `
      id,
      quantity,
      delivery_date,
      status,
      customer_id,
      customers ( id, name ),
      varieties ( id, variety, soak_hours, blackout_days, harvest_days )
    `
    )
    .neq("status", "delivered");

  if (oErr) throw new Error(oErr.message);

  const orderRows = (orders ?? []).map((o: any) => {
    const v = o.varieties ?? {};
    const c = o.customers ?? {};
    return {
      id: o.id as string,
      qty: Number(o.quantity ?? 0),
      deliveryDate: o.delivery_date as string,
      status: (o.status as OrderStatus) ?? "draft",
      varietyName: (v.variety ?? "Variety") as string,
      soakHours: Number(v.soak_hours ?? 0),
      blackoutDays: Number(v.blackout_days ?? 0),
      harvestDays: Number(v.harvest_days ?? 0),
      customerName: (c.name ?? "Customer") as string,
    };
  });

  if (orderRows.length === 0) return;

  type DayBucket = {
    summary: Record<PhaseKey, Map<string, number>>;
    detail: Record<PhaseKey, Map<string, number>>;
    deliverBreakdown: Map<string, Map<string, number>>;
  };

  const byDay = new Map<string, DayBucket>();

  function ensureDay(d: string): DayBucket {
    const existing = byDay.get(d);
    if (existing) return existing;

    const mk = () => new Map<string, number>();
    const bucket: DayBucket = {
      summary: {
        soak: mk(),
        sow: mk(),
        spray: mk(),
        lights_on: mk(),
        water: mk(),
        harvest: mk(),
        deliver: mk(),
      },
      detail: {
        soak: mk(),
        sow: mk(),
        spray: mk(),
        lights_on: mk(),
        water: mk(),
        harvest: mk(),
        deliver: mk(),
      },
      deliverBreakdown: new Map<string, Map<string, number>>(),
    };
    byDay.set(d, bucket);
    return bucket;
  }

  function addDelivery(due: string, customer: string, variety: string, trays: number) {
    const b = ensureDay(due);
    addToMap(b.summary.deliver, customer, trays);
    addToMap(b.detail.deliver, customer, trays);

    const m = b.deliverBreakdown.get(customer) ?? new Map<string, number>();
    m.set(variety, (m.get(variety) ?? 0) + Number(trays || 0));
    b.deliverBreakdown.set(customer, m);
  }

  for (const o of orderRows) {
    const sowDate = o.harvestDays > 0 ? subtractDaysYMD(o.deliveryDate, o.harvestDays) : o.deliveryDate;
    const harvestDate = subtractDaysYMD(o.deliveryDate, 1);
    const lightsOnDate = o.blackoutDays > 0 ? addDaysYMD(sowDate, o.blackoutDays) : sowDate;

    const variety = o.varietyName;
    const customer = o.customerName;
    const detailKey = groupKey(variety, customer);

    const packedOnlyDelivery = o.status === "packed";

    if (!packedOnlyDelivery) {
      if (o.soakHours > 0) {
        if (sowDate >= start && sowDate <= end) {
          addToMap(ensureDay(sowDate).summary.soak, variety, o.qty);
          addToMap(ensureDay(sowDate).detail.soak, detailKey, o.qty);
        }
      }

      if (sowDate >= start && sowDate <= end) {
        addToMap(ensureDay(sowDate).summary.sow, variety, o.qty);
        addToMap(ensureDay(sowDate).detail.sow, detailKey, o.qty);
      }

      if (o.blackoutDays > 0) {
        const blackoutStart = sowDate;
        const blackoutEnd = addDaysYMD(sowDate, o.blackoutDays - 1);
        for (const d of dates) {
          if (d >= blackoutStart && d <= blackoutEnd) {
            addToMap(ensureDay(d).summary.spray, variety, o.qty);
            addToMap(ensureDay(d).detail.spray, detailKey, o.qty);
          }
        }
      }

      if (lightsOnDate >= start && lightsOnDate <= end && lightsOnDate <= harvestDate) {
        addToMap(ensureDay(lightsOnDate).summary.lights_on, variety, o.qty);
        addToMap(ensureDay(lightsOnDate).detail.lights_on, detailKey, o.qty);
      }

      for (const d of dates) {
        if (d >= lightsOnDate && d <= harvestDate) {
          addToMap(ensureDay(d).summary.water, variety, o.qty);
          addToMap(ensureDay(d).detail.water, detailKey, o.qty);
        }
      }

      if (harvestDate >= start && harvestDate <= end) {
        addToMap(ensureDay(harvestDate).summary.harvest, variety, o.qty);
        addToMap(ensureDay(harvestDate).detail.harvest, detailKey, o.qty);
      }
    }

    if (o.deliveryDate >= start && o.deliveryDate <= end) {
      addDelivery(o.deliveryDate, customer, variety, o.qty);
    }
  }

  const tasksToUpsert: any[] = [];

  for (const d of dates) {
    const bucket = byDay.get(d);
    if (!bucket) continue;

    for (const phase of PHASE_ORDER) {
      const sumMap = bucket.summary[phase];
      if (!sumMap || sumMap.size === 0) continue;

      tasksToUpsert.push({
        title: `SYS:${phaseSummaryTitle(phase)}`,
        due_date: d,
        status: "planned",
        order_id: null,

        task_type: taskTypeForPhase(phase),
        source: "generated",
        phase,
        generator_key: makeGeneratorKey(d, phase, "summary"),
      });

      let detailText = "";

      if (phase === "deliver") {
        const customers = sortedEntries(bucket.detail.deliver);
        detailText = customers
          .map((c) => {
            const breakdown = bucket.deliverBreakdown.get(c.label) ?? new Map<string, number>();
            const parts = Array.from(breakdown.entries())
              .map(([v, q]) => ({ v, q }))
              .sort((a, b) => b.q - a.q || a.v.localeCompare(b.v))
              .map((x) => `${x.v} x${x.q}`)
              .join(", ");
            return `${c.label} — ${c.qty} trays${parts ? ` (${parts})` : ""}`;
          })
          .join(" • ");
      } else {
        const detMap = bucket.detail[phase];
        const items = sortedEntries(detMap);
        detailText = items.map((x) => `${x.label} x${x.qty}`).join(", ");
      }

      tasksToUpsert.push({
        title: `SYS:DETAIL:${phaseSummaryTitle(phase)} — ${detailText}`,
        due_date: d,
        status: "planned",
        order_id: null,

        task_type: taskTypeForPhase(phase),
        source: "generated",
        phase,
        generator_key: makeGeneratorKey(d, phase, "detail"),
      });
    }
  }

  if (tasksToUpsert.length > 0) {
    const { error: insErr } = await supabase
      .from("tasks")
      .upsert(tasksToUpsert, { onConflict: "source,generator_key" });

    if (insErr) throw new Error(insErr.message);
  }
}

export async function syncDailyPhaseTasks(todayYMD: string) {
  return syncPhaseTasksRange(todayYMD, 1);
}

/* ----------------- "*SB" compatibility exports ----------------- */
/* These prevent “does not provide an export named …” errors across pages. */

// Customers
export const getCustomersSB = getCustomers;
export const addCustomerSB = addCustomer;
export const updateCustomerSB = updateCustomer;

// Varieties
export const fetchVarietiesForOrdersSB = fetchVarietiesForOrders;

// Orders
export const getOrdersSB = getOrders;
export const addOrderSB = addOrder;
export const updateOrderStatusSB = updateOrderStatus;

// Tasks
export const getTasksSB = getTasks;
export const addTaskSB = addTask;

// Events
export const getEventsSB = getEvents;
export const addEventSB = addEvent;
