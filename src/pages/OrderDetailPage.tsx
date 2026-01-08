// src/pages/OrderDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";
import {
  getOrders as getOrdersSB,
  getCustomers as getCustomersSB,
  type Customer,
  type Order,
  type OrderStatus,
} from "../lib/supabaseStorage";

type Variety = { id: string; name: string; daysToHarvest: number };

const GROUP_BUCKET_MINUTES = 5;

function parseCreatedAtToMs(created_at?: string | null): number {
  if (!created_at) return 0;
  const ms = Date.parse(created_at);
  return Number.isFinite(ms) ? ms : 0;
}

function groupKeyForLine(o: Order): string {
  const ms = parseCreatedAtToMs((o as any).created_at);
  const bucket = ms ? Math.floor(ms / (GROUP_BUCKET_MINUTES * 60 * 1000)) : 0;
  return `${o.customerId}__${o.deliveryDate}__${bucket}`;
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
        status: (String(o.status ?? "").toLowerCase() as OrderStatus) || "confirmed",
        createdAtMs: ms,
        lines: [o],
      });
    } else {
      existing.lines.push(o);
      existing.createdAtMs = Math.min(existing.createdAtMs || ms, ms || existing.createdAtMs);

      // pick a “worst-case” status across lines
      const statuses = new Set(existing.lines.map((x) => String(x.status ?? "").toLowerCase()));
      existing.status = (statuses.has("draft")
        ? "draft"
        : statuses.has("confirmed")
        ? "confirmed"
        : statuses.has("packed")
        ? "packed"
        : "delivered") as OrderStatus;
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

  return groups;
}

async function fetchVarieties(): Promise<Variety[]> {
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

export default function OrderDetailPage() {
  const { groupKey } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [os, cs, vs] = await Promise.all([getOrdersSB(), getCustomersSB(), fetchVarieties()]);
        if (!alive) return;

        setOrders(os);
        setCustomers(cs);
        setVarieties(vs);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load order.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  const varietyName = (id: string) => varieties.find((v) => v.id === id)?.name ?? "Unknown variety";

  const resolvedGroup = useMemo(() => {
    if (!groupKey) return null;

    const groups = buildOrderGroups(orders);
    const foundByGroupKey = groups.find((g) => g.key === groupKey);
    if (foundByGroupKey) return foundByGroupKey;

    // Fallback: if someone opened /orders/<orderId> from an old link, try by id:
    const maybeOrder = orders.find((o) => o.id === groupKey);
    if (maybeOrder) {
      const key = groupKeyForLine(maybeOrder);
      const rebuilt = buildOrderGroups(orders).find((g) => g.key === key);
      return rebuilt ?? null;
    }

    return null;
  }, [groupKey, orders]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error}
        </p>
        <button className="topbar-button" onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  if (!resolvedGroup) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          Order not found.
        </p>
        <p className="page-text">
          This usually happens if the link points to an older order format. You can still access your orders from the Orders page.
        </p>
        <button className="topbar-button" onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  const totalTrays = resolvedGroup.lines.reduce((sum, o) => sum + Number(o.quantity ?? 0), 0);
  const status = String(resolvedGroup.status ?? "").toLowerCase();

  // Group by variety
  const breakdown = new Map<string, number>();
  for (const line of resolvedGroup.lines) {
    breakdown.set(line.varietyId, (breakdown.get(line.varietyId) ?? 0) + Number(line.quantity ?? 0));
  }

  const breakdownList = Array.from(breakdown.entries())
    .map(([varietyId, qty]) => ({ varietyId, qty, name: varietyName(varietyId) }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>
      <p className="page-text" style={{ marginTop: 8 }}>
        <strong>{customerName(resolvedGroup.customerId)}</strong> • Delivery {formatDisplayDate(resolvedGroup.deliveryDate)} • Total trays:{" "}
        <strong>{totalTrays}</strong> • Status: <strong style={{ textTransform: "capitalize" }}>{status}</strong>
      </p>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Variety breakdown</div>

        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {breakdownList.map((b) => (
            <div
              key={b.varietyId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {b.qty} × {b.name}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="topbar-button" onClick={() => navigate("/orders")}>
            Back to Orders
          </button>
        </div>
      </div>
    </div>
  );
}
