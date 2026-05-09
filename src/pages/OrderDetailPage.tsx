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

/* ---------------- DATE HELPERS ---------------- */

function normalizeDate(date?: string | null) {
  if (!date) return "";
  return String(date).slice(0, 10);
}

/* ---------------- STABLE GROUP KEY ---------------- */

function stableGroupKey(o: Order) {
  return [
    o.customerId,
    normalizeDate(o.deliveryDate),
    o.status,
  ].join("__");
}

/* ---------------- VARIETIES ---------------- */

async function fetchVarietiesForOrders(): Promise<Variety[]> {
  const { data, error } = await supabase
    .from("varieties")
    .select("id, variety, harvest_days")
    .is("disabled_at", null)
    .order("variety", { ascending: true });

  if (error) throw new Error(error.message);

  const dedupe = new Map<string, Variety>();

  for (const r of data ?? []) {
    const key = String(r.variety ?? "").trim().toLowerCase();

    if (!key || dedupe.has(key)) continue;

    dedupe.set(key, {
      id: r.id,
      name: r.variety ?? "",
      daysToHarvest: Number(r.harvest_days ?? 0),
    });
  }

  return Array.from(dedupe.values());
}

/* ---------------- MUTATIONS ---------------- */

async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

async function updateOrderLineRow(args: {
  id: string;
  customerId: string;
  deliveryDate: string;
  varietyId: string;
  quantity: number;
  status: OrderStatus;
}) {
  const { error } = await supabase
    .from("orders")
    .update({
      customer_id: args.customerId,
      delivery_date: args.deliveryDate,
      variety_id: args.varietyId,
      quantity: args.quantity,
      status: args.status,
    })
    .eq("id", args.id);

  if (error) throw new Error(error.message);
}

async function deleteOrderLinesByIds(ids: string[]) {
  if (!ids.length) return;

  await supabase.from("tasks").delete().in("order_id", ids as any);

  const { error } = await supabase
    .from("orders")
    .delete()
    .in("id", ids as any);

  if (error) throw new Error(error.message);
}

/* ---------------- TYPES ---------------- */

type DraftLine = {
  localId: string;
  existingId?: string;
  varietyId: string;
  quantity: number;
};

const makeLocalId = () =>
  crypto.randomUUID();

/* ---------------- PAGE ---------------- */

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const { groupKey } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);

  const [status, setStatus] =
    useState<OrderStatus>("confirmed");

  const [customerId, setCustomerId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  async function reloadAll() {
    const [o, c, v] = await Promise.all([
      getOrdersSB(),
      getCustomersSB(),
      fetchVarietiesForOrders(),
    ]);

    setOrders(o);
    setCustomers(c);
    setVarieties(v);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);

      try {
        await reloadAll();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groupLines = useMemo(() => {
    if (!groupKey) return [];

    return orders.filter(
      (o) => stableGroupKey(o) === groupKey
    );
  }, [orders, groupKey]);

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
        quantity: Number(o.quantity ?? 1),
      }))
    );
  }, [groupLines]);

  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ??
    "Unknown customer";

  const varietyName = (id: string) =>
    varieties.find((v) => v.id === id)?.name ??
    "Unknown variety";

  const totalTrays = useMemo(() => {
    return draftLines.reduce(
      (sum, l) => sum + Number(l.quantity || 0),
      0
    );
  }, [draftLines]);

  async function handleSave() {
    if (!customerId) return alert("Select customer");
    if (!deliveryDate) return alert("Select delivery date");

    try {
      setSaving(true);

      const existingIds = new Set(
        groupLines.map((g) => g.id)
      );

      const keepIds = new Set(
        draftLines
          .map((d) => d.existingId)
          .filter(Boolean) as string[]
      );

      const toDelete = Array.from(existingIds).filter(
        (id) => !keepIds.has(id)
      );

      if (toDelete.length) {
        await deleteOrderLinesByIds(toDelete);
      }

      for (const line of draftLines) {
        if (line.existingId) {
          await updateOrderLineRow({
            id: line.existingId,
            customerId,
            deliveryDate,
            varietyId: line.varietyId,
            quantity: line.quantity,
            status,
          });
        } else {
          await addOrderSB({
            customerId,
            varietyId: line.varietyId,
            quantity: line.quantity,
            deliveryDate,
            status,
          });
        }
      }

      await reloadAll();

      alert("Saved");
    } catch (e: any) {
      alert(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const addLine = () => {
    const firstVarietyId = varieties[0]?.id ?? "";

    setDraftLines((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        varietyId: firstVarietyId,
        quantity: 1,
      },
    ]);
  };

  const removeLine = (localId: string) => {
    setDraftLines((prev) =>
      prev.filter((p) => p.localId !== localId)
    );
  };

  const updateLine = (
    localId: string,
    patch: Partial<DraftLine>
  ) => {
    setDraftLines((prev) =>
      prev.map((p) =>
        p.localId === localId
          ? { ...p, ...patch }
          : p
      )
    );
  };

  if (loading) {
    return <div className="page">Loading…</div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>

      <div style={subHeader}>
        {customerName(customerId)} • Delivery{" "}
        {formatDisplayDate(deliveryDate)} •
        Total trays: {totalTrays}
      </div>

      {/* TOP BUTTON */}
      <div style={{ marginTop: 18 }}>
        <button style={btnSecondary} onClick={addLine}>
          + Add Variety
        </button>
      </div>

      <div style={card}>
        {draftLines.map((l) => (
          <div key={l.localId} style={lineCard}>
            <div style={grid}>
              <div>
                <div style={miniLabel}>Variety</div>

                <select
                  value={l.varietyId}
                  onChange={(e) =>
                    updateLine(l.localId, {
                      varietyId: e.target.value,
                    })
                  }
                  style={control}
                >
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>

                <div style={currentText}>
                  Current: {varietyName(l.varietyId)}
                </div>
              </div>

              <div>
                <div style={miniLabel}>Trays</div>

                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) =>
                    updateLine(l.localId, {
                      quantity: Number(e.target.value),
                    })
                  }
                  style={control}
                />

                <div style={{ marginTop: 10 }}>
                  <button
                    style={btnSecondary}
                    onClick={() =>
                      removeLine(l.localId)
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BOTTOM BUTTON */}
      <div style={{ marginTop: 18 }}>
        <button style={btnSecondary} onClick={addLine}>
          + Add Variety
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 24,
          flexWrap: "wrap",
        }}
      >
        <button
          style={btnPrimary}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <button
          style={btnSecondary}
          onClick={() => navigate("/orders")}
        >
          Back to Orders
        </button>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const subHeader: CSSProperties = {
  marginTop: 6,
  fontSize: 16,
  opacity: 0.8,
  fontWeight: 700,
};

const card: CSSProperties = {
  marginTop: 18,
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fff",
  maxWidth: 1100,
};

const lineCard: CSSProperties = {
  padding: 16,
  borderBottom: "1px solid #f1f5f9",
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 180px",
  gap: 14,
};

const miniLabel: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const currentText: CSSProperties = {
  marginTop: 8,
  fontWeight: 800,
  opacity: 0.85,
};

const control: CSSProperties = {
  width: "100%",
  padding: "0.7rem",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 16,
};

const btnPrimary: CSSProperties = {
  padding: "0.7rem 1.2rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  padding: "0.7rem 1.2rem",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};