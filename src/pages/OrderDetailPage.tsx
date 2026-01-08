// src/pages/OrderDetailPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

import type { Variety } from "../lib/storage";
import {
  getOrders as getOrdersSB,
  getCustomers as getCustomersSB,
  type Customer,
  type Order,
  type OrderStatus,
} from "../lib/supabaseStorage";

/* -----------------------------
   SAME GROUPING LOGIC AS App.tsx
   (so "View" works consistently)
------------------------------ */
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

      // overall group status (draft > confirmed > packed > delivered)
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

/* -----------------------------
   Fetch varieties (for names)
------------------------------ */
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

/* -----------------------------
   Update status for each line
------------------------------ */
async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

export default function OrderDetailPage() {
  const { groupKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const decodedGroupKey = useMemo(() => {
    try {
      return decodeURIComponent(groupKey ?? "");
    } catch {
      return groupKey ?? "";
    }
  }, [groupKey]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(e?.message ?? "Failed to load order.");
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

  const group = useMemo(() => {
    if (!decodedGroupKey) return null;
    return groups.find((g) => g.key === decodedGroupKey) ?? null;
  }, [groups, decodedGroupKey]);

  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ?? "Unknown customer";

  const varietyName = (id: string) =>
    varieties.find((v) => v.id === id)?.name ?? "Unknown variety";

  const varietyGrowDays = (id: string) =>
    Number(varieties.find((v) => v.id === id)?.daysToHarvest ?? 0);

  const breakdown = useMemo(() => {
    if (!group) return [];
    const map = new Map<string, number>();
    for (const line of group.lines) {
      map.set(line.varietyId, (map.get(line.varietyId) ?? 0) + Number(line.quantity ?? 0));
    }
    return Array.from(map.entries())
      .map(([varietyId, qty]) => ({
        varietyId,
        qty,
        name: varietyName(varietyId),
        growDays: varietyGrowDays(varietyId),
      }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }, [group, varieties]);

  const totalTrays = useMemo(() => {
    if (!group) return 0;
    return group.lines.reduce((sum, x) => sum + Number(x.quantity ?? 0), 0);
  }, [group]);

  async function setGroupStatus(status: OrderStatus) {
    if (!group) return;
    setBusy(true);
    try {
      await Promise.all(group.lines.map((l) => updateOrderStatusRow(l.id, status)));

      // refresh local state so buttons/status update immediately
      setOrders((prev) => prev.map((o) => {
        const sameLine = group.lines.some((l) => l.id === o.id);
        return sameLine ? { ...o, status } : o;
      }));
    } catch (e: any) {
      alert(e?.message ?? "Failed to update order status.");
    } finally {
      setBusy(false);
    }
  }

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
        <p className="page-text" style={{ color: "#b91c1c" }}>{error}</p>
        <button className="btn-secondary" onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          Order not found.
        </p>
        <button className="btn-secondary" onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  const orderNum = displayOrderNumber(group.key);

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>

      <div className="page-text" style={{ marginTop: 6 }}>
        <strong>{customerName(group.customerId)}</strong>
        {" • "}
        Delivery {formatDisplayDate(group.deliveryDate)}
        {" • "}
        Total trays: <strong>{totalTrays}</strong>
        {" • "}
        Status: <strong style={{ textTransform: "capitalize" }}>{group.status}</strong>
        {" • "}
        <span style={{ opacity: 0.7 }}>{orderNum}</span>
      </div>

      {/* Actions (NO edit/delete) */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {group.status !== "packed" && group.status !== "delivered" && (
          <button
            className="btn-secondary"
            onClick={() => setGroupStatus("packed")}
            disabled={busy}
          >
            Mark Packed
          </button>
        )}

        {group.status !== "delivered" && (
          <button
            className="btn-primary"
            onClick={() => setGroupStatus("delivered")}
            disabled={busy}
          >
            Mark Delivered
          </button>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a", marginBottom: 10 }}>
          Variety breakdown
        </div>

        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {breakdown.map((b, idx) => (
            <div
              key={b.varietyId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "16px 16px",
                borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>
                {b.qty} × {b.name}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>
                {b.growDays ? `${b.growDays}d` : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <button className="btn-primary" onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    </div>
  );
}
