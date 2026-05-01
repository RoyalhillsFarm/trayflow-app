// src/pages/OrdersPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

import type { Variety } from "../lib/storage";
import type { Customer, Order, OrderStatus } from "../lib/supabaseStorage";

/* ----------------- HELPERS ----------------- */
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  return created_at ? Date.parse(created_at) || 0 : 0;
}

/* ----------------- GROUPING ----------------- */
const GROUP_BUCKET_MINUTES = 5;

function groupKeyForLine(o: Order): string {
  const ms = parseCreatedAtToMs((o as any).created_at);
  const bucket = ms ? Math.floor(ms / (GROUP_BUCKET_MINUTES * 60 * 1000)) : 0;
  return `${o.customerId}__${o.deliveryDate}__${bucket}`;
}

function buildOrderGroups(orders: Order[]) {
  const map = new Map<string, any>();

  for (const o of orders) {
    const k = groupKeyForLine(o);
    const ms = parseCreatedAtToMs((o as any).created_at);

    if (!map.has(k)) {
      map.set(k, {
        key: k,
        customerId: o.customerId,
        deliveryDate: o.deliveryDate,
        status: o.status,
        createdAtMs: ms,
        lines: [o],
      });
    } else {
      map.get(k).lines.push(o);
    }
  }

  return Array.from(map.values());
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

  const todayYMD = toYMD(new Date());

  async function loadData() {
    // 🔑 1. get user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("No user");

    // 🔑 2. get account_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", user.id)
      .single();

    const accountId = profile?.account_id;
    if (!accountId) throw new Error("No account_id");

    // 🔑 3. fetch ONLY this account’s data
    const [ordersRes, customersRes, varietiesRes] = await Promise.all([
      supabase.from("orders").select("*").eq("account_id", accountId),
      supabase.from("customers").select("*").eq("account_id", accountId),
      supabase.from("varieties").select("*").eq("account_id", accountId),
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (customersRes.error) throw customersRes.error;
    if (varietiesRes.error) throw varietiesRes.error;

    setOrders(ordersRes.data as any);
    setCustomers(customersRes.data as any);
    setVarieties(
      (varietiesRes.data ?? []).map((v: any) => ({
        id: v.id,
        name: v.variety,
        daysToHarvest: v.harvest_days,
      }))
    );
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        await loadData();

        if (!alive) return;
      } catch (e: any) {
        if (!alive) return;
        setError(e.message);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.key]);

  const groups = useMemo(() => buildOrderGroups(orders), [orders]);

  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ?? "Unknown";

  const varietyName = (id: string) =>
    varieties.find((v) => v.id === id)?.name ?? "Unknown";

  if (loading) return <div className="page">Loading…</div>;
  if (error) return <div className="page">{error}</div>;

  return (
    <div className="page">
      <h1 className="page-title">Orders</h1>

      <button onClick={() => navigate("/orders/new")} style={primaryBtn}>
        New Order
      </button>

      {groups.length === 0 ? (
        <p>No orders yet — you’re starting clean 🌱</p>
      ) : (
        groups.map((g) => {
          const total = g.lines.reduce(
            (sum: number, x: any) => sum + Number(x.quantity ?? 0),
            0
          );

          return (
            <div key={g.key} style={card}>
              <strong>{customerName(g.customerId)}</strong>
              <div>Delivery: {formatDisplayDate(g.deliveryDate)}</div>
              <div>Total trays: {total}</div>

              <div style={{ marginTop: 8 }}>
                {g.lines.map((l: any) => (
                  <div key={l.id}>
                    {l.quantity} × {varietyName(l.varietyId)}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ----------------- styles ----------------- */
const primaryBtn: CSSProperties = {
  marginTop: 10,
  padding: "8px 16px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  cursor: "pointer",
};

const card: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
};