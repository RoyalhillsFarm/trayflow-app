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

function toYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

async function getCurrentAccountId() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error("No signed-in user found.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(error.message);
  if (!profile?.account_id) throw new Error("No account linked to this user.");

  return profile.account_id as string;
}

async function fetchVarietiesForOrders(): Promise<Variety[]> {
  const accountId = await getCurrentAccountId();

  const { data, error } = await supabase
    .from("varieties")
    .select("id, variety, harvest_days")
    .eq("account_id", accountId)
    .is("disabled_at", null)
    .order("variety", { ascending: true });

  if (error) throw new Error(error.message);

  const map = new Map<string, Variety>();

  for (const r of data ?? []) {
    const key = String(r.variety ?? "").trim().toLowerCase();
    if (!key || map.has(key)) continue;

    map.set(key, {
      id: r.id,
      name: r.variety ?? "",
      daysToHarvest: Number(r.harvest_days ?? 0),
    });
  }

  return Array.from(map.values());
}

async function updateOrderStatusRow(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
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

  try {
    await supabase.from("tasks").delete().in("order_id", ids as any);
  } catch {
    // best effort only
  }

  const { error } = await supabase.from("orders").delete().in("id", ids as any);
  if (error) throw new Error(error.message);
}

type DraftLine = {
  localId: string;
  existingId?: string;
  varietyId: string;
  quantity: number;
};

const makeLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ln_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const { groupKey: encodedGroupKey } = useParams();
  const groupKey = decodeURIComponent(encodedGroupKey ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [status, setStatus] = useState<OrderStatus>("confirmed");
  const [customerId, setCustomerId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [sowDate, setSowDate] = useState("");
  const [planMode, setPlanMode] = useState<"delivery" | "sow">("delivery");

  async function reloadAll() {
    const accountId = await getCurrentAccountId();

    const [allOrders, allCustomers, vars] = await Promise.all([
      getOrdersSB(),
      getCustomersSB(),
      fetchVarietiesForOrders(),
    ]);

    setOrders(allOrders.filter((o: any) => !o.account_id || o.account_id === accountId));
    setCustomers(allCustomers.filter((c: any) => !c.account_id || c.account_id === accountId));
    setVarieties(vars);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        await reloadAll();
      } catch (e: any) {
        alert(e?.message ?? "Failed to load order.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [encodedGroupKey]);

  const groupLines = useMemo(() => {
    if (!groupKey) return [];
    return orders.filter((o) => groupKeyForLine(o) === groupKey);
  }, [orders, groupKey]);

  const maxGrowDays = useMemo(() => {
    let max = 0;

    for (const line of draftLines) {
      const v = varieties.find((x) => x.id === line.varietyId);
      max = Math.max(max, Number(v?.daysToHarvest ?? 0));
    }

    return max;
  }, [draftLines, varieties]);

  const computedDeliveryDate = useMemo(() => {
    if (planMode === "delivery") return deliveryDate;
    return sowDate ? addDaysYMD(sowDate, maxGrowDays || 0) : "";
  }, [planMode, deliveryDate, sowDate, maxGrowDays]);

  const computedSowDate = useMemo(() => {
    if (planMode === "sow") return sowDate;
    return deliveryDate ? subtractDaysYMD(deliveryDate, maxGrowDays || 0) : "";
  }, [planMode, deliveryDate, sowDate, maxGrowDays]);

  useEffect(() => {
    if (!groupLines.length) return;

    const first = groupLines[0];

    setStatus(first.status);
    setCustomerId(first.customerId);
    setDeliveryDate(first.deliveryDate);

    const initialLines = groupLines.map((o) => ({
      localId: makeLocalId(),
      existingId: o.id,
      varietyId: o.varietyId,
      quantity: Number(o.quantity ?? 0) || 1,
    }));

    setDraftLines(initialLines);

    let max = 0;
    for (const line of initialLines) {
      const v = varieties.find((x) => x.id === line.varietyId);
      max = Math.max(max, Number(v?.daysToHarvest ?? 0));
    }

    setSowDate(first.deliveryDate ? subtractDaysYMD(first.deliveryDate, max || 0) : "");
  }, [groupLines.map((x) => x.id).join("|"), varieties.length]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  const varietyName = (id: string) => varieties.find((v) => v.id === id)?.name ?? "Unknown variety";

  const totalTrays = useMemo(
    () => draftLines.reduce((sum, l) => sum + Number(l.quantity || 0), 0),
    [draftLines]
  );

  const addLine = () => {
    const firstVarietyId = varieties[0]?.id ?? "";

    setDraftLines((prev) => [
      {
        localId: makeLocalId(),
        varietyId: firstVarietyId,
        quantity: 1,
      },
      ...prev,
    ]);
  };

  const removeLine = (localId: string) => {
    setDraftLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.localId !== localId)));
  };

  const updateLine = (localId: string, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)));
  };

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
    if (!computedDeliveryDate) return alert("Missing delivery date.");
    if (!draftLines.length) return alert("Add at least one variety.");

    for (const line of draftLines) {
      if (!line.varietyId) return alert("Each line needs a variety.");
      if (!line.quantity || line.quantity <= 0) return alert("Each line needs trays > 0.");
    }

    try {
      setSaving(true);

      const accountId = await getCurrentAccountId();

      const existingIds = new Set(groupLines.map((x) => x.id));
      const keepIds = new Set(draftLines.map((x) => x.existingId).filter(Boolean) as string[]);
      const toDelete = Array.from(existingIds).filter((id) => !keepIds.has(id));

      if (toDelete.length) {
        await deleteOrderLinesByIds(toDelete);
      }

      for (const line of draftLines) {
        if (line.existingId) {
          await updateOrderLineRow({
            id: line.existingId,
            customerId,
            deliveryDate: computedDeliveryDate,
            varietyId: line.varietyId,
            quantity: Number(line.quantity),
            status,
          });
        } else {
          await addOrderSB({
            customerId,
            varietyId: line.varietyId,
            quantity: Number(line.quantity),
            deliveryDate: computedDeliveryDate,
            status,
            account_id: accountId,
          } as any);
        }
      }

      alert("Saved.");
      navigate("/orders");
    } catch (e: any) {
      alert(e?.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOrder() {
    if (!groupLines.length) return;
    const ok = window.confirm("Delete this entire order?");
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

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  if (groupLines.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Order</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          Order not found.
        </p>
        <button style={btnSecondary} onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Order</h1>

      <div style={subHeader}>
        {customerName(customerId)} • Delivery{" "}
        {computedDeliveryDate ? formatDisplayDate(computedDeliveryDate) : "—"} • Total trays:{" "}
        {totalTrays}
      </div>

      <div style={actions}>
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

        <button style={btnPrimary} disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Changes"}
        </button>

        <button style={btnDanger} disabled={saving} onClick={handleDeleteOrder}>
          Delete Order
        </button>

        <button style={btnSecondary} onClick={() => navigate("/orders")}>
          Back to Orders
        </button>
      </div>

      <div style={card}>
        <h2 style={cardTitle}>Order Planning</h2>

        <div style={segmented}>
          <button
            type="button"
            style={planMode === "delivery" ? segmentActive : segment}
            onClick={() => setPlanMode("delivery")}
          >
            Plan from Delivery Date
          </button>

          <button
            type="button"
            style={planMode === "sow" ? segmentActive : segment}
            onClick={() => setPlanMode("sow")}
          >
            Plan from Sow Date
          </button>
        </div>

        <div style={planningGrid}>
          <label style={label}>
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={control}>
              {customers
                .filter((c) => c.active !== false)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>

          {planMode === "delivery" ? (
            <label style={label}>
              Delivery Date
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                style={control}
              />
            </label>
          ) : (
            <label style={label}>
              Sow Date
              <input type="date" value={sowDate} onChange={(e) => setSowDate(e.target.value)} style={control} />
            </label>
          )}

          <label style={label}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={control}>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="packed">Packed</option>
              <option value="delivered">Delivered</option>
            </select>
          </label>
        </div>

        <div style={summary}>
          <strong>Computed Delivery:</strong>{" "}
          {computedDeliveryDate ? formatDisplayDate(computedDeliveryDate) : "—"}{" "}
          <span style={{ marginLeft: 14 }}>
            <strong>Computed Sow:</strong>{" "}
            {computedSowDate ? formatDisplayDate(computedSowDate) : "—"}
          </span>
        </div>
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <div>
            <h2 style={cardTitle}>Varieties</h2>
            <div style={helperText}>New varieties are added to the top.</div>
          </div>

          <button type="button" style={btnSecondary} onClick={addLine} disabled={saving}>
            + Add Variety
          </button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {draftLines.map((line) => {
            const v = varieties.find((x) => x.id === line.varietyId);
            const lineSow =
              computedDeliveryDate && v?.daysToHarvest
                ? subtractDaysYMD(computedDeliveryDate, Number(v.daysToHarvest))
                : "";

            return (
              <div key={line.localId} style={lineGrid}>
                <label style={label}>
                  Variety
                  <select
                    value={line.varietyId}
                    onChange={(e) => updateLine(line.localId, { varietyId: e.target.value })}
                    style={control}
                    disabled={saving}
                  >
                    {varieties.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={label}>
                  Trays
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.localId, { quantity: Number(e.target.value) || 1 })}
                    style={control}
                    disabled={saving}
                  />
                </label>

                <div style={sowBox}>
                  <strong>Sow</strong>
                  <div>{lineSow ? formatDisplayDate(lineSow) : "—"}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {v?.daysToHarvest ? `${v.daysToHarvest} grow days` : "No grow days"}
                  </div>
                </div>

                <button
                  type="button"
                  style={btnDanger}
                  disabled={saving || draftLines.length <= 1}
                  onClick={() => removeLine(line.localId)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="button" style={btnSecondary} onClick={addLine} disabled={saving}>
            + Add Variety
          </button>
        </div>
      </div>
    </div>
  );
}

const subHeader: CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  opacity: 0.85,
  fontWeight: 800,
};

const actions: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const card: CSSProperties = {
  marginTop: 18,
  padding: 18,
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  background: "#fff",
  maxWidth: 1100,
};

const cardHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 12,
};

const cardTitle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 22,
  fontWeight: 900,
  color: "#0f172a",
};

const segmented: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 14,
};

const segment: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const segmentActive: CSSProperties = {
  ...segment,
  background: "#047857",
  color: "#fff",
  border: "1px solid #047857",
};

const planningGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 220px 180px",
  gap: 12,
  alignItems: "end",
};

const label: CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  color: "#0f172a",
};

const control: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 15,
  background: "#fff",
  boxSizing: "border-box",
};

const summary: CSSProperties = {
  marginTop: 14,
  color: "#475569",
};

const helperText: CSSProperties = {
  fontSize: 13,
  color: "#64748b",
};

const lineGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1fr) 100px 170px auto",
  gap: 12,
  alignItems: "end",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};

const sowBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const btnPrimary: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const btnDanger: CSSProperties = {
  ...btnPrimary,
  background: "#b91c1c",
};