// src/pages/NewOrderPage.tsx
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

import type { Variety } from "../lib/storage";
import {
  getCustomers as getCustomersSB,
  addOrder as addOrderSB,
  syncPhaseTasksRange,
  type Customer,
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

async function getCurrentAccountId() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error("No signed-in user found.");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .single();

  if (profileErr) throw new Error(profileErr.message);
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

  const unique = new Map<string, Variety>();

  for (const r of data ?? []) {
    const key = String(r.variety ?? "").trim().toLowerCase();
    if (!key || unique.has(key)) continue;

    unique.set(key, {
      id: r.id,
      name: r.variety ?? "",
      daysToHarvest: Number(r.harvest_days ?? 0),
    });
  }

  return Array.from(unique.values());
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
      ? crypto.randomUUID()
      : `ln_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const addLine = () => {
    setLines((prev) => [
      {
        id: makeId(),
        varietyId: varieties[0]?.id ?? "",
        quantity: 1,
        seedGramsPerTray: undefined,
        packSize: "",
        notes: "",
      },
      ...prev,
    ]);
  };

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        const accountId = await getCurrentAccountId();

        const allCustomers = await getCustomersSB();
        const scopedCustomers = allCustomers.filter(
          (c: any) => !c.account_id || c.account_id === accountId
        );

        const vars = await fetchVarietiesForOrders();

        if (!alive) return;

        setCustomers(scopedCustomers);
        setVarieties(vars);

        if (scopedCustomers[0]?.id) setCustomerId(scopedCustomers[0].id);

        const today = toYMD(new Date());
        setDeliveryDate(addDaysYMD(today, 7));
        setSowDate(today);

        setLines([
          {
            id: makeId(),
            varietyId: vars[0]?.id ?? "",
            quantity: 1,
            seedGramsPerTray: undefined,
            packSize: "",
            notes: "",
          },
        ]);
      } catch (e: any) {
        alert(e?.message ?? "Failed to load order page.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const selectedCustomer = activeCustomers.find((c) => c.id === customerId);

  const computedDeliveryDate = useMemo(() => {
    if (planMode === "delivery") return deliveryDate;

    let maxDays = 0;
    for (const line of lines) {
      const v = varieties.find((x) => x.id === line.varietyId);
      maxDays = Math.max(maxDays, Number(v?.daysToHarvest ?? 0));
    }

    return sowDate ? addDaysYMD(sowDate, maxDays || 0) : "";
  }, [planMode, deliveryDate, sowDate, lines, varieties]);

  const computedSowDates = useMemo(() => {
    const map = new Map<string, string>();

    for (const line of lines) {
      const v = varieties.find((x) => x.id === line.varietyId);
      const days = Number(v?.daysToHarvest ?? 0);

      if (planMode === "delivery") {
        map.set(line.id, deliveryDate ? subtractDaysYMD(deliveryDate, days) : "");
      } else {
        map.set(line.id, sowDate);
      }
    }

    return map;
  }, [planMode, deliveryDate, sowDate, lines, varieties]);

  const totalTrays = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    [lines]
  );

  function updateLine(id: string, patch: Partial<OrderLineDraft>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!customerId) {
      alert("Please select a customer.");
      return;
    }

    if (!computedDeliveryDate) {
      alert("Please choose a delivery date or sow date.");
      return;
    }

    const cleanLines = lines.filter((l) => l.varietyId && Number(l.quantity) > 0);

    if (cleanLines.length === 0) {
      alert("Please add at least one variety.");
      return;
    }

    try {
      setSubmitting(true);
      const accountId = await getCurrentAccountId();

      for (const line of cleanLines) {
        await addOrderSB({
          customerId,
          varietyId: line.varietyId,
          quantity: Number(line.quantity),
          deliveryDate: computedDeliveryDate,
          status,
          notes: line.notes ?? "",
          seedGramsPerTray: line.seedGramsPerTray,
          packSize: line.packSize,
          account_id: accountId,
        } as any);
      }

      const today = toYMD(new Date());
      await syncPhaseTasksRange(today, 45);

      navigate("/orders");
    } catch (e: any) {
      alert(e?.message ?? "Failed to create order.");
    } finally {
      setSubmitting(false);
    }
  }

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

      <form onSubmit={handleSubmit} style={formWrap}>
        <div style={card}>
          <h2 style={cardTitle}>Customer</h2>

          <label style={label}>
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={input}>
              <option value="">Select customer…</option>
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {selectedCustomer && (
            <div style={helperText}>
              {selectedCustomer.contactName ? `${selectedCustomer.contactName} • ` : ""}
              {selectedCustomer.email ?? ""}
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={cardTitle}>Planning Mode</h2>

          <div style={segmented}>
            <button
              type="button"
              onClick={() => setPlanMode("delivery")}
              style={planMode === "delivery" ? segmentActive : segment}
            >
              Plan from Delivery Date
            </button>
            <button
              type="button"
              onClick={() => setPlanMode("sow")}
              style={planMode === "sow" ? segmentActive : segment}
            >
              Plan from Sow Date
            </button>
          </div>

          {planMode === "delivery" ? (
            <label style={label}>
              Delivery Date
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                style={input}
              />
            </label>
          ) : (
            <label style={label}>
              Sow Date
              <input type="date" value={sowDate} onChange={(e) => setSowDate(e.target.value)} style={input} />
            </label>
          )}

          <label style={label}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={input}>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="packed">Packed</option>
              <option value="delivered">Delivered</option>
            </select>
          </label>
        </div>

        <div style={card}>
          <div style={cardHeader}>
            <div>
              <h2 style={cardTitle}>Order Lines</h2>
              <div style={helperText}>Total trays: {totalTrays}</div>
            </div>

            <button type="button" onClick={addLine} style={secondaryBtn}>
              + Add Variety
            </button>
          </div>

          {varieties.length === 0 ? (
            <p style={helperText}>No varieties found for this account.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {lines.map((line) => {
                const v = varieties.find((x) => x.id === line.varietyId);
                const sow = computedSowDates.get(line.id) ?? "";

                return (
                  <div key={line.id} style={lineGrid}>
                    <label style={label}>
                      Variety
                      <select
                        value={line.varietyId}
                        onChange={(e) => updateLine(line.id, { varietyId: e.target.value })}
                        style={input}
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
                        onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) || 1 })}
                        style={input}
                      />
                    </label>

                    <label style={label}>
                      Seed g/tray
                      <input
                        type="number"
                        value={line.seedGramsPerTray ?? ""}
                        onChange={(e) =>
                          updateLine(line.id, {
                            seedGramsPerTray: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        style={input}
                        placeholder="Optional"
                      />
                    </label>

                    <label style={label}>
                      Pack Size
                      <input
                        value={line.packSize ?? ""}
                        onChange={(e) => updateLine(line.id, { packSize: e.target.value })}
                        style={input}
                        placeholder="2 oz, 4 oz, bulk"
                      />
                    </label>

                    <div style={sowBox}>
                      <div style={{ fontWeight: 900 }}>Sow</div>
                      <div>{sow ? formatDisplayDate(sow) : "—"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {v?.daysToHarvest ? `${v.daysToHarvest} grow days` : "No grow days set"}
                      </div>
                    </div>

                    <button type="button" onClick={() => removeLine(line.id)} style={dangerBtn}>
                      Remove
                    </button>

                    <label style={{ ...label, gridColumn: "1 / -1" }}>
                      Line Notes
                      <input
                        value={line.notes ?? ""}
                        onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                        style={input}
                        placeholder="Optional line notes"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={cardTitle}>Summary</h2>
          <div style={summaryGrid}>
            <div>
              <strong>Delivery:</strong> {computedDeliveryDate ? formatDisplayDate(computedDeliveryDate) : "—"}
            </div>
            <div>
              <strong>Total trays:</strong> {totalTrays}
            </div>
            <div>
              <strong>Variety lines:</strong> {lines.length}
            </div>
          </div>
        </div>

        <div style={actions}>
          <button type="button" onClick={() => navigate("/orders")} style={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} style={primaryBtn}>
            {submitting ? "Creating Tasks…" : "Create Order"}
          </button>
        </div>
      </form>
    </div>
  );
}

const formWrap: CSSProperties = { display: "grid", gap: 16, maxWidth: 1180 };
const card: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, background: "#fff" };
const cardHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 };
const cardTitle: CSSProperties = { margin: "0 0 12px", fontSize: 22, fontWeight: 900, color: "#0f172a" };
const label: CSSProperties = { display: "grid", gap: 6, fontWeight: 800, color: "#0f172a" };
const input: CSSProperties = { width: "100%", padding: "11px 13px", borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 15, boxSizing: "border-box", background: "#fff" };
const helperText: CSSProperties = { fontSize: 13, color: "#64748b" };
const segmented: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 };
const segment: CSSProperties = { padding: "10px 14px", borderRadius: 999, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 900 };
const segmentActive: CSSProperties = { ...segment, background: "#047857", color: "#fff", border: "1px solid #047857" };
const lineGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1.6fr) 90px 120px 140px minmax(140px, 0.8fr) auto", gap: 10, alignItems: "end", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0" };
const sowBox: CSSProperties = { padding: "10px 12px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc" };
const summaryGrid: CSSProperties = { display: "grid", gap: 8, color: "#0f172a" };
const actions: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10 };
const primaryBtn: CSSProperties = { padding: "12px 18px", borderRadius: 999, border: "none", background: "#047857", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryBtn: CSSProperties = { padding: "12px 18px", borderRadius: 999, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", fontWeight: 900, cursor: "pointer" };
const dangerBtn: CSSProperties = { padding: "11px 13px", borderRadius: 999, border: "none", background: "#b91c1c", color: "#fff", fontWeight: 900, cursor: "pointer" };