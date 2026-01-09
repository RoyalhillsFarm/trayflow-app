// src/pages/OrderDetailPage.tsx
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

/* ---- must match Orders grouping key exactly ---- */
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

async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);
}

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const { groupKey } = useParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const decodedKey = useMemo(() => {
    try {
      return groupKey ? decodeURIComponent(groupKey) : "";
    } catch {
      return groupKey ?? "";
    }
  }, [groupKey]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [os, cs, vs] = await Promise.all([getOrdersSB(), getCustomersSB(), fetchVarietiesForOrders()]);
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
  }, [decodedKey]);

  const lines = useMemo(() => {
    if (!decodedKey) return [];
    return orders.filter((o) => groupKeyForLine(o) === decodedKey);
  }, [orders, decodedKey]);

  const status: OrderStatus = useMemo(() => {
    if (!lines.length) return "confirmed";
    const statuses = new Set(lines.map((x) => x.status));
    return statuses.has("draft")
      ? "draft"
      : statuses.has("confirmed")
      ? "confirmed"
      : statuses.has("packed")
      ? "packed"
      : "delivered";
  }, [lines]);

  const customerId = lines[0]?.customerId ?? "";
  const deliveryDate = lines[0]?.deliveryDate ?? "";

  const customerName = useMemo(
    () => customers.find((c) => c.id === customerId)?.name ?? "Order",
    [customers, customerId]
  );

  const totalTrays = useMemo(
    () => lines.reduce((sum, x) => sum + Number(x.quantity ?? 0), 0),
    [lines]
  );

  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) {
      map.set(l.varietyId, (map.get(l.varietyId) ?? 0) + Number(l.quantity ?? 0));
    }
    return Array.from(map.entries())
      .map(([varietyId, qty]) => ({
        varietyId,
        qty,
        name: varieties.find((v) => v.id === varietyId)?.name ?? "Unknown variety",
      }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }, [lines, varieties]);

  async function updateWholeOrder(status: OrderStatus) {
    // optimistic update
    setOrders((prev) => prev.map((o) => (groupKeyForLine(o) === decodedKey ? { ...o, status } : o)));
    await Promise.all(lines.map((l) => updateOrderStatusRow(l.id, status)));
  }

  const btn: CSSProperties = {
    padding: "0.55rem 1.1rem",
    borderRadius: 999,
    border: "1px solid #cbd5f5",
    background: "#fff",
    color: "#0f172a",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 900,
  };

  const btnPrimary: CSSProperties = {
    ...btn,
    border: "none",
    background: "#047857",
    color: "white",
  };

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
        <button style={{ ...btn, marginTop: 12 }} onClick={() => navigate("/orders")}>Back to Orders</button>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>Order not found.</p>
        <button style={{ ...btn, marginTop: 12 }} onClick={() => navigate("/orders")}>Back to Orders</button>
      </div>
    );
  }

  const orderNum = displayOrderNumber(decodedKey);

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>

      <div style={{ marginTop: 8, color: "#475569", fontSize: 18 }}>
        <strong>{customerName}</strong> • Delivery {formatDisplayDate(deliveryDate)} • Total trays:{" "}
        <strong>{totalTrays}</strong> • Status: <strong style={{ textTransform: "capitalize" }}>{status}</strong>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>{orderNum}</div>
      </div>

      {/* ✅ Only status actions (no edit/delete) */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        {status !== "packed" && status !== "delivered" && (
          <button style={btn} onClick={() => updateWholeOrder("packed")}>Mark Packed</button>
        )}
        {status !== "delivered" && (
          <button style={btnPrimary} onClick={() => updateWholeOrder("delivered")}>Mark Delivered</button>
        )}
        <button style={btn} onClick={() => navigate("/orders")}>Back to Orders</button>
      </div>

      <div style={{ marginTop: 18, fontWeight: 900, fontSize: 18, color: "#0f172a" }}>Variety breakdown</div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        {breakdown.map((b, idx) => (
          <div
            key={b.varietyId}
            style={{
              padding: 18,
              borderTop: idx === 0 ? "none" : "1px solid #eef2f7",
              fontSize: 22,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            {b.qty} × {b.name}
          </div>
        ))}
      </div>
    </div>
  );
}
