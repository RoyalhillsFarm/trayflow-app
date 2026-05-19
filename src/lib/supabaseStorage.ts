// src/lib/supabaseStorage.ts
import { supabase } from "../utils/supabaseClient";

export type StandingOrderItem = {
  id: string;
  dayOfWeek: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  varietyId?: string;
  varietyName?: string;
  quantity: number;
  packSize?: string;
  notes?: string;
};

export type Customer = {
  id: string;
  account_id?: string | null;
  name: string;
  contact?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  deliveryDays?: string[];
  deliveryWindow?: string;
  dropoffInstructions?: string;
  priceTier?: string;
  paymentTerms?: string;
  preferredPaymentMethod?: string;
  taxExempt?: boolean;
  packagingPrefs?: any;
  tags?: string[];
  standingOrders?: StandingOrderItem[];
  notes?: string;
  active?: boolean;
};

export type OrderStatus = "draft" | "confirmed" | "packed" | "delivered";
export type TaskStatus = "planned" | "in_progress" | "ready" | "delivered" | "done";

export type TaskType =
  | "sow"
  | "spray"
  | "water"
  | "blackout"
  | "lights_on"
  | "harvest"
  | "delivery"
  | "other";

export type Order = {
  id: string;
  account_id?: string | null;
  customerId: string;
  varietyId: string;
  quantity: number;
  deliveryDate: string;
  status: OrderStatus;
  created_at?: string;
};

export type Task = {
  id: string;
  account_id?: string | null;
  title: string;
  dueDate: string;
  status: TaskStatus;
  orderId?: string | null;
  created_at?: string;
  task_type?: TaskType | null;
  source?: string | null;
  phase?: string | null;
  generator_key?: string | null;
};

export type EventType = "sow" | "harvest" | "delivery" | "other";

export type Event = {
  id: string;
  title: string;
  date: string;
  type: EventType;
  orderId?: string | null;
  taskId?: string | null;
  created_at?: string;
};

export type Variety = {
  id: string;
  name: string;
  daysToHarvest: number;
  blackoutDays?: number;
  soakHours?: number;
};

function assertOk<T>(data: T | null, error: any) {
  if (error) throw new Error(error.message ?? "Supabase error");
  return data as T;
}

async function getCurrentAccountId(): Promise<string> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error("No signed-in user found.");

  const { data, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(error.message);
  if (!data?.account_id) throw new Error("No account linked to this user.");

  return data.account_id as string;
}

function mapCustomer(r: any): Customer {
  return {
    id: r.id,
    account_id: r.account_id ?? null,
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
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
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

/* ---------------- Customers ---------------- */

export async function getCustomers(): Promise<Customer[]> {
  const accountId = await getCurrentAccountId();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("name", { ascending: true });

  return assertOk<any[]>(data ?? [], error).map(mapCustomer);
}

export async function addCustomer(input: Omit<Customer, "id">): Promise<Customer> {
  const accountId = await getCurrentAccountId();

  const payload = {
    account_id: accountId,
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
  return mapCustomer(assertOk<any>(data, error));
}

export async function updateCustomer(
  id: string,
  input: Partial<Omit<Customer, "id">>
): Promise<Customer> {
  const accountId = await getCurrentAccountId();
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
  if (input.dropoffInstructions !== undefined) payload.dropoff_instructions = input.dropoffInstructions ?? null;
  if (input.priceTier !== undefined) payload.price_tier = input.priceTier ?? "standard";
  if (input.paymentTerms !== undefined) payload.payment_terms = input.paymentTerms ?? "due_on_receipt";
  if (input.preferredPaymentMethod !== undefined) payload.preferred_payment_method = input.preferredPaymentMethod ?? null;
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
    .eq("account_id", accountId)
    .select("*")
    .single();

  return mapCustomer(assertOk<any>(data, error));
}

/* ---------------- Varieties ---------------- */

export async function fetchVarietiesForOrders(): Promise<Variety[]> {
  const accountId = await getCurrentAccountId();

  const { data, error } = await supabase
    .from("varieties")
    .select("id, variety, harvest_days, blackout_days, soak_hours")
    .eq("account_id", accountId)
    .is("disabled_at", null)
    .order("variety", { ascending: true });

  const rows = assertOk<any[]>(data ?? [], error);
  const map = new Map<string, Variety>();

  for (const r of rows) {
    const key = String(r.variety ?? "").trim().toLowerCase();
    if (!key || map.has(key)) continue;

    map.set(key, {
      id: r.id,
      name: String(r.variety ?? ""),
      daysToHarvest: Number(r.harvest_days ?? 0),
      blackoutDays: Number(r.blackout_days ?? 0),
      soakHours: Number(r.soak_hours ?? 0),
    });
  }

  return Array.from(map.values());
}

/* ---------------- Orders ---------------- */

export async function getOrders(): Promise<Order[]> {
  const accountId = await getCurrentAccountId();

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("account_id", accountId)
    .order("delivery_date", { ascending: true });

  return assertOk<any[]>(data ?? [], error).map((r) => ({
    id: r.id,
    account_id: r.account_id ?? null,
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
  deliveryDate: string;
  status: OrderStatus;
  account_id?: string | null;
}): Promise<Order> {
  const accountId = input.account_id || (await getCurrentAccountId());

  const payload = {
    account_id: accountId,
    customer_id: input.customerId,
    variety_id: input.varietyId,
    quantity: Number(input.quantity),
    delivery_date: input.deliveryDate,
    status: input.status,
  };

  const { data, error } = await supabase.from("orders").insert(payload).select("*").single();
  const r = assertOk<any>(data, error);

  const { error: growErr } = await supabase.from("grows").insert({
    account_id: accountId,
    variety_id: input.varietyId,
    tray_count: Number(input.quantity),
    status: "seeded",
  });

  if (growErr) {
    await supabase.from("orders").delete().eq("id", r.id).eq("account_id", accountId);
    throw new Error(growErr.message);
  }

  return {
    id: r.id,
    account_id: r.account_id ?? null,
    customerId: r.customer_id,
    varietyId: r.variety_id,
    quantity: Number(r.quantity ?? 0),
    deliveryDate: r.delivery_date,
    status: (r.status as OrderStatus) ?? "draft",
    created_at: r.created_at,
  };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const accountId = await getCurrentAccountId();

  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("account_id", accountId);

  if (error) throw new Error(error.message);
}

/* ---------------- Tasks ---------------- */

export async function getTasks(): Promise<Task[]> {
  const accountId = await getCurrentAccountId();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("account_id", accountId)
    .order("due_date", { ascending: true });

  return assertOk<any[]>(data ?? [], error).map((r) => ({
    id: r.id,
    account_id: r.account_id ?? null,
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
  dueDate: string;
  status: TaskStatus;
  orderId?: string;
}): Promise<Task> {
  const accountId = await getCurrentAccountId();

  const payload = {
    account_id: accountId,
    title: input.title.trim(),
    due_date: input.dueDate,
    status: input.status,
    order_id: input.orderId ?? null,
  };

  const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();
  const r = assertOk<any>(data, error);

  return {
    id: r.id,
    account_id: r.account_id ?? null,
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

/* ---------------- Events ---------------- */

export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase.from("events").select("*").order("date", { ascending: true });

  return assertOk<any[]>(data ?? [], error).map((r) => ({
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
  date: string;
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

/* ---------------- Generated Task Engine ---------------- */

type PhaseKey = "soak" | "sow" | "spray" | "lights_on" | "water" | "harvest" | "deliver";

function taskTypeForPhase(phase: PhaseKey): TaskType {
  if (phase === "sow") return "sow";
  if (phase === "spray") return "spray";
  if (phase === "lights_on") return "lights_on";
  if (phase === "water") return "water";
  if (phase === "harvest") return "harvest";
  if (phase === "deliver") return "delivery";
  return "other";
}

function phaseLabel(phase: PhaseKey) {
  if (phase === "soak") return "Soak";
  if (phase === "sow") return "Sow + Stack";
  if (phase === "spray") return "Spray / Check Blackout";
  if (phase === "lights_on") return "Lights On";
  if (phase === "water") return "Water";
  if (phase === "harvest") return "Harvest";
  if (phase === "deliver") return "Deliver";
  return "Task";
}

function generatorKey(accountId: string, orderId: string, phase: PhaseKey, dueDate: string) {
  return `account:${accountId}:order:${orderId}:phase:${phase}:due:${dueDate}`;
}

function addGeneratedTask(
  tasks: any[],
  args: {
    accountId: string;
    orderId: string;
    phase: PhaseKey;
    dueDate: string;
    varietyName: string;
    customerName: string;
    qty: number;
  }
) {
  tasks.push({
    account_id: args.accountId,
    title: `${phaseLabel(args.phase)} — ${args.varietyName} → ${args.customerName} x${args.qty}`,
    due_date: args.dueDate,
    status: "planned",
    order_id: args.orderId,
    task_type: taskTypeForPhase(args.phase),
    source: "generated",
    phase: args.phase,
    generator_key: generatorKey(args.accountId, args.orderId, args.phase, args.dueDate),
  });
}

export async function syncPhaseTasksRange(startYMD: string, days: number) {
  const accountId = await getCurrentAccountId();
  const dates = listDates(startYMD, days);
  if (dates.length === 0) return;

  const start = dates[0];
  const end = dates[dates.length - 1];

  const { error: deleteErr } = await supabase
    .from("tasks")
    .delete()
    .eq("account_id", accountId)
    .eq("source", "generated")
    .gte("due_date", start)
    .lte("due_date", end);

  if (deleteErr) throw new Error(deleteErr.message);

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      account_id,
      quantity,
      delivery_date,
      status,
      customer_id,
      customers ( id, name ),
      varieties ( id, variety, soak_hours, blackout_days, harvest_days )
    `
    )
    .eq("account_id", accountId)
    .neq("status", "delivered");

  if (error) throw new Error(error.message);

  const tasks: any[] = [];

  for (const o of data ?? []) {
    const v: any = (o as any).varieties ?? {};
    const c: any = (o as any).customers ?? {};

    const orderId = String((o as any).id);
    const qty = Number((o as any).quantity ?? 0);
    const deliveryDate = String((o as any).delivery_date);
    const status = ((o as any).status as OrderStatus) ?? "draft";

    const varietyName = String(v.variety ?? "Variety");
    const customerName = String(c.name ?? "Customer");

    const harvestDays = Number(v.harvest_days ?? 0);
    const blackoutDays = Number(v.blackout_days ?? 0);
    const soakHours = Number(v.soak_hours ?? 0);

    const sowDate = harvestDays > 0 ? subtractDaysYMD(deliveryDate, harvestDays) : deliveryDate;
    const harvestDate = subtractDaysYMD(deliveryDate, 1);
    const lightsOnDate = blackoutDays > 0 ? addDaysYMD(sowDate, blackoutDays) : sowDate;

    const packedOnlyDelivery = status === "packed";

    if (!packedOnlyDelivery) {
      if (soakHours > 0 && sowDate >= start && sowDate <= end) {
        addGeneratedTask(tasks, { accountId, orderId, phase: "soak", dueDate: sowDate, varietyName, customerName, qty });
      }

      if (sowDate >= start && sowDate <= end) {
        addGeneratedTask(tasks, { accountId, orderId, phase: "sow", dueDate: sowDate, varietyName, customerName, qty });
      }

      if (blackoutDays > 0) {
        const blackoutEnd = addDaysYMD(sowDate, blackoutDays - 1);
        for (const d of dates) {
          if (d >= sowDate && d <= blackoutEnd) {
            addGeneratedTask(tasks, { accountId, orderId, phase: "spray", dueDate: d, varietyName, customerName, qty });
          }
        }
      }

      if (lightsOnDate >= start && lightsOnDate <= end && lightsOnDate <= harvestDate) {
        addGeneratedTask(tasks, { accountId, orderId, phase: "lights_on", dueDate: lightsOnDate, varietyName, customerName, qty });
      }

      for (const d of dates) {
        if (d >= lightsOnDate && d <= harvestDate) {
          addGeneratedTask(tasks, { accountId, orderId, phase: "water", dueDate: d, varietyName, customerName, qty });
        }
      }

      if (harvestDate >= start && harvestDate <= end) {
        addGeneratedTask(tasks, { accountId, orderId, phase: "harvest", dueDate: harvestDate, varietyName, customerName, qty });
      }
    }

    if (deliveryDate >= start && deliveryDate <= end) {
      addGeneratedTask(tasks, { accountId, orderId, phase: "deliver", dueDate: deliveryDate, varietyName, customerName, qty });
    }
  }

  if (tasks.length > 0) {
    const { error: insertErr } = await supabase.from("tasks").insert(tasks);
    if (insertErr) throw new Error(insertErr.message);
  }
}

export async function syncDailyPhaseTasks(todayYMD: string) {
  return syncPhaseTasksRange(todayYMD, 1);
}

/* ---------------- Compatibility exports ---------------- */

export const getCustomersSB = getCustomers;
export const addCustomerSB = addCustomer;
export const updateCustomerSB = updateCustomer;

export const fetchVarietiesForOrdersSB = fetchVarietiesForOrders;

export const getOrdersSB = getOrders;
export const addOrderSB = addOrder;
export const updateOrderStatusSB = updateOrderStatus;

export const getTasksSB = getTasks;
export const addTaskSB = addTask;

export const getEventsSB = getEvents;
export const addEventSB = addEvent;