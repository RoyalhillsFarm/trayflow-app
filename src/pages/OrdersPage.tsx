// src/pages/OrdersPage.tsx
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
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

function subtractDaysYMD(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() - days);
  return toYMD(d);
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

/* ----------------- ORDER GROUPING (MUST MATCH DETAIL PAGE) ----------------- */
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
  return (h >>> 0).toString(36).toUpperCase().slice(0, 6);
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

    const g = map.get(k);
    if (!g) {
      map.set(k, {
        key: k,
        customerId: o.customerId,
        deliveryDate: o.deliveryDate,
        status: o.status,
        createdAtMs: ms,
        lines: [o],
      });
    } else {
      g.lines.push(o);
      g.createdAtMs = Math.min(g.createdAtMs || ms, ms || g.createdAtMs);
      const statuses = new Set(g.lines.map((x) => x.status));
      g.status = statuses.has("draft")
        ? "draft"
        : statuses.has("confirmed")
        ? "confirmed"
        : statuses.has("packed")
        ? "packed"
        : "delivered";
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const d = b.deliveryDate.localeCompare(a.deliveryDate);
    return d !== 0 ? d : (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });
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

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const [os, cs, vs] = await Promise.all([
          getOrdersSB(),
          getCustomersSB(),
          supabase.from("varieties").select("id, variety, harvest_days"),
        ]);

        if (!alive) return;
        setOrders(os);
        setCustomers(cs);
        setVarieties(
          (vs.data ?? []).map((v: any) => ({
            id: v.id,
            name: v.variety,
            daysToHarvest: Number(v.harvest_days ?? 0),
          }))
        );
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

  const groups = useMemo(() => buildOrderGroups(orders), [orders]);

  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ?? "Unknown customer";

  async function setGroupStatus(g: OrderGroup, status: OrderStatus) {
    setOrders((prev) =>
      prev.map((o) =>
        groupKeyForLine(o) === g.key ? { ...o, status } : o
      )
    );

    await Promise.all(
      g.lines.map((l) =>
        supabase.from("orders").update({ status }).eq("id", l.id)
      )
    );
  }

  if (loading) return <p className="page-text">Loading…</p>;
  if (error) return <p className="page-text" style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div className="page">
      <h1 className="page-title">Orders</h1>

      <button style={primaryBtn} onClick={() => navigate("/orders/new")}>
        New Order
      </button>

      <div style={{ marginTop: 12 }}>
        {groups.map((g) => (
          <div
            key={g.key}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 12,
              background: "#fff",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 900 }}>
              {customerName(g.customerId)}
            </div>

            <div style={{ fontSize: 12, color: "#64748b" }}>
              <strong>{displayOrderNumber(g.key)}</strong> • Delivery{" "}
              {formatDisplayDate(g.deliveryDate)} ({ymdToDow(g.deliveryDate)})
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={smallBtn} onClick={() => navigate(`/orders/${encodeURIComponent(g.key)}`)}>
                View
              </button>

              {g.status !== "packed" && g.status !== "delivered" && (
                <button style={smallBtn} onClick={() => setGroupStatus(g, "packed")}>
                  Mark Packed
                </button>
              )}

              {g.status !== "delivered" && (
                <button style={smallBtnPrimary} onClick={() => setGroupStatus(g, "delivered")}>
                  Mark Delivered
                </button>
              )}

              <span style={statusPill}>{g.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------- STYLES ----------------- */
const primaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
};

const smallBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid #e2e8f0",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const smallBtnPrimary: CSSProperties = {
  ...smallBtn,
  background: "#047857",
  border: "none",
  color: "#fff",
};

const statusPill: CSSProperties = {
  marginLeft: "auto",
  fontSize: 12,
  padding: "2px 10px",
  borderRadius: 999,
  background: "#f1f5f9",
  textTransform: "capitalize",
};
