// src/pages/OrderDetailPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
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

/* ----------------- Helpers shared with Orders list ----------------- */
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

async function updateOrderRow(orderId: string, patch: Partial<Order>) {
  const { error } = await supabase.from("orders").update(patch as any).eq("id", orderId);
  if (error) throw new Error(error.message);
}

async function deleteOrderLines(ids: string[]) {
  if (!ids.length) return;

  // try delete tasks linked to orders (optional)
  try {
    await supabase.from("tasks").delete().in("order_id", ids as any);
  } catch {
    // ignore
  }

  const { error } = await supabase.from("orders").delete().in("id", ids as any);
  if (error) throw new Error(error.message);
}

type EditableLine = {
  id: string;
  varietyId: string;
  quantity: number;
  deliveryDate: string;
  status: OrderStatus;
};

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const groupKey = decodeURIComponent(params.groupKey ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [editLines, setEditLines] = useState<EditableLine[]>([]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  const varietyName = (id: string) => varieties.find((v) => v.id === id)?.name ?? "Unknown variety";

  const groupLines = useMemo(() => {
    const lines = orders.filter((o) => groupKeyForLine(o) === groupKey);
    return lines;
  }, [orders, groupKey]);

  const groupCustomerId = groupLines[0]?.customerId ?? "";
  const groupDeliveryDate = groupLines[0]?.deliveryDate ?? "";
  const orderNumber = displayOrderNumber(groupKey);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [os, cs, vs] = await Promise.all([getOrdersasap(), getCustomersSB(), fetchVarietiesForOrders()]);
        if (!alive) return;

        setOrders(os);
        setCustomers(cs);
        setVarieties(vs);

        const lines = os.filter((o) => groupKeyForLine(o) === groupKey);
        setEditLines(
          lines.map((l) => ({
            id: l.id,
            varietyId: l.varietyId,
            quantity: Number(l.quantity ?? 0),
            deliveryDate: l.deliveryDate,
            status: l.status,
          }))
        );
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
  }, [groupKey]);

  async function getOrdersasap() {
    // tiny helper so TS doesn't complain about Promise.all inference
    return await getOrdersSB();
  }

  const totalTrays = useMemo(() => editLines.reduce((s, l) => s + Number(l.quantity || 0), 0), [editLines]);

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
        <button style={secondaryBtn} onClick={() => navigate("/orders")}>
          Back
        </button>
      </div>
    );
  }

  if (groupLines.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Order not found</h1>
        <p className="page-text">
          This order link doesn’t match any current order group. (It may have been deleted or was created before grouping.)
        </p>
        <button style={secondaryBtn} onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>

      <div style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
        <strong>{orderNumber}</strong> • {customerName(groupCustomerId)} • Delivery{" "}
        <strong>{groupDeliveryDate ? formatDisplayDate(groupDeliveryDate) : "—"}</strong>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={pill}>Lines: {editLines.length}</span>
        <span style={pill}>Total trays: {totalTrays}</span>

        <button
          style={primaryBtn}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              // Save each line
              for (const l of editLines) {
                if (!l.varietyId) throw new Error("Each line must have a variety.");
                if (!l.deliveryDate) throw new Error("Delivery date is required.");
                if (!l.quantity || l.quantity <= 0) throw new Error("Quantity must be > 0.");
                await updateOrderRow(l.id, {
                  varietyId: l.varietyId,
                  quantity: Number(l.quantity),
                  deliveryDate: l.deliveryDate,
                  status: l.status,
                });
              }

              // Reload orders so the group key stays consistent if delivery date changed
              const fresh = await getOrdersSB();
              setOrders(fresh);

              alert("Saved.");
              navigate("/orders");
            } catch (e: any) {
              alert(e?.message ?? "Failed to save changes.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>

        <button
          style={dangerBtn}
          onClick={async () => {
            const ok = window.confirm(`Delete ${orderNumber}?\n\nThis deletes ALL lines in the order.`);
            if (!ok) return;
            try {
              await deleteOrderLines(editLines.map((x) => x.id));
              alert("Deleted.");
              navigate("/orders");
            } catch (e: any) {
              alert(e?.message ?? "Failed to delete order.");
            }
          }}
        >
          Delete Order
        </button>

        <button style={secondaryBtn} onClick={() => navigate("/orders")}>
          Back
        </button>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {editLines.map((l) => (
          <div
            key={l.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              background: "#fff",
              padding: 12,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 170px", gap: 10, alignItems: "end" }}>
              <div>
                <div style={miniLabel}>Variety</div>
                <select
                  value={l.varietyId}
                  onChange={(e) =>
                    setEditLines((prev) =>
                      prev.map((x) => (x.id === l.id ? { ...x, varietyId: e.target.value } : x))
                    )
                  }
                  style={controlStyle}
                >
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                  Current: <strong>{varietyName(l.varietyId)}</strong>
                </div>
              </div>

              <div>
                <div style={miniLabel}>Trays</div>
                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) =>
                    setEditLines((prev) =>
                      prev.map((x) => (x.id === l.id ? { ...x, quantity: Number(e.target.value) } : x))
                    )
                  }
                  style={controlStyle}
                />
              </div>

              <div>
                <div style={miniLabel}>Delivery date</div>
                <input
                  type="date"
                  value={l.deliveryDate}
                  onChange={(e) =>
                    setEditLines((prev) =>
                      prev.map((x) => (x.id === l.id ? { ...x, deliveryDate: e.target.value } : x))
                    )
                  }
                  style={controlStyle}
                />
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={miniLabel}>Status</div>
                <select
                  value={l.status}
                  onChange={(e) =>
                    setEditLines((prev) =>
                      prev.map((x) => (x.id === l.id ? { ...x, status: e.target.value as OrderStatus } : x))
                    )
                  }
                  style={controlStyle}
                >
                  <option value="draft">draft</option>
                  <option value="confirmed">confirmed</option>
                  <option value="packed">packed</option>
                  <option value="delivered">delivered</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "end" }}>
                <button
                  style={secondaryBtn}
                  onClick={() => setEditLines((prev) => prev.filter((x) => x.id !== l.id))}
                  title="Remove this line from the edit list (does not delete until you Delete Order)"
                >
                  Remove line (local)
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
        Note: “Remove line (local)” only removes it from the edit screen. To actually delete a line from the database,
        we can add a “Delete line” button next — but for now “Delete Order” removes everything safely.
      </div>
    </div>
  );
}

/* ----------------- Styles ----------------- */
const miniLabel: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const controlStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  borderRadius: 8,
  border: "1px solid #cbd5f5",
  fontSize: 14,
  background: "#ffffff",
};

const primaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 900,
};

const secondaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "1px solid #cbd5f5",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 900,
};

const dangerBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#b91c1c",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 900,
};

const pill: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#0f172a",
  whiteSpace: "nowrap",
};
