// src/pages/OrdersPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

import type { Variety } from "../lib/storage";
import {
  getCustomers as getCustomersSB,
  getOrders as getOrdersSB,
  type Customer,
  type Order,
  type OrderStatus,
} from "../lib/supabaseStorage";

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

/* ----------------- ORDER GROUPING ----------------- */
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

/* ----- fetch Varieties for Orders dropdown/suggestions ----- */
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

/* ----------------- SUPABASE MUTATIONS ----------------- */
async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

async function deleteOrderGroup(lines: Order[]) {
  const ids = lines.map((l) => l.id).filter(Boolean);
  if (!ids.length) return;

  // Delete tasks first (if your tasks table links to orders)
  // If it errors because the column/table differs, we ignore and continue.
  try {
    const { error: tErr } = await supabase.from("tasks").delete().in("order_id", ids as any);
    if (tErr) {
      // ignore
    }
  } catch {
    // ignore
  }

  const { error } = await supabase.from("orders").delete().in("id", ids as any);
  if (error) throw new Error(error.message);
}

/* ----------------- DO NOW PILL ----------------- */
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

/* ----------------- PAGE ----------------- */
export default function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [doNowFilter, setDoNowFilter] = useState<"none" | "sow" | "harvest" | "deliver" | "overdue">("none");

  const todayYMD = toYMD(new Date());
  const groups = useMemo(() => buildOrderGroups(orders), [orders]);

  async function reload() {
    const [os, cs, vs] = await Promise.all([getOrdersSB(), getCustomersSB(), fetchVarietiesForOrders()]);
    setOrders(os);
    setCustomers(cs);
    setVarieties(vs);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await reload();
        if (!alive) return;
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
    // refresh on navigation back
  }, [location.key]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  const varietyName = (id: string) => varieties.find((v) => v.id === id)?.name ?? "Unknown variety";
  const varietyGrowDays = (id: string) => Number(varieties.find((v) => v.id === id)?.daysToHarvest ?? 0);

  async function updateGroupStatus(g: OrderGroup, status: OrderStatus) {
    // Optimistic
    setOrders((prev) =>
      prev.map((o) =>
        groupKeyForLine(o) === g.key ? { ...o, status } : o
      )
    );

    await Promise.all(g.lines.map((line) => updateOrderStatusRow(line.id, status)));
    await reload();
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

  const smallBtnDanger: CSSProperties = {
    ...smallBtn,
    border: "none",
    background: "#b91c1c",
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

      {/* Do Now */}
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
                      <strong>{num}</strong> • Delivery {formatDisplayDate(g.deliveryDate)} ({ymdToDow(g.deliveryDate)})
                    </div>

                    {/* Actions */}
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        style={smallBtn}
                        onClick={() => navigate(`/orders/${encodeURIComponent(g.key)}`)}
                        title="View / Edit this order"
                      >
                        View / Edit
                      </button>

                      <button
                        style={smallBtnDanger}
                        onClick={async () => {
                          const ok = window.confirm(
                            `Delete ${num}?\n\nThis deletes ALL lines in the order.`
                          );
                          if (!ok) return;
                          try {
                            await deleteOrderGroup(g.lines);
                            await reload();
                          } catch (e: any) {
                            alert(e?.message ?? "Failed to delete order.");
                          }
                        }}
                        title="Delete the entire order (all lines)"
                      >
                        Delete
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

/* ----------------- Shared styles ----------------- */
const primaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
};
