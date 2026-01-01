// src/App.tsx
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
  Navigate,
} from "react-router-dom";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import "./App.css";

import trayflowLogo from "./assets/trayflow-logo.png";
import trayflowIcon from "./assets/trayflow-icon.png";

import { supabase } from "./utils/supabaseClient";
import { formatDisplayDate } from "./utils/formatDate";

import Varieties from "./pages/Varieties";
import CustomersPage from "./pages/CustomersPage";
import TasksPage from "./pages/TasksPage";
import NewTaskPage from "./pages/NewTaskPage";
import LoginPage from "./pages/LoginPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import ProductionSheetPage from "./pages/ProductionSheetPage";

import type { Variety } from "./lib/storage";
import {
  getCustomers as getCustomersSB,
  getOrders as getOrdersSB,
  addOrder as addOrderSB,
  type Customer,
  type Order,
  type OrderStatus,
} from "./lib/supabaseStorage";

/* ----------------- DATE HELPERS ----------------- */
function toYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

function subtractDaysYMD(ymd: string, days: number): string {
  return addDaysYMD(ymd, -days);
}

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type DOW = (typeof DOWS)[number];
function ymdToDow(ymd: string): DOW {
  const d = new Date(ymd + "T00:00:00");
  return DOWS[d.getDay()];
}

function parseCreatedAtToMs(created_at?: string | null): number {
  if (!created_at) return 0;
  const ms = Date.parse(created_at);
  return Number.isFinite(ms) ? ms : 0;
}

/* ----------------- ORDER GROUPING (NO DB CHANGES) ----------------- */
const GROUP_BUCKET_MINUTES = 5;

function groupKeyForLine(o: Order): string {
  const ms = parseCreatedAtToMs((o as any).created_at);
  const bucket = ms ? Math.floor(ms / (GROUP_BUCKET_MINUTES * 60 * 1000)) : 0;
  return `${o.customerId}__${o.deliveryDate}__${bucket}`;
}

function stableShortHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = (h >>> 0).toString(36).toUpperCase();
  return x.slice(0, 6).padStart(6, "0");
}

function displayOrderNumber(groupKey: string): string {
  return `TF-${stableShortHash(groupKey)}`;
}

type OrderGroup = {
  key: string;
  customerId: string;
  deliveryDate: string;
  status: OrderStatus;
  createdAtMs: number;
  lines: Order[];
};

function buildOrderGroups(orders: Order[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();

  for (const o of orders) {
    const k = groupKeyForLine(o);
    const ms = parseCreatedAtToMs((o as any).created_at);

    const existing = map.get(k);
    if (!existing) {
      map.set(k, {
        key: k,
        customerId: o.customerId,
        deliveryDate: o.deliveryDate,
        status: o.status,
        createdAtMs: ms,
        lines: [o],
      });
    } else {
      existing.lines.push(o);
      existing.createdAtMs = Math.min(existing.createdAtMs || ms, ms || existing.createdAtMs);

      const statuses = new Set(existing.lines.map((x) => x.status));
      existing.status = statuses.has("draft")
        ? "draft"
        : statuses.has("confirmed")
        ? "confirmed"
        : statuses.has("packed")
        ? "packed"
        : "delivered";
    }
  }

  const groups = Array.from(map.values());

  for (const g of groups) {
    g.lines.sort((a, b) => {
      const am = parseCreatedAtToMs((a as any).created_at);
      const bm = parseCreatedAtToMs((b as any).created_at);
      if (am !== bm) return am - bm;
      return a.id.localeCompare(b.id);
    });
  }

  groups.sort((a, b) => {
    const d = b.deliveryDate.localeCompare(a.deliveryDate);
    if (d !== 0) return d;
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });

  return groups;
}

/* ----- Helpers: fetch Varieties from Supabase for Orders dropdown ----- */
async function fetchVarietiesForOrders(): Promise<Variety[]> {
  const { data, error } = await supabase
    .from("varieties")
    .select("id, variety, harvest_days")
    .order("variety", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.variety ?? "",
    daysToHarvest: Number(r.harvest_days ?? 0),
  }));
}

/* ----------------- AUTH GUARD ----------------- */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setAuthed(Boolean(data.session));
      setChecking(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ opacity: 0.7, fontWeight: 700 }}>Loading…</div>
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/* ----------------- LAYOUT ----------------- */
function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo-block">
        <img src={trayflowLogo} alt="TrayFlow Logo" className="sidebar-logo-image" />
        <div className="sidebar-logo-text">
          <div className="sidebar-subtitle">MICROGREENS PRODUCTION PLANNER</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <SidebarLink to="/" label="Dashboard" />
        <SidebarLink to="/orders" label="Orders" />
        <SidebarLink to="/tasks" label="Tasks" />
        <SidebarLink to="/calendar" label="Calendar" />
        <SidebarLink to="/varieties" label="Varieties" />
        <SidebarLink to="/customers" label="Customers" />
        <SidebarLink to="/production-sheet" label="Production Sheet" />
        <SidebarLink to="/settings" label="Settings" />
      </nav>

      <div className="sidebar-footer">
        <div>TrayFlow v1.0.0</div>
        <div>© {new Date().getFullYear()} TrayFlow</div>
      </div>
    </aside>
  );
}

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        ["sidebar-link", isActive ? "sidebar-link-active" : "sidebar-link-inactive"].join(" ")
      }
    >
      <span>{label}</span>
    </NavLink>
  );
}

function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const showNewTaskButton = location.pathname === "/tasks";

  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-center">
        <img src={trayflowIcon} alt="TrayFlow Icon" className="topbar-logo-image" />
        <span className="topbar-title">TRAYFLOW</span>
      </div>

      <div className="topbar-right">
        {showNewTaskButton && (
          <button className="topbar-button" onClick={() => navigate("/tasks/new")}>
            New Task
          </button>
        )}

        {email ? (
          <>
            <span style={{ fontSize: 12, opacity: 0.6, marginRight: 8 }}>{email}</span>
            <button
              className="topbar-button"
              onClick={async () => {
                await supabase.auth.signOut();
                // after sign out, go to login (don’t show dashboard)
                navigate("/login", { replace: true });
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <button className="topbar-button" onClick={() => navigate("/login")}>
            Login
          </button>
        )}
      </div>
    </header>
  );
}

type DoNowPillProps = {
  label: string;
  count: number;
  unit: string;
  isActive: boolean;
  variant?: "default" | "error";
  onClick: () => void;
};

function DoNowPill({ label, count, unit, isActive, variant = "default", onClick }: DoNowPillProps) {
  const backgroundColor = isActive
    ? variant === "error"
      ? "#fee2e2"
      : "#e0f2fe"
    : variant === "error" && count > 0
    ? "#ffebee"
    : "#f1f5f9";

  const textColor = isActive
    ? variant === "error"
      ? "#b91c1c"
      : "#0369a1"
    : variant === "error" && count > 0
    ? "#dc2626"
    : "#0f172a";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "12px 16px",
        backgroundColor,
        border: "none",
        borderRadius: "12px",
        cursor: "pointer",
        minWidth: "140px",
        textAlign: "left",
        boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
        transform: isActive ? "translateY(-2px)" : "none",
      }}
    >
      <span style={{ fontSize: "14px", color: textColor, opacity: 0.9, marginBottom: "4px" }}>
        {label}
      </span>
      <span style={{ fontSize: "24px", fontWeight: 700, color: textColor, lineHeight: 1.2 }}>
        {count}
      </span>
      <span style={{ fontSize: "12px", color: textColor, opacity: 0.8 }}>{unit}</span>
    </button>
  );
}

/* ----------------- ORDERS PAGE ----------------- */
async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [doNowFilter, setDoNowFilter] = useState<"none" | "sow" | "harvest" | "deliver" | "overdue">(
    "none"
  );

  const todayYMD = toYMD(new Date());
  const groups = useMemo(() => buildOrderGroups(orders), [orders]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [os, cs, vs] = await Promise.all([
          getOrdersSB(),
          getCustomersSB(),
          fetchVarietiesForOrders(),
        ]);

        if (!alive) return;
        setOrders(os);
        setCustomers(cs);
        setVarieties(vs);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load orders.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.key]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  const varietyName = (id: string) => varieties.find((v) => v.id === id)?.name ?? "Unknown variety";
  const varietyGrowDays = (id: string) => Number(varieties.find((v) => v.id === id)?.daysToHarvest ?? 0);

  async function updateGroupStatus(g: OrderGroup, status: OrderStatus) {
    setOrders((prev) =>
      prev.map((o) =>
        o.customerId === g.customerId && o.deliveryDate === g.deliveryDate ? { ...o, status } : o
      )
    );

    await Promise.all(g.lines.map((line) => updateOrderStatusRow(line.id, status)));
  }

  const smallBtn: CSSProperties = {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  const smallBtnPrimary: CSSProperties = {
    ...smallBtn,
    border: "none",
    background: "#047857",
    color: "white",
  };

  const { sowTodayTrays, harvestTodayTrays, deliverTodayCount, overdueCount, filteredGroups } = useMemo(() => {
    let sowToday = 0;
    let harvestToday = 0;
    let deliverToday = 0;
    let overdue = 0;

    const filtered: OrderGroup[] = [];

    for (const group of groups) {
      const deliveryDate = group.deliveryDate;
      const harvestDate = deliveryDate ? subtractDaysYMD(deliveryDate, 1) : null;

      const isDelivered = group.status === "delivered";
      let matchesFilter = false;

      if (deliveryDate && deliveryDate < todayYMD && !isDelivered) {
        overdue += 1;
        if (doNowFilter === "overdue") matchesFilter = true;
      }

      if (deliveryDate === todayYMD && !isDelivered) {
        deliverToday += 1;
        if (doNowFilter === "deliver") matchesFilter = true;
      }

      if (harvestDate === todayYMD && !isDelivered) {
        const groupTrays = group.lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
        harvestToday += groupTrays;
        if (doNowFilter === "harvest") matchesFilter = true;
      }

      let groupSowTrays = 0;
      if (deliveryDate && !isDelivered) {
        for (const line of group.lines) {
          const daysToHarvest = varietyGrowDays(line.varietyId);
          if (daysToHarvest > 0) {
            const sowDate = subtractDaysYMD(deliveryDate, daysToHarvest);
            if (sowDate === todayYMD) groupSowTrays += Number(line.quantity ?? 0);
          }
        }
      }

      if (groupSowTrays > 0) {
        sowToday += groupSowTrays;
        if (doNowFilter === "sow") matchesFilter = true;
      }

      if (doNowFilter === "none" || matchesFilter) filtered.push(group);
    }

    return {
      sowTodayTrays: sowToday,
      harvestTodayTrays: harvestToday,
      deliverTodayCount: deliverToday,
      overdueCount: overdue,
      filteredGroups: filtered,
    };
  }, [groups, varieties, doNowFilter, todayYMD]);

  return (
    <div className="page">
      <h1 className="page-title">Orders</h1>

      {/* ... your Orders page remains unchanged below ... */}
      {/* (kept as-is from your version) */}

      <div
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: "14px",
          padding: "16px",
          marginBottom: "16px",
          border: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>Today’s Do Now</h3>

          {doNowFilter !== "none" && (
            <button
              onClick={() => setDoNowFilter("none")}
              style={{
                background: "none",
                border: "none",
                color: "#3b82f6",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                padding: "4px 8px",
              }}
            >
              Clear filter
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <DoNowPill
            label="Sow today"
            count={sowTodayTrays}
            unit="trays"
            isActive={doNowFilter === "sow"}
            onClick={() => setDoNowFilter(doNowFilter === "sow" ? "none" : "sow")}
          />
          <DoNowPill
            label="Harvest today"
            count={harvestTodayTrays}
            unit="trays"
            isActive={doNowFilter === "harvest"}
            onClick={() => setDoNowFilter(doNowFilter === "harvest" ? "none" : "harvest")}
          />
          <DoNowPill
            label="Deliver today"
            count={deliverTodayCount}
            unit="orders"
            isActive={doNowFilter === "deliver"}
            onClick={() => setDoNowFilter(doNowFilter === "deliver" ? "none" : "deliver")}
          />
          <DoNowPill
            label="Overdue"
            count={overdueCount}
            unit="orders"
            isActive={doNowFilter === "overdue"}
            variant={overdueCount > 0 ? "error" : "default"}
            onClick={() => setDoNowFilter(doNowFilter === "overdue" ? "none" : "overdue")}
          />
        </div>
      </div>

      <div style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
        <button onClick={() => navigate("/orders/new")} style={primaryBtn}>
          New Order
        </button>
      </div>

      {loading && <p className="page-text">Loading…</p>}
      {error && (
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {!loading && !error && filteredGroups.length === 0 ? (
        <p className="page-text">
          {doNowFilter === "none"
            ? "No orders yet. Create a customer and variety, then add your first order."
            : "Nothing matches this Do Now filter today."}
        </p>
      ) : null}

      {!loading && !error && filteredGroups.length > 0 ? (
        <div style={{ marginTop: "0.5rem" }}>
          {filteredGroups.map((g) => {
            const totalTrays = g.lines.reduce((sum, x) => sum + Number(x.quantity ?? 0), 0);

            const breakdown = new Map<string, number>();
            for (const line of g.lines) {
              breakdown.set(
                line.varietyId,
                (breakdown.get(line.varietyId) ?? 0) + Number(line.quantity ?? 0)
              );
            }

            const breakdownList = Array.from(breakdown.entries())
              .map(([varietyId, qty]) => ({ varietyId, qty, name: varietyName(varietyId) }))
              .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

            let earliestSow: string | null = null;
            for (const line of g.lines) {
              const days = varietyGrowDays(line.varietyId);
              if (days > 0 && g.deliveryDate) {
                const sow = subtractDaysYMD(g.deliveryDate, days);
                if (!earliestSow || sow < earliestSow) earliestSow = sow;
              }
            }

            const num = displayOrderNumber(g.key);

            return (
              <div
                key={g.key}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.9rem 1rem",
                  borderRadius: "14px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "0.65rem",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>
                      {customerName(g.customerId)}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      <strong>{num}</strong> • Delivery {formatDisplayDate(g.deliveryDate)} (
                      {ymdToDow(g.deliveryDate)})
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={smallBtn} onClick={() => navigate(`/orders/${encodeURIComponent(g.key)}`)}>
                        View
                      </button>

                      {g.status !== "packed" && g.status !== "delivered" && (
                        <button style={smallBtn} onClick={() => updateGroupStatus(g, "packed")}>
                          Mark Packed
                        </button>
                      )}

                      {g.status !== "delivered" && (
                        <button style={smallBtnPrimary} onClick={() => updateGroupStatus(g, "delivered")}>
                          Mark Delivered
                        </button>
                      )}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: "#f1f5f9",
                      color: "#0f172a",
                      textTransform: "capitalize",
                      whiteSpace: "nowrap",
                      height: "fit-content",
                    }}
                  >
                    {g.status}
                  </span>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: "#ecfdf5",
                      color: "#065f46",
                      fontWeight: 900,
                    }}
                  >
                    Total trays: {totalTrays}
                  </span>

                  {earliestSow ? (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 10px",
                        borderRadius: 999,
                        background: "#eff6ff",
                        color: "#1e3a8a",
                        fontWeight: 900,
                      }}
                    >
                      Earliest sow: {formatDisplayDate(earliestSow)}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 10px",
                        borderRadius: 999,
                        background: "#fff7ed",
                        color: "#9a3412",
                        fontWeight: 900,
                      }}
                    >
                      Set harvest days for sow suggestions
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 13, color: "#0f172a" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Variety breakdown</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {breakdownList.map((b) => {
                      const days = varietyGrowDays(b.varietyId);
                      const sow = days > 0 && g.deliveryDate ? subtractDaysYMD(g.deliveryDate, days) : null;

                      return (
                        <div
                          key={b.varietyId}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            borderBottom: "1px solid #f1f5f9",
                            paddingBottom: 4,
                          }}
                        >
                          <div style={{ fontWeight: 800 }}>
                            {b.qty} × {b.name}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                            {sow ? `Sow ${formatDisplayDate(sow)} (${days}d)` : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------- NEW ORDER PAGE ----------------- */
type OrderLineDraft = {
  id: string;
  varietyId: string;
  quantity: number;
  seedGramsPerTray?: number;
  packSize?: string;
  notes?: string;
};

function NewOrderPage() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<OrderStatus>("confirmed");

  const [planMode, setPlanMode] = useState<"delivery" | "sow">("delivery");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [sowDate, setSowDate] = useState("");

  const [lines, setLines] = useState<OrderLineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeCustomers = useMemo(() => customers.filter((c) => c.active !== false), [customers]);

  const makeId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `ln_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const addLine = (seedFromFirst = true) => {
    const firstVar = varieties[0]?.id ?? "";
    setLines((prev) => {
      const seed = seedFromFirst ? prev[0]?.seedGramsPerTray : undefined;
      return [
        ...prev,
        { id: makeId(), varietyId: firstVar, quantity: 1, seedGramsPerTray: seed, packSize: "", notes: "" },
      ];
    });
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const updateLine = (id: string, patch: Partial<OrderLineDraft>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const [cs, vs] = await Promise.all([getCustomersSB(), fetchVarietiesForOrders()]);
        if (!alive) return;

        setCustomers(cs);
        setVarieties(vs);

        const act = cs.filter((c) => c.active !== false);
        if (act[0]) setCustomerId(act[0].id);

        const today = toYMD(new Date());
        setSowDate(today);
        setDeliveryDate(addDaysYMD(today, 2));

        setLines([{ id: makeId(), varietyId: vs[0]?.id ?? "", quantity: 1, seedGramsPerTray: undefined, packSize: "", notes: "" }]);
      } catch (e: any) {
        alert(e?.message ?? "Failed to load customers/varieties.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const computed = useMemo(() => {
    const result = lines.map((l) => {
      const v = varieties.find((x) => x.id === l.varietyId);
      const growDays = Number(v?.daysToHarvest ?? 0);

      let computedDelivery = deliveryDate;
      let computedSow = sowDate;

      if (planMode === "delivery") {
        computedDelivery = deliveryDate;
        computedSow = deliveryDate && growDays > 0 ? subtractDaysYMD(deliveryDate, growDays) : sowDate;
      } else {
        computedSow = sowDate;
        computedDelivery = sowDate && growDays > 0 ? addDaysYMD(sowDate, growDays) : deliveryDate;
      }

      const gramsPerTray = Number(l.seedGramsPerTray ?? 0);
      const totalGrams = gramsPerTray > 0 ? gramsPerTray * Number(l.quantity ?? 0) : 0;

      return {
        line: l,
        varietyName: v?.name ?? "Unknown variety",
        growDays,
        sow: computedSow || "",
        delivery: computedDelivery || "",
        gramsPerTray: gramsPerTray > 0 ? gramsPerTray : null,
        totalGrams: totalGrams > 0 ? totalGrams : null,
      };
    });

    const orderDelivery = result.find((x) => x.delivery)?.delivery ?? deliveryDate;
    const orderSow = result.find((x) => x.sow)?.sow ?? sowDate;

    const totalTrays = result.reduce((sum, x) => sum + Number(x.line.quantity ?? 0), 0);
    const totalSeed = result.reduce((sum, x) => sum + Number(x.totalGrams ?? 0), 0);

    return { lines: result, orderDelivery, orderSow, totalTrays, totalSeed };
  }, [lines, varieties, planMode, deliveryDate, sowDate]);

  const statusHelp =
    status === "draft"
      ? "Draft = not confirmed yet."
      : status === "confirmed"
      ? "Confirmed = committed."
      : status === "packed"
      ? "Packed = production done (no new grow tasks; delivery still shows)."
      : "Delivered = completed.";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!customerId) return alert("Please select a customer.");
    if (!lines.length) return alert("Add at least one variety line.");

    for (const l of lines) {
      if (!l.varietyId) return alert("Each line needs a variety selected.");
      if (!l.quantity || l.quantity <= 0) return alert("Each line needs trays > 0.");
    }

    const baseDelivery = computed.orderDelivery;
    const baseSow = computed.orderSow;

    if (planMode === "delivery" && !baseDelivery) return alert("Please select a delivery date.");
    if (planMode === "sow" && !baseSow) return alert("Please select a sow date.");

    setSubmitting(true);
    try {
      for (const c of computed.lines) {
        await addOrderSB({
          customerId,
          varietyId: c.line.varietyId,
          quantity: Number(c.line.quantity),
          deliveryDate: c.delivery,
          status,
        });
      }

      navigate("/orders");
    } catch (e: any) {
      alert(e?.message ?? "Failed to save order.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">New Order</h1>
      {/* Your NewOrderPage UI stays the same below — kept as-is in your file */}
      {/* (omitted here for brevity; keep your existing JSX exactly) */}
      {/* IMPORTANT: do not change anything else in this component */}
      {/* If you want, I can paste the full component too, but it’s unchanged */}
      <p className="page-text">
        Your New Order page code is unchanged — keep your existing JSX here.
      </p>
      <button onClick={() => navigate("/orders")} style={secondaryBtn}>Back</button>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-text">Coming next.</p>
    </div>
  );
}

/* ----------------- APP SHELL ----------------- */
function AppShell() {
  const location = useLocation();

  // On /login we don't want to show the whole app chrome.
  const isLogin = location.pathname === "/login";

  if (isLogin) {
    // If already signed in, bounce home.
    // (This prevents logged-in users from seeing the login screen.)
    return <LoginGate />;
  }

  return (
    <RequireAuth>
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <TopBar />
          <main className="app-main-content">
            <Routes>
              <Route path="/" element={<DashboardPage />} />

              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/new" element={<NewOrderPage />} />
              <Route path="/orders/:groupKey" element={<OrderDetailPage />} />

              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/new" element={<NewTaskPage />} />

              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/varieties" element={<Varieties />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/production-sheet" element={<ProductionSheetPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}

function LoginGate() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setAuthed(Boolean(data.session));
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ opacity: 0.7, fontWeight: 700 }}>Loading…</div>
      </div>
    );
  }

  if (authed) return <Navigate to="/" replace />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Route /login is handled by AppShell/LoginGate above */}
      <AppShell />
    </BrowserRouter>
  );
}

/* ----------------- Shared styles ----------------- */
const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "0.25rem",
  fontSize: 14,
};

const miniLabel: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const controlStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  borderRadius: 8,
  border: "1px solid #cbd5f5",
  fontSize: 14,
  background: "#ffffff",
};

const primaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "1px solid #cbd5f5",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  cursor: "pointer",
};
