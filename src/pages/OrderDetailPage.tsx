// src/pages/OrderDetailPage.tsx
// VIEW + EDIT + DELETE Order (Vite + React Router)
//
// Supports URL styles:
// 1) /orders/<orderId>
// 2) /orders/<customerId>__<YYYY-MM-DD>__<key>
//    - key is optional; if numeric we try quantity=key, otherwise we ignore it
//
// Long-term: fix your Orders list to link to /orders/<order.id>

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

type OrderStatus = "draft" | "confirmed" | "packed" | "delivered";

type OrderRow = {
  id: string;
  customer_id: string;
  variety_id: string;
  quantity: number;
  delivery_date: string;
  status: OrderStatus;
  created_at?: string;
};

type CustomerRow = { id: string; name: string };
type VarietyRow = { id: string; variety: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function friendlySupabaseError(msg: string) {
  if (!msg) return "Something went wrong.";
  if (msg.includes("Active tray limit reached")) {
    return "You’ve hit your plan’s Active Trays limit. Upgrade to add more trays.";
  }
  if (msg.includes("Variety limit reached")) {
    return "You’ve hit your plan’s Variety limit. Upgrade to add more varieties.";
  }
  return msg;
}

function getRawRef(): string {
  // Route param could be named id/orderId/etc; for Vite apps it depends on App.tsx
  const params = useParams();
  const search = new URLSearchParams(window.location.search);

  return (
    (params as any).id ||
    (params as any).orderId ||
    (params as any).order_id ||
    search.get("id") ||
    search.get("orderId") ||
    search.get("order_id") ||
    ""
  );
}

function parseComposite(raw: string): {
  orderId?: string;
  customerId?: string;
  deliveryDate?: string;
  key?: string;
  keyNumber?: number;
} {
  if (!raw) return {};

  // direct UUID order id
  if (UUID_RE.test(raw)) return { orderId: raw };

  // composite <uuid>__<yyyy-mm-dd>__<key>
  if (raw.includes("__")) {
    const [a, b, c] = raw.split("__");
    const out: any = { key: c };

    if (UUID_RE.test(a)) out.customerId = a;
    if (YMD_RE.test(b)) out.deliveryDate = b;
    if (c && /^\d+$/.test(c)) out.keyNumber = Number(c);

    // If someone accidentally passed an orderId followed by extras, catch that too:
    if (UUID_RE.test(a) && !out.deliveryDate) {
      // still treat a as potential order id if date missing
      out.orderId = a;
    }

    return out;
  }

  // last resort: maybe it's a path segment with slashes
  const last = raw.split("/").pop() ?? "";
  if (UUID_RE.test(last)) return { orderId: last };

  return {};
}

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const rawRef = getRawRef();
  const parsed = useMemo(() => parseComposite(rawRef), [rawRef]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);

  const [form, setForm] = useState<{
    customer_id: string;
    variety_id: string;
    quantity: number;
    delivery_date: string;
    status: OrderStatus;
  } | null>(null);

  const customerName = useMemo(() => {
    if (!form) return "";
    return customers.find((c) => c.id === form.customer_id)?.name ?? "";
  }, [customers, form]);

  const varietyName = useMemo(() => {
    if (!form) return "";
    return varieties.find((v) => v.id === form.variety_id)?.variety ?? "";
  }, [varieties, form]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        if (!rawRef) throw new Error("Missing order reference in URL.");

        // Load dropdown options
        const [{ data: c, error: cErr }, { data: v, error: vErr }] = await Promise.all([
          supabase.from("customers").select("id, name").order("name", { ascending: true }),
          supabase.from("varieties").select("id, variety").order("variety", { ascending: true }),
        ]);
        if (cErr) throw new Error(cErr.message);
        if (vErr) throw new Error(vErr.message);

        if (!mounted) return;
        setCustomers((c ?? []) as CustomerRow[]);
        setVarieties((v ?? []) as VarietyRow[]);

        // 1) Try fetch by real order id
        if (parsed.orderId && UUID_RE.test(parsed.orderId)) {
          const { data: o, error: oErr } = await supabase
            .from("orders")
            .select("id, customer_id, variety_id, quantity, delivery_date, status, created_at")
            .eq("id", parsed.orderId)
            .single();

          if (oErr) throw new Error(oErr.message);
          if (!o) throw new Error("Order not found.");

          if (!mounted) return;
          const orderRow = o as OrderRow;
          setOrder(orderRow);
          setForm({
            customer_id: orderRow.customer_id,
            variety_id: orderRow.variety_id,
            quantity: Number(orderRow.quantity ?? 0),
            delivery_date: orderRow.delivery_date,
            status: (orderRow.status as OrderStatus) ?? "draft",
          });
          return;
        }

        // 2) If composite: lookup by customer_id + delivery_date (+ maybe quantity)
        if (parsed.customerId && parsed.deliveryDate) {
          // base query
          let q = supabase
            .from("orders")
            .select("id, customer_id, variety_id, quantity, delivery_date, status, created_at")
            .eq("customer_id", parsed.customerId)
            .eq("delivery_date", parsed.deliveryDate);

          // If key looks numeric, try matching quantity first (more precise)
          if (typeof parsed.keyNumber === "number" && Number.isFinite(parsed.keyNumber)) {
            q = q.eq("quantity", parsed.keyNumber);
          }

          // Get most recent match
          const { data: rows, error: qErr } = await q
            .order("created_at", { ascending: false })
            .limit(1);

          if (qErr) throw new Error(qErr.message);

          const found = (rows ?? [])[0] as OrderRow | undefined;

          // If quantity-match failed, fallback to "most recent for that date"
          if (!found && typeof parsed.keyNumber === "number") {
            const { data: rows2, error: qErr2 } = await supabase
              .from("orders")
              .select("id, customer_id, variety_id, quantity, delivery_date, status, created_at")
              .eq("customer_id", parsed.customerId)
              .eq("delivery_date", parsed.deliveryDate)
              .order("created_at", { ascending: false })
              .limit(1);

            if (qErr2) throw new Error(qErr2.message);
            const found2 = (rows2 ?? [])[0] as OrderRow | undefined;
            if (!found2) throw new Error("Order not found for that customer + delivery date.");
            if (!mounted) return;

            setOrder(found2);
            setForm({
              customer_id: found2.customer_id,
              variety_id: found2.variety_id,
              quantity: Number(found2.quantity ?? 0),
              delivery_date: found2.delivery_date,
              status: (found2.status as OrderStatus) ?? "draft",
            });
            return;
          }

          if (!found) throw new Error("Order not found for that customer + delivery date.");
          if (!mounted) return;

          setOrder(found);
          setForm({
            customer_id: found.customer_id,
            variety_id: found.variety_id,
            quantity: Number(found.quantity ?? 0),
            delivery_date: found.delivery_date,
            status: (found.status as OrderStatus) ?? "draft",
          });
          return;
        }

        throw new Error("Invalid order reference format.");
      } catch (e: any) {
        if (!mounted) return;
        setError(friendlySupabaseError(e?.message ?? "Failed to load order"));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [rawRef, parsed.orderId, parsed.customerId, parsed.deliveryDate, parsed.keyNumber]);

  async function onSave() {
    if (!order?.id || !form) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!form.customer_id) throw new Error("Choose a customer.");
      if (!form.variety_id) throw new Error("Choose a variety.");
      if (!form.delivery_date) throw new Error("Choose a delivery date.");
      if (!Number.isFinite(form.quantity) || form.quantity <= 0)
        throw new Error("Quantity must be greater than 0.");

      const payload = {
        customer_id: form.customer_id,
        variety_id: form.variety_id,
        quantity: Number(form.quantity),
        delivery_date: form.delivery_date,
        status: form.status,
      };

      const { data, error } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", order.id)
        .select("id, customer_id, variety_id, quantity, delivery_date, status, created_at")
        .single();

      if (error) throw new Error(error.message);

      const updated = data as OrderRow;
      setOrder(updated);
      setForm({
        customer_id: updated.customer_id,
        variety_id: updated.variety_id,
        quantity: Number(updated.quantity ?? 0),
        delivery_date: updated.delivery_date,
        status: (updated.status as OrderStatus) ?? "draft",
      });

      setSuccess("Order updated.");
    } catch (e: any) {
      setError(friendlySupabaseError(e?.message ?? "Failed to update order"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!order?.id) return;

    const ok = window.confirm(
      "Delete this order? This will also remove its linked production (grow) record."
    );
    if (!ok) return;

    try {
      setDeleting(true);
      setError(null);
      setSuccess(null);

      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw new Error(error.message);

      navigate(-1);
    } catch (e: any) {
      setError(friendlySupabaseError(e?.message ?? "Failed to delete order"));
    } finally {
      setDeleting(false);
    }
  }

  function resetToSaved() {
    if (!order) return;
    setForm({
      customer_id: order.customer_id,
      variety_id: order.variety_id,
      quantity: Number(order.quantity ?? 0),
      delivery_date: order.delivery_date,
      status: (order.status as OrderStatus) ?? "draft",
    });
    setSuccess(null);
    setError(null);
  }

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Order</h2>
        <p>Loading…</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div style={{ padding: 16, maxWidth: 780 }}>
        <h2>Order</h2>
        <p>Not found.</p>
        <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 12 }}>
          Debug:
          <div>
            rawRef: <code>{rawRef || "(empty)"}</code>
          </div>
          <div>
            parsed:{" "}
            <code>
              {JSON.stringify(
                {
                  orderId: parsed.orderId,
                  customerId: parsed.customerId,
                  deliveryDate: parsed.deliveryDate,
                  key: parsed.key,
                  keyNumber: parsed.keyNumber,
                },
                null,
                0
              )}
            </code>
          </div>
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Order</h2>
        <span style={{ opacity: 0.6, fontSize: 13 }}>{order?.id}</span>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            border: "1px solid #f2b8b5",
            background: "#fff5f5",
            borderRadius: 8,
          }}
        >
          <strong>Oops:</strong> {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            border: "1px solid #b7eb8f",
            background: "#f6ffed",
            borderRadius: 8,
          }}
        >
          {success}
        </div>
      )}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          display: "grid",
          gap: 12,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Customer</span>
          <select
            value={form.customer_id}
            onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}
            style={{ padding: 10, borderRadius: 8 }}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <small style={{ opacity: 0.7 }}>Selected: {customerName}</small>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Variety</span>
          <select
            value={form.variety_id}
            onChange={(e) => setForm((p) => ({ ...p, variety_id: e.target.value }))}
            style={{ padding: 10, borderRadius: 8 }}
          >
            {varieties.map((v) => (
              <option key={v.id} value={v.id}>
                {v.variety}
              </option>
            ))}
          </select>
          <small style={{ opacity: 0.7 }}>Selected: {varietyName}</small>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Quantity (trays)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={form.quantity}
            onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) }))}
            style={{ padding: 10, borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Delivery date</span>
          <input
            type="date"
            value={form.delivery_date}
            onChange={(e) => setForm((p) => ({ ...p, delivery_date: e.target.value }))}
            style={{ padding: 10, borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Status</span>
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as OrderStatus }))}
            style={{ padding: 10, borderRadius: 8 }}
          >
            <option value="draft">draft</option>
            <option value="confirmed">confirmed</option>
            <option value="packed">packed</option>
            <option value="delivered">delivered</option>
          </select>
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            onClick={resetToSaved}
            disabled={saving || deleting}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: saving || deleting ? "not-allowed" : "pointer",
            }}
          >
            Reset
          </button>

          <button
            onClick={() => navigate(-1)}
            disabled={saving || deleting}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: saving || deleting ? "not-allowed" : "pointer",
            }}
          >
            Back
          </button>

          <button
            onClick={onDelete}
            disabled={saving || deleting}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #f2b8b5",
              background: "#fff5f5",
              fontWeight: 700,
              cursor: saving || deleting ? "not-allowed" : "pointer",
              marginLeft: "auto",
            }}
          >
            {deleting ? "Deleting…" : "Delete order"}
          </button>
        </div>

        <small style={{ opacity: 0.7 }}>
          Your current “View Order” URLs are composite (customerId + date + key). This page resolves them
          by looking up the order. For cleaner URLs, update links to use <code>/orders/&lt;order.id&gt;</code>.
        </small>
      </div>
    </div>
  );
}
