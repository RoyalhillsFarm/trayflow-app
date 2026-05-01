// src/pages/NewOrderPage.tsx
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

import type { Variety } from "../lib/storage";
import {
  getCustomers as getCustomersSB,
  addOrder as addOrderSB,
  type Customer,
  type OrderStatus,
} from "../lib/supabaseStorage";

/* ----------------- DATE HELPERS ----------------- */
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

/* ----- Helpers: fetch Varieties from Supabase for Orders dropdown ----- */
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

type OrderLineDraft = {
  id: string;
  varietyId: string;
  quantity: number;
  seedGramsPerTray?: number;
  packSize?: string;
  notes?: string;
};

export default function NewOrderPage() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<OrderStatus>("confirmed");

  const [planMode, setPlanMode] = useState<"delivery" | "sow">("delivery");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [sowDate, setSowDate] = useState("");

  const [lines, setLines] = useState<OrderLineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeCustomers = useMemo(() => customers.filter((c) => c.active !== false), [customers]);

  const makeId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `ln_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const addLine = (seedFromFirst = true) => {
    const firstVar = varieties[0]?.id ?? "";
    setLines((prev) => {
      const seed = seedFromFirst ? prev[0]?.seedGramsPerTray : undefined;
      return [
        ...prev,
        { id: makeId(), varietyId: firstVar, quantity: 1, seedGramsPerTray: seed, packSize: "", notes: "" },
      ];
    });
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const updateLine = (id: string, patch: Partial<OrderLineDraft>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const [cs, vs] = await Promise.all([getCustomersSB(), fetchVarietiesForOrders()]);
        if (!alive) return;

        setCustomers(cs);
        setVarieties(vs);

        const act = cs.filter((c) => c.active !== false);
        if (act[0]) setCustomerId(act[0].id);

        const today = toYMD(new Date());
        setSowDate(today);
        setDeliveryDate(addDaysYMD(today, 2));

        setLines([
          { id: makeId(), varietyId: vs[0]?.id ?? "", quantity: 1, seedGramsPerTray: undefined, packSize: "", notes: "" },
        ]);
      } catch (e: any) {
        alert(e?.message ?? "Failed to load customers/varieties.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const computed = useMemo(() => {
    const result = lines.map((l) => {
      const v = varieties.find((x) => x.id === l.varietyId);
      const growDays = Number(v?.daysToHarvest ?? 0);

      let computedDelivery = deliveryDate;
      let computedSow = sowDate;

      if (planMode === "delivery") {
        computedDelivery = deliveryDate;
        computedSow = deliveryDate && growDays > 0 ? subtractDaysYMD(deliveryDate, growDays) : sowDate;
      } else {
        computedSow = sowDate;
        computedDelivery = sowDate && growDays > 0 ? addDaysYMD(sowDate, growDays) : deliveryDate;
      }

      const gramsPerTray = Number(l.seedGramsPerTray ?? 0);
      const totalGrams = gramsPerTray > 0 ? gramsPerTray * Number(l.quantity ?? 0) : 0;

      return {
        line: l,
        varietyName: v?.name ?? "Unknown variety",
        growDays,
        sow: computedSow || "",
        delivery: computedDelivery || "",
        gramsPerTray: gramsPerTray > 0 ? gramsPerTray : null,
        totalGrams: totalGrams > 0 ? totalGrams : null,
      };
    });

    const orderDelivery = result.find((x) => x.delivery)?.delivery ?? deliveryDate;
    const orderSow = result.find((x) => x.sow)?.sow ?? sowDate;

    const totalTrays = result.reduce((sum, x) => sum + Number(x.line.quantity ?? 0), 0);
    const totalSeed = result.reduce((sum, x) => sum + Number(x.totalGrams ?? 0), 0);

    return { lines: result, orderDelivery, orderSow, totalTrays, totalSeed };
  }, [lines, varieties, planMode, deliveryDate, sowDate]);

  const statusHelp =
    status === "draft"
      ? "Draft = not confirmed yet."
      : status === "confirmed"
      ? "Confirmed = committed."
      : status === "packed"
      ? "Packed = production done (no new grow tasks; delivery still shows)."
      : "Delivered = completed.";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!customerId) return alert("Please select a customer.");
    if (!lines.length) return alert("Add at least one variety.");

    for (const l of lines) {
      if (!l.varietyId) return alert("Each variety row needs a variety selected.");
      if (!l.quantity || l.quantity <= 0) return alert("Each row needs trays > 0.");
    }

    const baseDelivery = computed.orderDelivery;
    const baseSow = computed.orderSow;

    if (planMode === "delivery" && !baseDelivery) return alert("Please select a delivery date.");
    if (planMode === "sow" && !baseSow) return alert("Please select a sow date.");

    setSubmitting(true);
    try {
      for (const c of computed.lines) {
        await addOrderSB({
          customerId,
          varietyId: c.line.varietyId,
          quantity: Number(c.line.quantity),
          deliveryDate: c.delivery,
          status,
        });
      }

      navigate("/orders");
    } catch (e: any) {
      alert(e?.message ?? "Failed to save order.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">New Order</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">New Order</h1>

      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        {/* Header controls */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
          <div>
            <div style={miniLabel}>Customer</div>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={controlStyle}>
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={miniLabel}>Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={controlStyle}>
              <option value="draft">draft</option>
              <option value="confirmed">confirmed</option>
              <option value="packed">packed</option>
              <option value="delivered">delivered</option>
            </select>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>{statusHelp}</div>
          </div>

          <div>
            <div style={miniLabel}>Plan mode</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={{ ...secondaryBtn, borderColor: planMode === "delivery" ? "#047857" : "#cbd5f5", fontWeight: 900 }}
                onClick={() => setPlanMode("delivery")}
              >
                Plan by delivery date
              </button>
              <button
                type="button"
                style={{ ...secondaryBtn, borderColor: planMode === "sow" ? "#047857" : "#cbd5f5", fontWeight: 900 }}
                onClick={() => setPlanMode("sow")}
              >
                Plan by sow date
              </button>
            </div>
          </div>
        </div>

        {/* Date inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <div>
            <div style={miniLabel}>Delivery date</div>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              style={controlStyle}
              disabled={planMode !== "delivery"}
            />
          </div>

          <div>
            <div style={miniLabel}>Sow date</div>
            <input
              type="date"
              value={sowDate}
              onChange={(e) => setSowDate(e.target.value)}
              style={controlStyle}
              disabled={planMode !== "sow"}
            />
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            background: "#fff",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 900 }}>Totals</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Trays: <strong>{computed.totalTrays}</strong>
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Seed: <strong>{computed.totalSeed ? `${computed.totalSeed} g` : "—"}</strong>
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Order sow: <strong>{computed.orderSow ? formatDisplayDate(computed.orderSow) : "—"}</strong>
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Order delivery: <strong>{computed.orderDelivery ? formatDisplayDate(computed.orderDelivery) : "—"}</strong>
          </div>
        </div>

        {/* Lines */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Varieties</div>
          <button type="button" onClick={() => addLine(true)} style={secondaryBtn}>
            + Add variety
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {computed.lines.map((c) => (
            <div
              key={c.line.id}
              style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 110px 150px", gap: 10, alignItems: "end" }}>
                <div>
                  <div style={miniLabel}>Variety</div>
                  <select
                    value={c.line.varietyId}
                    onChange={(e) => updateLine(c.line.id, { varietyId: e.target.value })}
                    style={controlStyle}
                  >
                    {varieties.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={miniLabel}>Trays</div>
                  <input
                    type="number"
                    min={1}
                    value={c.line.quantity}
                    onChange={(e) => updateLine(c.line.id, { quantity: Number(e.target.value) })}
                    style={controlStyle}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" onClick={() => removeLine(c.line.id)} style={secondaryBtn}>
                    Remove
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <div style={miniLabel}>Seed g / tray</div>
                  <input
                    type="number"
                    min={0}
                    value={c.line.seedGramsPerTray ?? ""}
                    onChange={(e) =>
                      updateLine(c.line.id, {
                        seedGramsPerTray: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    style={controlStyle}
                    placeholder="optional"
                  />
                </div>

                <div>
                  <div style={miniLabel}>Pack size</div>
                  <input
                    value={c.line.packSize ?? ""}
                    onChange={(e) => updateLine(c.line.id, { packSize: e.target.value })}
                    style={controlStyle}
                    placeholder="optional"
                  />
                </div>

                <div>
                  <div style={miniLabel}>Notes</div>
                  <input
                    value={c.line.notes ?? ""}
                    onChange={(e) => updateLine(c.line.id, { notes: e.target.value })}
                    style={controlStyle}
                    placeholder="optional"
                  />
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#f1f5f9" }}>
                  Grow: <strong>{c.growDays ? `${c.growDays} days` : "—"}</strong>
                </span>
                <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#eff6ff" }}>
                  Sow: <strong>{c.sow ? formatDisplayDate(c.sow) : "—"}</strong>
                </span>
                <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#ecfdf5" }}>
                  Deliver: <strong>{c.delivery ? formatDisplayDate(c.delivery) : "—"}</strong>
                </span>
                <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, background: "#fff7ed" }}>
                  Seed total: <strong>{c.totalGrams ? `${c.totalGrams} g` : "—"}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="submit" style={primaryBtn} disabled={submitting}>
            {submitting ? "Saving…" : "Save Order"}
          </button>
          <button type="button" onClick={() => navigate("/orders")} style={secondaryBtn}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ----------------- Shared styles ----------------- */
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
};

const secondaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "1px solid #cbd5f5",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  cursor: "pointer",
};
