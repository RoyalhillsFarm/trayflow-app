// src/pages/NewOrderPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

type ProfileRow = {
  id: string;
  email: string | null;
  account_id: string | null;
  role: string | null;
  plan: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  business_name?: string | null;
};

type VarietyRow = {
  id: string;
  variety: string;
  harvest_days: number | null;
};

type OrderLine = {
  varietyId: string;
  quantity: string;
};

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function NewOrderPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayPlus(7));
  const [status, setStatus] = useState("confirmed");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<OrderLine[]>([
    { varietyId: "", quantity: "1" },
  ]);

  useEffect(() => {
    void loadPage();
  }, []);

  async function loadPage() {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) throw userErr;
      if (!user) throw new Error("No signed-in user found.");

      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, account_id, role, plan")
        .eq("id", user.id)
        .single();

      if (profileErr) throw profileErr;

      const typedProfile = profileRow as ProfileRow;
      setProfile(typedProfile);

      if (!typedProfile.account_id) {
        throw new Error("No account is linked to this user yet.");
      }

      const [customersRes, varietiesRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, business_name")
          .eq("account_id", typedProfile.account_id)
          .order("name", { ascending: true }),
        supabase
          .from("varieties")
          .select("id, variety, harvest_days")
          .eq("account_id", typedProfile.account_id)
          .is("disabled_at", null)
          .order("variety", { ascending: true }),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (varietiesRes.error) throw varietiesRes.error;

      const customerRows = (customersRes.data ?? []) as CustomerRow[];
      const varietyRows = (varietiesRes.data ?? []) as VarietyRow[];

      setCustomers(customerRows);
      setVarieties(varietyRows);

      if (customerRows.length > 0) {
        setCustomerMode("existing");
        setSelectedCustomerId(customerRows[0].id);
      }

      if (varietyRows.length > 0) {
        setLines([{ varietyId: varietyRows[0].id, quantity: "1" }]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load order page.");
    } finally {
      setLoading(false);
    }
  }

  const selectedCustomerName = useMemo(() => {
    const c = customers.find((x) => x.id === selectedCustomerId);
    return c?.business_name || c?.name || "";
  }, [customers, selectedCustomerId]);

  function updateLine(index: number, patch: Partial<OrderLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { varietyId: varieties[0]?.id ?? "", quantity: "1" },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function getOrCreateCustomer(accountId: string) {
    if (customerMode === "existing") {
      if (!selectedCustomerId) throw new Error("Please select a customer.");
      return selectedCustomerId;
    }

    const cleanName = newCustomerName.trim();
    if (!cleanName) throw new Error("Please enter a customer name.");

    const { data, error } = await supabase
      .from("customers")
      .insert({
        account_id: accountId,
        name: cleanName,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();

    if (!profile?.account_id) {
      setError("No account found for this user.");
      return;
    }

    if (!deliveryDate) {
      setError("Please choose a delivery date.");
      return;
    }

    const validLines = lines
      .map((line) => ({
        variety_id: line.varietyId,
        quantity: Number(line.quantity),
      }))
      .filter((line) => line.variety_id && line.quantity > 0);

    if (validLines.length === 0) {
      setError("Please add at least one order line.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const customerId = await getOrCreateCustomer(profile.account_id);

      const rows = validLines.map((line) => ({
        account_id: profile.account_id,
        customer_id: customerId,
        variety_id: line.variety_id,
        quantity: line.quantity,
        delivery_date: deliveryDate,
        status,
        notes: notes.trim() || null,
      }));

      const { error: insertErr } = await supabase.from("orders").insert(rows);

      if (insertErr) throw insertErr;

      navigate("/orders");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create order.");
    } finally {
      setSaving(false);
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

      <div style={card}>
        {error && <div style={errorBox}>{error}</div>}

        {profile && (
          <div style={metaBox}>
            <div>
              <strong>User:</strong> {profile.email ?? "—"}
            </div>
            <div>
              <strong>Plan:</strong> {profile.plan ?? "—"}
            </div>
          </div>
        )}

        {varieties.length === 0 ? (
          <div style={emptyBox}>
            No enabled varieties exist for this account. Add or seed varieties first.
          </div>
        ) : (
          <form onSubmit={handleCreateOrder} style={{ display: "grid", gap: 16 }}>
            <section style={section}>
              <h3 style={sectionTitle}>Customer</h3>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setCustomerMode("new")}
                  style={customerMode === "new" ? tabActive : tab}
                >
                  New Customer
                </button>
                <button
                  type="button"
                  disabled={customers.length === 0}
                  onClick={() => setCustomerMode("existing")}
                  style={customerMode === "existing" ? tabActive : tab}
                >
                  Existing Customer
                </button>
              </div>

              {customerMode === "new" ? (
                <label style={label}>
                  Customer Name
                  <input
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Best Restaurant Ever"
                    style={input}
                  />
                </label>
              ) : (
                <label style={label}>
                  Select Customer
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    style={input}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.business_name || c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {customerMode === "existing" && selectedCustomerName && (
                <div style={{ color: "#64748b", fontSize: 13 }}>
                  Selected: {selectedCustomerName}
                </div>
              )}
            </section>

            <section style={section}>
              <h3 style={sectionTitle}>Order Details</h3>

              <label style={label}>
                Delivery Date
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  style={input}
                />
              </label>

              <label style={label}>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="packed">Packed</option>
                  <option value="delivered">Delivered</option>
                </select>
              </label>
            </section>

            <section style={section}>
              <h3 style={sectionTitle}>Varieties</h3>

              {lines.map((line, index) => (
                <div key={index} style={lineGrid}>
                  <label style={label}>
                    Variety
                    <select
                      value={line.varietyId}
                      onChange={(e) => updateLine(index, { varietyId: e.target.value })}
                      style={input}
                    >
                      {varieties.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.variety}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={label}>
                    Trays
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      style={input}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                    style={dangerBtn}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button type="button" onClick={addLine} style={secondaryBtn}>
                + Add another variety
              </button>
            </section>

            <section style={section}>
              <label style={label}>
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  style={{ ...input, resize: "vertical" }}
                  placeholder="Delivery notes, packing notes, special requests..."
                />
              </label>
            </section>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" disabled={saving} style={primaryBtn}>
                {saving ? "Creating…" : "Create Order"}
              </button>

              <button type="button" onClick={() => navigate("/orders")} style={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 12,
  padding: 18,
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#fff",
  maxWidth: 940,
};

const errorBox: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #fecaca",
  fontWeight: 700,
  marginBottom: 12,
  whiteSpace: "pre-wrap",
};

const metaBox: React.CSSProperties = {
  marginBottom: 12,
  color: "#475569",
  fontSize: 14,
};

const emptyBox: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  borderRadius: 12,
  padding: 14,
  color: "#475569",
};

const section: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 14,
  border: "1px solid #f1f5f9",
  borderRadius: 14,
  background: "#ffffff",
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: 18,
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  color: "#0f172a",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 16,
  boxSizing: "border-box",
};

const lineGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 120px auto",
  gap: 10,
  alignItems: "end",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 999,
  border: "none",
  background: "#b91c1c",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const tab: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const tabActive: React.CSSProperties = {
  ...tab,
  background: "#047857",
  color: "#fff",
  border: "1px solid #047857",
};