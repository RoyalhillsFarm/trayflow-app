// src/pages/CustomersPage.tsx
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  type Customer,
} from "../lib/supabaseStorage";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function emptyDraft(): Omit<Customer, "id"> {
  return {
    name: "",
    contactName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    deliveryDays: [],
    deliveryWindow: "",
    dropoffInstructions: "",
    priceTier: "standard",
    paymentTerms: "due_on_receipt",
    preferredPaymentMethod: "",
    taxExempt: false,
    packagingPrefs: {},
    tags: [],
    standingOrders: [],
    notes: "",
    active: true,
  };
}

export default function CustomersPage() {
  const location = useLocation();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Customer, "id">>(emptyDraft());

  useEffect(() => {
    void loadCustomers();
  }, [location.key]);

  async function loadCustomers() {
    try {
      setLoading(true);
      const rows = await getCustomers();
      setCustomers(rows);
    } catch (e: any) {
      alert(e?.message ?? "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: keyof Omit<Customer, "id">, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDeliveryDay(day: string) {
    const current = form.deliveryDays ?? [];
    updateField(
      "deliveryDays",
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day]
    );
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      contactName: c.contactName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      addressLine1: c.addressLine1 ?? "",
      addressLine2: c.addressLine2 ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      zip: c.zip ?? "",
      deliveryDays: c.deliveryDays ?? [],
      deliveryWindow: c.deliveryWindow ?? "",
      dropoffInstructions: c.dropoffInstructions ?? "",
      priceTier: c.priceTier ?? "standard",
      paymentTerms: c.paymentTerms ?? "due_on_receipt",
      preferredPaymentMethod: c.preferredPaymentMethod ?? "",
      taxExempt: c.taxExempt ?? false,
      packagingPrefs: c.packagingPrefs ?? {},
      tags: c.tags ?? [],
      standingOrders: c.standingOrders ?? [],
      notes: c.notes ?? "",
      active: c.active ?? true,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyDraft());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.name?.trim()) {
      alert("Customer name is required.");
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        await updateCustomer(editingId, form);
      } else {
        await addCustomer(form);
      }

      cancelEdit();
      await loadCustomers();
    } catch (e: any) {
      alert(e?.message ?? "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCustomer(c: Customer) {
    const ok = window.confirm(`Deactivate ${c.name}?`);
    if (!ok) return;

    try {
      await updateCustomer(c.id, { active: false });
      await loadCustomers();
    } catch (e: any) {
      alert(e?.message ?? "Failed to deactivate customer.");
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Customers</h1>

      <form onSubmit={handleSubmit} style={card}>
        <h2 style={sectionTitle}>
          {editingId ? "Edit Customer" : "Add Customer"}
        </h2>

        <div style={grid}>
          <label style={label}>
            Customer Name *
            <input
              value={form.name ?? ""}
              onChange={(e) => updateField("name", e.target.value)}
              style={input}
              placeholder="Best Restaurant Ever"
            />
          </label>

          <label style={label}>
            Contact Name
            <input
              value={form.contactName ?? ""}
              onChange={(e) => updateField("contactName", e.target.value)}
              style={input}
              placeholder="Chef Maria"
            />
          </label>

          <label style={label}>
            Email
            <input
              value={form.email ?? ""}
              onChange={(e) => updateField("email", e.target.value)}
              style={input}
              placeholder="chef@example.com"
            />
          </label>

          <label style={label}>
            Phone
            <input
              value={form.phone ?? ""}
              onChange={(e) => updateField("phone", e.target.value)}
              style={input}
              placeholder="(510) 555-0101"
            />
          </label>

          <label style={label}>
            Address Line 1
            <input
              value={form.addressLine1 ?? ""}
              onChange={(e) => updateField("addressLine1", e.target.value)}
              style={input}
            />
          </label>

          <label style={label}>
            Address Line 2
            <input
              value={form.addressLine2 ?? ""}
              onChange={(e) => updateField("addressLine2", e.target.value)}
              style={input}
            />
          </label>

          <label style={label}>
            City
            <input
              value={form.city ?? ""}
              onChange={(e) => updateField("city", e.target.value)}
              style={input}
            />
          </label>

          <label style={label}>
            State
            <input
              value={form.state ?? ""}
              onChange={(e) => updateField("state", e.target.value)}
              style={input}
              placeholder="CA"
            />
          </label>

          <label style={label}>
            Zip
            <input
              value={form.zip ?? ""}
              onChange={(e) => updateField("zip", e.target.value)}
              style={input}
            />
          </label>

          <label style={label}>
            Delivery Window
            <input
              value={form.deliveryWindow ?? ""}
              onChange={(e) => updateField("deliveryWindow", e.target.value)}
              style={input}
              placeholder="Tuesdays 9–11am"
            />
          </label>

          <label style={label}>
            Price Tier
            <select
              value={form.priceTier ?? "standard"}
              onChange={(e) => updateField("priceTier", e.target.value)}
              style={input}
            >
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </label>

          <label style={label}>
            Payment Terms
            <select
              value={form.paymentTerms ?? "due_on_receipt"}
              onChange={(e) => updateField("paymentTerms", e.target.value)}
              style={input}
            >
              <option value="due_on_receipt">Due on receipt</option>
              <option value="net_15">Net 15</option>
              <option value="net_30">Net 30</option>
              <option value="net_60">Net 60</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={label}>Delivery Days</div>
          <div style={pillWrap}>
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDeliveryDay(day)}
                style={
                  form.deliveryDays?.includes(day) ? activePill : pill
                }
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <label style={{ ...label, marginTop: 14 }}>
          Dropoff Instructions
          <textarea
            value={form.dropoffInstructions ?? ""}
            onChange={(e) => updateField("dropoffInstructions", e.target.value)}
            style={textarea}
            rows={3}
          />
        </label>

        <label style={{ ...label, marginTop: 14 }}>
          Notes
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => updateField("notes", e.target.value)}
            style={textarea}
            rows={3}
          />
        </label>

        <label style={{ ...checkRow, marginTop: 14 }}>
          <input
            type="checkbox"
            checked={form.active !== false}
            onChange={(e) => updateField("active", e.target.checked)}
          />
          Active customer
        </label>

        <div style={actions}>
          <button type="submit" disabled={saving} style={primaryBtn}>
            {saving
              ? "Saving..."
              : editingId
              ? "Update Customer"
              : "Add Customer"}
          </button>

          {editingId && (
            <button type="button" onClick={cancelEdit} style={secondaryBtn}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <section style={{ marginTop: 24 }}>
        <h2 style={sectionTitle}>Customer List</h2>

        {loading ? (
          <p>Loading...</p>
        ) : customers.length === 0 ? (
          <div style={emptyBox}>
            No customers yet. Add your first customer above, then they’ll appear on the New Order page.
          </div>
        ) : (
          <div style={list}>
            {customers.map((c) => (
              <div key={c.id} style={customerCard}>
                <div>
                  <h3 style={customerName}>{c.name}</h3>
                  <div style={muted}>
                    {c.contactName || "No contact"}{" "}
                    {c.email ? `• ${c.email}` : ""}{" "}
                    {c.phone ? `• ${c.phone}` : ""}
                  </div>
                  <div style={muted}>
                    {c.city || c.state
                      ? `${c.city ?? ""}${c.city && c.state ? ", " : ""}${c.state ?? ""}`
                      : "No address listed"}
                  </div>
                  <div style={muted}>
                    Days: {(c.deliveryDays ?? []).join(", ") || "Not set"} • Terms:{" "}
                    {c.paymentTerms ?? "due_on_receipt"}
                  </div>
                </div>

                <div style={cardActions}>
                  <button onClick={() => startEdit(c)} style={secondaryBtn}>
                    Edit
                  </button>
                  <button onClick={() => deactivateCustomer(c)} style={dangerBtn}>
                    Deactivate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 18,
  padding: 22,
  maxWidth: 1100,
};

const sectionTitle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 14,
};

const label: CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  color: "#0f172a",
};

const input: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 15,
  boxSizing: "border-box",
};

const textarea: CSSProperties = {
  ...input,
  resize: "vertical",
};

const pillWrap: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 8,
};

const pill: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const activePill: CSSProperties = {
  ...pill,
  background: "#047857",
  color: "#fff",
  border: "1px solid #047857",
};

const checkRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
};

const actions: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap",
};

const primaryBtn: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  ...primaryBtn,
  background: "#b91c1c",
};

const emptyBox: CSSProperties = {
  background: "#fff",
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  padding: 18,
  color: "#64748b",
};

const list: CSSProperties = {
  display: "grid",
  gap: 14,
  maxWidth: 1100,
};

const customerCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 18,
  padding: 18,
};

const customerName: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
};

const muted: CSSProperties = {
  color: "#64748b",
  marginTop: 4,
};

const cardActions: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};