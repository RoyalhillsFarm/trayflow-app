// src/pages/OrderDetailPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

import type { Variety } from "../lib/storage";
import {
  getCustomers as getCustomersSB,
  getOrders as getOrdersSB,
  addOrder as addOrderSB,
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

/* ----------------- GROUP KEY (MUST MATCH OrdersPage.tsx) ----------------- */
function parseCreatedAtToMs(created_at?: string | null): number {
  if (!created_at) return 0;
  const ms = Date.parse(created_at);
  return Number.isFinite(ms) ? ms : 0;
}

const GROUP_BUCKET_MINUTES = 5;

function groupKeyForLine(o: Order): string {
  const ms = parseCreatedAtToMs((o as any).created_at);
  const bucket = ms ? Math.floor(ms / (GROUP_BUCKET_MINUTES * 60 * 1000)) : 0;
  return `${o.customerId}__${o.deliveryDate}__${bucket}`;
}

/* ----- Helpers: fetch Varieties from Supabase ----- */
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

// Updates a single existing order line row (tries snake_case then camelCase)
async function updateOrderLineRow(args: {
  id: string;
  customerId: string;
  deliveryDate: string;
  varietyId: string;
  quantity: number;
  status: OrderStatus;
}) {
  // Try snake_case first (most common)
  {
    const { error } = await supabase
      .from("orders")
      .update({
        customer_id: args.customerId,
        delivery_date: args.deliveryDate,
        variety_id: args.varietyId,
        quantity: args.quantity,
        status: args.status,
      } as any)
      .eq("id", args.id);

    if (!error) return;
  }

  // Fallback: camelCase columns (if your DB used that)
  {
    const { error } = await supabase
      .from("orders")
      .update({
        customerId: args.customerId,
        deliveryDate: args.deliveryDate,
        varietyId: args.varietyId,
        quantity: args.quantity,
        status: args.status,
      } as any)
      .eq("id", args.id);

    if (error) throw new Error(error.message);
  }
}

async function deleteOrderLinesByIds(ids: string[]) {
  if (!ids.length) return;

  // Delete tasks first (best-effort)
  try {
    await supabase.from("tasks").delete().in("order_id", ids as any);
  } catch {
    // ignore
  }

  const { error } = await supabase.from("orders").delete().in("id", ids as any);
  if (error) throw new Error(error.message);
}

/* ----------------- UI TYPES ----------------- */
type DraftLine = {
  localId: string;
  existingId?: string; // if it already exists in DB
  varietyId: string;
  quantity: number;
};

const makeLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `ln_${Date.now()}_${Math.random().toString(16).slice(2)}`;

/* ----------------- PAGE ----------------- */
export default function OrderDetailPage() {
  const navigate = useNavigate();
  const { groupKey: encodedGroupKey } = useParams();
  const groupKey = decodeURIComponent(encodedGroupKey ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [error, setError] = useState<string | null>(null);

  // editable state
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [status, setStatus] = useState<OrderStatus>("confirmed");
  const [customerId, setCustomerId] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");

  async function reloadAll() {
    const [os, cs, vs] = await Promise.all([getOrdersSB(), getCustomersSB(), fetchVarietiesForOrders()]);
    setOrders(os);
    setCustomers(cs);
    setVarieties(vs);
  }

  // Load
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        await reloadAll();
        if (!alive) return;
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
  }, [encodedGroupKey]);

  // Build the group from current orders
  const groupLines = useMemo(() => {
    if (!groupKey) return [];
    return orders.filter((o) => groupKeyForLine(o) === groupKey);
  }, [orders, groupKey]);

  // Initialize edit state whenever the group changes
  useEffect(() => {
    if (!groupLines.length) return;

    const first = groupLines[0];
    setStatus(first.status);
    setCustomerId(first.customerId);
    setDeliveryDate(first.deliveryDate);

    setDraftLines(
      groupLines.map((o) => ({
        localId: makeLocalId(),
        existingId: o.id,
        varietyId: o.varietyId,
        quantity: Number(o.quantity ?? 0) || 1,
      }))
    );
  }, [groupLines.map((x) => x.id).join("|")]); // stable-ish dependency

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  const varietyName = (id: string) => varieties.find((v) => v.id === id)?.name ?? "Unknown variety";

  const totalTrays = useMemo(
    () => draftLines.reduce((sum, l) => sum + Number(l.quantity ?? 0), 0),
    [draftLines]
  );

  async function setGroupStatus(next: OrderStatus) {
    if (!groupLines.length) return;
    setStatus(next);

    try {
      setSaving(true);
      await Promise.all(groupLines.map((l) => updateOrderStatusRow(l.id, next)));
      await reloadAll();
    } catch (e: any) {
      alert(e?.message ?? "Failed to update status.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!customerId) return alert("Missing customer.");
    if (!deliveryDate) return alert("Missing delivery date.");
    if (!draftLines.length) return alert("Add at least one line.");

    for (const l of draftLines) {
      if (!l.varietyId) return alert("Each line needs a variety selected.");
      if (!l.quantity || l.quantity <= 0) return alert("Each line needs trays > 0.");
    }

    const existingIds = new Set(groupLines.map((x) => x.id));
    const keepIds = new Set(draftLines.map((x) => x.existingId).filter(Boolean) as string[]);
    const toDelete = Array.from(existingIds).filter((id) => !keepIds.has(id));

    try {
      setSaving(true);

      // 1) delete removed lines
      if (toDelete.length) {
        await deleteOrderLinesByIds(toDelete);
      }

      // 2) update existing lines
      const updates = draftLines.filter((l) => l.existingId);
      for (const l of updates) {
        await updateOrderLineRow({
          id: l.existingId!,
          customerId,
          deliveryDate,
          varietyId: l.varietyId,
          quantity: Number(l.quantity),
          status,
        });
      }

      // 3) insert new lines
      const inserts = draftLines.filter((l) => !l.existingId);
      for (const l of inserts) {
        await addOrderSB({
          customerId,
          varietyId: l.varietyId,
          quantity: Number(l.quantity),
          deliveryDate,
          status,
        });
      }

      await reloadAll();
      alert("Saved.");
    } catch (e: any) {
      alert(e?.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOrder() {
    if (!groupLines.length) return;
    const ok = window.confirm("Delete this entire order (all lines)?");
    if (!ok) return;

    try {
      setSaving(true);
      await deleteOrderLinesByIds(groupLines.map((x) => x.id));
      navigate("/orders");
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete order.");
    } finally {
      setSaving(false);
    }
  }

  const addLine = () => {
    const firstVar = varieties[0]?.id ?? "";
    setDraftLines((prev) => [
      ...prev,
      { localId: makeLocalId(), varietyId: firstVar, quantity: 1 },
    ]);
  };

  const removeLine = (localId: string) => {
    setDraftLines((prev) => prev.filter((l) => l.localId !== localId));
  };

  const updateLine = (localId: string, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)));
  };

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  // If we can't find it, show useful info
  if (!error && groupKey && groupLines.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          Order not found.
        </p>
        <p className="page-text" style={{ maxWidth: 760 }}>
          This usually happens when the order-group key changed (older rows missing created_at, etc.).
          Go back to Orders and click “View / Edit” again. If it still happens, we’ll normalize grouping.
        </p>

        <div style={{ marginTop: 12 }}>
          <button style={btnSecondary} onClick={() => navigate("/orders")}>
            Back to Orders
          </button>
        </div>
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
        <button style={btnSecondary} onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  const titleCustomer = customerName(customerId);
  const headerDelivery = deliveryDate ? formatDisplayDate(deliveryDate) : "—";

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>

      <div style={{ marginTop: 6, fontSize: 16, opacity: 0.85, fontWeight: 700 }}>
        {titleCustomer} • Delivery {headerDelivery} • Total trays: {totalTrays} • Status:{" "}
        <span style={{ textTransform: "capitalize" }}>{status}</span>
      </div>

      {/* Top actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        {status !== "packed" && status !== "delivered" && (
          <button style={btnSecondary} disabled={saving} onClick={() => setGroupStatus("packed")}>
            Mark Packed
          </button>
        )}

        {status !== "delivered" && (
          <button style={btnPrimary} disabled={saving} onClick={() => setGroupStatus("delivered")}>
            Mark Delivered
          </button>
        )}

        <button style={btnSecondary} disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Changes"}
        </button>

        <button style={btnDanger} disabled={saving} onClick={handleDeleteOrder}>
          Delete Order
        </button>

        <button style={btnSecondary} onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>

      {/* Basic order fields (optional, but helps editing) */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          background: "#fff",
          padding: 14,
          maxWidth: 980,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 220px", gap: 12, alignItems: "end" }}>
          <div>
            <div style={miniLabel}>Customer</div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={control}
              disabled={saving}
            >
              {customers
                .filter((c) => c.active !== false)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div style={miniLabel}>Delivery date</div>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              style={control}
              disabled={saving}
            />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div style={{ marginTop: 18, fontWeight: 900, fontSize: 22 }}>Variety breakdown</div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          background: "#fff",
          overflow: "hidden",
          maxWidth: 980,
        }}
      >
        {draftLines.map((l, idx) => (
          <div
            key={l.localId}
            style={{
              padding: 14,
              borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
              <div>
                <div style={miniLabel}>Variety</div>
                <select
                  value={l.varietyId}
                  onChange={(e) => updateLine(l.localId, { varietyId: e.target.value })}
                  style={control}
                  disabled={saving}
                >
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6, fontWeight: 800, opacity: 0.85 }}>
                  Current: {varietyName(l.varietyId)}
                </div>
              </div>

              <div>
                <div style={miniLabel}>Trays</div>
                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => updateLine(l.localId, { quantity: Number(e.target.value) })}
                  style={control}
                  disabled={saving}
                />

                <div style={{ marginTop: 10 }}>
                  <button
                    style={btnSecondary}
                    disabled={saving || draftLines.length <= 1}
                    onClick={() => removeLine(l.localId)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button style={btnSecondary} onClick={addLine} disabled={saving}>
          + Add variety
        </button>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

/* ----------------- Shared styles ----------------- */
const miniLabel: CSSProperties = { fontSize: 12, color: "#64748b", marginBottom: 6 };

const control: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 10,
  border: "1px solid #cbd5f5",
  fontSize: 16, // slightly larger for desktop + mobile usability
  background: "#ffffff",
};

const btnPrimary: CSSProperties = {
  padding: "0.55rem 1.2rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  padding: "0.55rem 1.2rem",
  borderRadius: 999,
  border: "1px solid #cbd5f5",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};

const btnDanger: CSSProperties = {
  ...btnPrimary,
  background: "#b91c1c",
};
