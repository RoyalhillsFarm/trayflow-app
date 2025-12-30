// src/lib/storage.ts

/* ---------- Types ---------- */

export type TaskStatus = "planned" | "in_progress" | "ready" | "delivered";

export interface Task {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  status: TaskStatus;
  createdAt: string;
  orderId?: string;
}

export interface NewTaskInput {
  title: string;
  dueDate: string;
  status: TaskStatus;
  orderId?: string;
}

export interface Event {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: "sow" | "harvest" | "delivery";
}

export interface Stats {
  activeTrays: number;
  harvestReady: number;
  upcomingDeliveries: number;
  weeklyRevenue: number;
}

export type OrderStatus = "draft" | "confirmed" | "delivered";

export interface Customer {
  id: string;
  name: string;
  contact?: string;
}

export interface NewCustomerInput {
  name: string;
  contact?: string;
}

export interface Variety {
  id: string;
  name: string;
  daysToHarvest: number;
}

export interface NewVarietyInput {
  name: string;
  daysToHarvest: number;
}

export interface Order {
  id: string;
  customerId: string;
  varietyId: string;
  quantity: number;
  deliveryDate: string; // YYYY-MM-DD
  status: OrderStatus;
  createdAt: string;
}

export interface NewOrderInput {
  customerId: string;
  varietyId: string;
  quantity: number;
  deliveryDate: string;
  status: OrderStatus;
}

/* ---------- Storage keys ---------- */

const TASKS_KEY = "trayflow.tasks";
const EVENTS_KEY = "trayflow.events";
const STATS_KEY = "trayflow.stats";
const CUSTOMERS_KEY = "trayflow.customers";
const VARIETIES_KEY = "trayflow.varieties";
const ORDERS_KEY = "trayflow.orders";

/* ---------- Helpers ---------- */

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("[storage] failed to load", key, err);
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("[storage] failed to save", key, err);
  }
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------- Tasks ---------- */

export function getTasks(): Task[] {
  return load<Task[]>(TASKS_KEY, []);
}

export function saveTasks(tasks: Task[]) {
  save(TASKS_KEY, tasks);
}

/**
 * Add a single task and also create a matching harvest event.
 */
export function addTask(input: NewTaskInput): Task {
  const tasks = getTasks();

  const newTask: Task = {
    id: generateId(),
    title: input.title,
    dueDate: input.dueDate,
    status: input.status,
    orderId: input.orderId,
    createdAt: new Date().toISOString(),
  };

  const updated = [...tasks, newTask];
  saveTasks(updated);

  // Create a simple event for the calendar
  const events = getEvents();
  const newEvent: Event = {
    id: generateId(),
    title: newTask.title,
    date: newTask.dueDate,
    type: "harvest",
  };
  saveEvents([...events, newEvent]);

  console.log("[storage.addTask] added task:", newTask);
  return newTask;
}

/* ---------- Events ---------- */

export function getEvents(): Event[] {
  return load<Event[]>(EVENTS_KEY, []);
}

export function saveEvents(events: Event[]) {
  save(EVENTS_KEY, events);
}

/* ---------- Stats ---------- */

export function getStats(): Stats | null {
  return load<Stats | null>(STATS_KEY, null);
}

export function saveStats(stats: Stats) {
  save(STATS_KEY, stats);
}

/* ---------- Customers ---------- */

export function getCustomers(): Customer[] {
  return load<Customer[]>(CUSTOMERS_KEY, []);
}

export function saveCustomers(customers: Customer[]) {
  save(CUSTOMERS_KEY, customers);
}

export function addCustomer(input: NewCustomerInput): Customer {
  const customers = getCustomers();
  const customer: Customer = {
    id: generateId(),
    name: input.name,
    contact: input.contact,
  };
  const updated = [...customers, customer];
  saveCustomers(updated);
  console.log("[storage.addCustomer] added:", customer);
  return customer;
}

/* ---------- Varieties ---------- */

export function getVarieties(): Variety[] {
  return load<Variety[]>(VARIETIES_KEY, []);
}

export function saveVarieties(varieties: Variety[]) {
  save(VARIETIES_KEY, varieties);
}

export function addVariety(input: NewVarietyInput): Variety {
  const varieties = getVarieties();
  const variety: Variety = {
    id: generateId(),
    name: input.name,
    daysToHarvest: input.daysToHarvest,
  };
  const updated = [...varieties, variety];
  saveVarieties(updated);
  console.log("[storage.addVariety] added:", variety);
  return variety;
}

/* ---------- Orders ---------- */

export function getOrders(): Order[] {
  return load<Order[]>(ORDERS_KEY, []);
}

export function saveOrders(orders: Order[]) {
  save(ORDERS_KEY, orders);
}

export function addOrder(input: NewOrderInput): Order {
  const orders = getOrders();

  const order: Order = {
    id: generateId(),
    customerId: input.customerId,
    varietyId: input.varietyId,
    quantity: input.quantity,
    deliveryDate: input.deliveryDate,
    status: input.status,
    createdAt: new Date().toISOString(),
  };

  const updated = [...orders, order];
  saveOrders(updated);
  console.log("[storage.addOrder] added:", order);
  return order;
}

/* ---------- Demo data + reset (optional, still available) ---------- */

export function seedDemoData(): void {
  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const demoTasks: Task[] = [
    {
      id: generateId(),
      title: "Sow pea shoots – Restaurant A",
      dueDate: day(2),
      status: "planned",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      title: "Harvest sunflower – CSA shares",
      dueDate: day(5),
      status: "in_progress",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      title: "Deliver spicy mix – Cafe B",
      dueDate: day(7),
      status: "ready",
      createdAt: new Date().toISOString(),
    },
  ];

  const demoEvents: Event[] = demoTasks.map((task) => ({
    id: generateId(),
    title: task.title,
    date: task.dueDate,
    type: "harvest",
  }));

  const demoStats: Stats = {
    activeTrays: 42,
    harvestReady: 8,
    upcomingDeliveries: 5,
    weeklyRevenue: 1230,
  };

  saveTasks(demoTasks);
  saveEvents(demoEvents);
  saveStats(demoStats);

  console.log("[storage.seedDemoData] seeded", {
    tasks: demoTasks.length,
    events: demoEvents.length,
    stats: demoStats,
  });
}

export function resetAllData(): void {
  try {
    localStorage.removeItem(TASKS_KEY);
    localStorage.removeItem(EVENTS_KEY);
    localStorage.removeItem(STATS_KEY);
    localStorage.removeItem(CUSTOMERS_KEY);
    localStorage.removeItem(VARIETIES_KEY);
    localStorage.removeItem(ORDERS_KEY);
    console.log("[storage.resetAllData] cleared all data");
  } catch (err) {
    console.error("[storage.resetAllData] failed", err);
  }
}
