// src/pages/OrdersPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

type OrderStatus = "draft" | "confirmed" | "packed" | "delivered";

type OrderRow = {
  id: string;
  account_id?: string | null;
  customer_id?: string | null;
  customerId?: string | null;
  variety_id?: string | null;
  varietyId?: string | null;
  delivery_date?: string | null;
  deliveryDate?: string | null;
  quantity?: number | string | null;
  status?: OrderStatus | string | null;
  created_at?: string | null;
};

type CustomerRow = {
  id: string;
  name?: string | null;
  business_name?: string | null;
};

type VarietyRow = {
  id: string;
  variety?: string | null;
  harvest_days?: number | string | null;
};

type OrderGroup = {
  key: string;
  customerId: string;
  deliveryDate: string;
  status: OrderStatus;
  createdAtMs: number;
  lines: OrderRow[];
};

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

function parseCreatedAtToMs(created_at?: string | null): number {
  if (!created_at) return 0;
  const ms = Date.parse(created_at);
  return Number.isFinite(ms) ? ms : 0;
}

function getCustomerId(o: OrderRow): string {
  return String(o.customer_id ?? o.customerId ?? "");
}

function getVarietyId(o: OrderRow): string {
  return String(o.variety_id ?? o.varietyId ?? "");
}

function getDeliveryDate(o: OrderRow): string {
  return String(o.delivery_date ?? o.deliveryDate ?? "");
}

function getQuantity(o: OrderRow): number {
  return Number(o.quantity ?? 0);
}

function normalizeStatus(status?: string | null): OrderStatus {
  if (status === "confirmed" || status === "packed" || status === "delivered") return status;
  return "draft";
}

const GROUP_BUCKET_MINUTES = 5;

function groupKeyForLine(o: OrderRow): string {
  const ms = parseCreatedAtToMs(o.created_at);
  const bucket = ms ? Math.floor(ms / (GROUP_BUCKET_MINUTES * 60 * 1000)) : 0;
  return `${getCustomerId(o)}__${getDeliveryDate(o)}__${bucket}`;
}

function stableShortHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().slice(0, 6).padStart(6, "0");
}

function displayOrderNumber(groupKey: string): string {
  return `TF-${stableShortHash(groupKey)}`;
}

function buildOrderGroups(orders: OrderRow[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();

  for (const o of orders) {
    const key = groupKeyForLine(o);
    const ms = parseCreatedAtToMs(o.created_at);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        customerId: getCustomerId(o),
        deliveryDate: getDeliveryDate(o),
        status: normalizeStatus(o.status),
        createdAtMs: ms,
        lines: [o],
      });
    } else {
      existing.lines.push(o);
      existing.createdAtMs = Math.min(existing.createdAtMs || ms, ms || existing.createdAtMs);

      const statuses = new Set(existing.lines.map((x) => normalizeStatus(x.status)));
      existing.status = statuses.has("draft")
        ? "draft"
        : statuses.has("confirmed")
        ? "confirmed"
        : statuses.has("packed")
        ? "packed"
        : "delivered";
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateSort = b.deliveryDate.localeCompare(a.deliveryDate);
    if (dateSort !== 0) return dateSort;
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });
}

function DoNowPill({
  label,
  count,
  unit,
  isActive,
  variant = "default",
  onClick,
}: {
  label: string;
  count: number;
  unit: string;
  isActive: boolean;
  variant?: "default" | "error";
  onClick: () => void;
}) {
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
        borderRadius: 12,
        cursor: "pointer",
        minWidth: 140,
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: 14, color: textColor, opacity: 0.9, marginBottom: 4 }}>
        {label}
      </span>
      <span style={{ fontSize: 24, fontWeight: 900, color: textColor, lineHeight: 1.2 }}>
        {count}
      </span>
      <span style={{ fontSize: 12, color: textColor, opacity: 0.8 }}>{unit}</span>
    </button>
  );
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [doNowFilter, setDoNowFilter] = useState<
    "none" | "sow" | "harvest" | "deliver" | "overdue"
  >("none");

  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const groups = useMemo(() => buildOrderGroups(orders), [orders]);

  async function getCurrentAccountId() {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) throw userErr;
    if (!user) throw new Error("No signed-in user found.");

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", user.id)
      .single();

    if (profileErr) throw profileErr;
    if (!profile?.account_id) throw new Error("No account is linked to this user.");

    return profile.account_id as string;
  }

  async function reload() {
    const accountId = await getCurrentAccountId();

    const { data: orderRows, error: ordersErr } = await supabase
      .from("orders")
      .select("*")
      .eq("account_id", accountId)
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (ordersErr) throw ordersErr;

    const safeOrders = (orderRows ?? []) as OrderRow[];

    const customerIds = Array.from(new Set(safeOrders.map(getCustomerId).filter(Boolean)));
    const varietyIds = Array.from(new Set(safeOrders.map(getVarietyId).filter(Boolean)));

    const customersRes =
      customerIds.length > 0
        ? await supabase.from("customers").select("*").in("id", customerIds)
        : { data: [], error: null };

    if (customersRes.error) throw customersRes.error;

    const varietiesRes =
      varietyIds.length > 0
        ? await supabase
            .from("varieties")
            .select("id, variety, harvest_days")
            .eq("account_id", accountId)
            .in("id", varietyIds)
        : await supabase
            .from("varieties")
            .select("id, variety, harvest_days")
            .eq("account_id", accountId)
            .is("disabled_at", null);

    if (varietiesRes.error) throw varietiesRes.error;

    setOrders(safeOrders);
    setCustomers((customersRes.data ?? []) as CustomerRow[]);
    setVarieties((varietiesRes.data ?? []) as VarietyRow[]);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await reload();
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

  function customerName(id: string) {
    const c = customers.find((x) => x.id === id);
    return c?.business_name || c?.name || "Unknown customer";
  }

  function varietyName(id: string) {
    return varieties.find((v) => v.id === id)?.variety ?? "Unknown variety";
  }

  function varietyGrowDays(id: string) {
    return Number(varieties.find((v) => v.id === id)?.harvest_days ?? 0);
  }

  async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) throw error;
  }

  async function updateGroupStatus(g: OrderGroup, status: OrderStatus) {
    setOrders((prev) =>
      prev.map((o) => (groupKeyForLine(o) === g.key ? { ...o, status } : o))
    );

    await Promise.all(g.lines.map((line) => updateOrderStatusRow(line.id, status)));
    await reload();
  }

  async function deleteOrderGroup(lines: OrderRow[]) {
    const ids = lines.map((l) => l.id).filter(Boolean);
    if (!ids.length) return;

    try {
      await supabase.from("tasks").delete().in("order_id", ids as any);
    } catch {
      // tasks table may not match this relation yet
    }

    const { error } = await supabase.from("orders").delete().in("id", ids as any);
    if (error) throw error;
  }

  const { sowTodayTrays, harvestTodayTrays, deliverTodayCount, overdueCount, filteredGroups } =
    useMemo(() => {
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
          const trays = group.lines.reduce((sum, line) => sum + getQuantity(line), 0);
          harvestToday += trays;
          if (doNowFilter === "harvest") matchesFilter = true;
        }

        let sowTrays = 0;
        if (deliveryDate && !isDelivered) {
          for (const line of group.lines) {
            const daysToHarvest = varietyGrowDays(getVarietyId(line));
            if (daysToHarvest > 0) {
              const sowDate = subtractDaysYMD(deliveryDate, daysToHarvest);
              if (sowDate === todayYMD) sowTrays += getQuantity(line);
            }
          }
        }

        if (sowTrays > 0) {
          sowToday += sowTrays;
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

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Orders</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Orders</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Orders</h1>

      <div style={doNowBox}>
        <div style={doNowHeader}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>Today’s Do Now</h3>

          {doNowFilter !== "none" && (
            <button onClick={() => setDoNowFilter("none")} style={clearBtn}>
              Clear filter
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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

      {filteredGroups.length === 0 ? (
        <p className="page-text">
          {doNowFilter === "none"
            ? "No orders yet. Create your first order when you’re ready."
            : "Nothing matches this Do Now filter today."}
        </p>
      ) : (
        <div style={{ marginTop: "0.5rem" }}>
          {filteredGroups.map((g) => {
            const totalTrays = g.lines.reduce((sum, x) => sum + getQuantity(x), 0);

            const breakdown = new Map<string, number>();
            for (const line of g.lines) {
              const varietyId = getVarietyId(line);
              breakdown.set(varietyId, (breakdown.get(varietyId) ?? 0) + getQuantity(line));
            }

            const breakdownList = Array.from(breakdown.entries())
              .map(([varietyId, qty]) => ({ varietyId, qty, name: varietyName(varietyId) }))
              .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

            let earliestSow: string | null = null;
            for (const line of g.lines) {
              const days = varietyGrowDays(getVarietyId(line));
              if (days > 0 && g.deliveryDate) {
                const sow = subtractDaysYMD(g.deliveryDate, days);
                if (!earliestSow || sow < earliestSow) earliestSow = sow;
              }
            }

            const num = displayOrderNumber(g.key);

            return (
              <div key={g.key} style={orderCard}>
                <div style={cardTop}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>
                      {customerName(g.customerId)}
                    </div>

                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      <strong>{num}</strong> • Delivery {formatDisplayDate(g.deliveryDate)}
                    </div>

                    <div style={actionRow}>
                      <button
                        style={smallBtn}
                        onClick={() => navigate(`/orders/${encodeURIComponent(g.key)}`)}
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
                      >
                        Delete
                      </button>

                      {g.status !== "packed" && g.status !== "delivered" && (
                        <button style={smallBtn} onClick={() => updateGroupStatus(g, "packed")}>
                          Mark Packed
                        </button>
                      )}

                      {g.status !== "delivered" && (
                        <button
                          style={smallBtnPrimary}
                          onClick={() => updateGroupStatus(g, "delivered")}
                        >
                          Mark Delivered
                        </button>
                      )}
                    </div>
                  </div>

                  <span style={statusPill}>{g.status}</span>
                </div>

                <div style={pillRow}>
                  <span style={greenPill}>Total trays: {totalTrays}</span>
                  {earliestSow ? (
                    <span style={bluePill}>Earliest sow: {formatDisplayDate(earliestSow)}</span>
                  ) : (
                    <span style={orangePill}>Set harvest days for sow suggestions</span>
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 13, color: "#0f172a" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Variety breakdown</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {breakdownList.map((b) => {
                      const days = varietyGrowDays(b.varietyId);
                      const sow = days > 0 && g.deliveryDate ? subtractDaysYMD(g.deliveryDate, days) : null;

                      return (
                        <div key={b.varietyId} style={breakdownRow}>
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
      )}
    </div>
  );
}

const primaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
};

const doNowBox: CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: 14,
  padding: 16,
  marginBottom: 16,
  border: "1px solid #e2e8f0",
};

const doNowHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  gap: 12,
};

const clearBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "#3b82f6",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  padding: "4px 8px",
};

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

const orderCard: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "0.9rem 1rem",
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  marginBottom: "0.65rem",
  background: "#fff",
};

const cardTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const actionRow: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const statusPill: CSSProperties = {
  fontSize: 12,
  padding: "3px 10px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#0f172a",
  textTransform: "capitalize",
  whiteSpace: "nowrap",
  height: "fit-content",
};

const pillRow: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const greenPill: CSSProperties = {
  fontSize: 12,
  padding: "2px 10px",
  borderRadius: 999,
  background: "#ecfdf5",
  color: "#065f46",
  fontWeight: 900,
};

const bluePill: CSSProperties = {
  fontSize: 12,
  padding: "2px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1e3a8a",
  fontWeight: 900,
};

const orangePill: CSSProperties = {
  fontSize: 12,
  padding: "2px 10px",
  borderRadius: 999,
  background: "#fff7ed",
  color: "#9a3412",
  fontWeight: 900,
};

const breakdownRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid #f1f5f9",
  paddingBottom: 4,
};