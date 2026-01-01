import { useEffect, useMemo, useState } from "react";
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

type FormState = {
  customer_id: string;
  variety_id: string;
  quantity: number;
  delivery_date: string;
  status: OrderStatus;
};

const EMPTY_FORM: FormState = {
  customer_id: "",
  variety_id: "",
  quantity: 1,
  delivery_date: "",
  status: "draft",
};

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const params = useParams();

  // supports /orders/:id or /orders/:orderId
  const rawId = (params as any).id || (params as any).orderId || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);

  const [form, setForm] = useState<FormState | null>(null);

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

        if (!rawId || !UUID_RE.test(rawId)) {
          throw new Error("Invalid order link. (Missing or invalid order id)");
        }

        // dropdown data
        const [{ data: c, error: cErr }, { data: v, error: vErr }] = await Promise.all([
          supabase.from("customers").select("id, name").order("name", { ascending: true }),
          supabase.from("varieties").select("id, variety").order("variety", { ascending: true }),
        ]);

        if (cErr) throw new Error(cErr.message);
        if (vErr) throw new Error(vErr.message);

        if (!mounted) return;

        const cRows = (c ?? []) as CustomerRow[];
        const vRows = (v ?? []) as VarietyRow[];

        setCustomers(cRows);
        setVarieties(vRows);

        // order
        const { data: o, error: oErr } = await supabase
          .from("orders")
          .select("id, customer_id, variety_id, quantity, delivery_date, status, created_at")
          .eq("id", rawId)
          .single();

        if (oErr) throw new Error(oErr.message);
        if (!o) throw new Error("Order not found.");

        if (!mounted) return;

        const row = o as OrderRow;
        setOrder(row);

        setForm({
          customer_id: String(row.customer_id ?? ""),
          variety_id: String(row.variety_id ?? ""),
          quantity: Number(row.quantity ?? 0),
          delivery_date: String(row.delivery_date ?? ""),
          status: ((row.status as OrderStatus) ?? "draft") as OrderStatus,
        });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load order");
        setForm(null);
        setOrder(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [rawId]);

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
      if (!data) throw new Error("Update failed.");

      const updated = data as OrderRow;
      setOrder(updated);

      setForm({
        customer_id: String(updated.customer_id ?? ""),
        variety_id: String(updated.variety_id ?? ""),
        quantity: Number(updated.quantity ?? 0),
        delivery_date: String(updated.delivery_date ?? ""),
        status: ((updated.status as OrderStatus) ?? "draft") as OrderStatus,
      });

      setSuccess("Order updated.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to update order");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!order?.id) return;

    const ok = window.confirm("Delete this order? This cannot be undone.");
    if (!ok) return;

    try {
      setDeleting(true);
      setError(null);
      setSuccess(null);

      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw new Error(error.message);

      navigate(-1);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete order");
    } finally {
      setDeleting(false);
    }
  }

  function resetToSaved() {
    if (!order) return;
    setForm({
      customer_id: String(order.customer_id ?? ""),
      variety_id: String(order.variety_id ?? ""),
      quantity: Number(order.quantity ?? 0),
      delivery_date: String(order.delivery_date ?? ""),
      status: ((order.status as OrderStatus) ?? "draft") as OrderStatus,
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
      <div style={{ padding: 16 }}>
        <h2>Order</h2>
        <p>Not found.</p>
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
            onChange={(e) =>
              setForm((prev) => ({
                ...(prev ?? EMPTY_FORM),
                customer_id: String(e.target.value ?? ""),
              }))
            }
            style={{ padding: 10, borderRadius: 8 }}
          >
            <option value="">Select a customer…</option>
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
            onChange={(e) =>
              setForm((prev) => ({
                ...(prev ?? EMPTY_FORM),
                variety_id: String(e.target.value ?? ""),
              }))
            }
            style={{ padding: 10, borderRadius: 8 }}
          >
            <option value="">Select a variety…</option>
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
            onChange={(e) =>
              setForm((prev) => ({
                ...(prev ?? EMPTY_FORM),
                quantity: Number(e.target.value),
              }))
            }
            style={{ padding: 10, borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Delivery date</span>
          <input
            type="date"
            value={form.delivery_date}
            onChange={(e) =>
              setForm((prev) => ({
                ...(prev ?? EMPTY_FORM),
                delivery_date: String(e.target.value ?? ""),
              }))
            }
            style={{ padding: 10, borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Status</span>
          <select
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({
                ...(prev ?? EMPTY_FORM),
                status: e.target.value as OrderStatus,
              }))
            }
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
            style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 700 }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            onClick={resetToSaved}
            disabled={saving || deleting}
            style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd" }}
          >
            Reset
          </button>

          <button
            onClick={() => navigate(-1)}
            disabled={saving || deleting}
            style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd" }}
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
              marginLeft: "auto",
            }}
          >
            {deleting ? "Deleting…" : "Delete order"}
          </button>
        </div>
      </div>
    </div>
  );
}
