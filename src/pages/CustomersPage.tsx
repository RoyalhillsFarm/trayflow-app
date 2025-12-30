// src/pages/CustomersPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import {
  getCustomers as getCustomersSB,
  addCustomer as addCustomerSB,
  updateCustomer as updateCustomerSB,
  type Customer,
} from "../lib/supabaseStorage";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const PRICE_TIERS = ["standard", "premium", "wholesale"] as const;
const PAYMENT_TERMS = ["due_on_receipt", "net_15", "net_30", "net_60"] as const;

type CustomerDraft = {
  name: string;
  contactName: string;
  email: string;
  phone: string;

  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;

  deliveryDays: string[]; // ✅ array (NOT string)
  deliveryWindow: string;
  dropoffInstructions: string;

  priceTier: string;
  paymentTerms: string;

  active: boolean;
};

function emptyDraft(): CustomerDraft {
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
    active: true,
  };
}

export default function CustomersPage() {
  const location = useLocation();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomerDraft>(emptyDraft());

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await getCustomersSB();
      setCustomers(data);
    } catch (err) {
      console.error("Error loading customers:", err);
      alert("Failed to load customers. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // reload when route changes (matches your app pattern)
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const activeCount = customers.filter((c) => c.active !== false).length;
  const archivedCount = customers.length - activeCount;

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return customers
      .filter((c) => {
        const isActive = c.active !== false;

        // Archived filter
        if (!showArchived && !isActive) return false;

        // Search filter
        if (!q) return true;

        const hay = [
          c.name,
          c.contactName ?? "",
          c.email ?? "",
          c.phone ?? "",
          (c as any).city ?? "",
          (c as any).state ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      })
      .sort((a, b) => {
        const aActive = a.active !== false;
        const bActive = b.active !== false;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [customers, searchTerm, showArchived]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const toggleDeliveryDay = (day: string, checked: boolean) => {
    setFormData((prev) => {
      const set = new Set(prev.deliveryDays);
      if (checked) set.add(day);
      else set.delete(day);
      return { ...prev, deliveryDays: Array.from(set) };
    });
  };

  const resetForm = () => {
    setFormData(emptyDraft());
    setEditingCustomerId(null);
  };

  const startEditing = (customer: Customer) => {
    setEditingCustomerId(customer.id);

    setFormData({
      name: customer.name ?? "",
      contactName: customer.contactName ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",

      // ✅ match your app field names
      addressLine1: (customer as any).addressLine1 ?? "",
      addressLine2: (customer as any).addressLine2 ?? "",
      city: (customer as any).city ?? "",
      state: (customer as any).state ?? "",
      zip: (customer as any).zip ?? "",

      // ✅ array
      deliveryDays: Array.isArray((customer as any).deliveryDays)
        ? ((customer as any).deliveryDays as string[])
        : [],

      deliveryWindow: (customer as any).deliveryWindow ?? "",
      dropoffInstructions: (customer as any).dropoffInstructions ?? "",

      priceTier: (customer as any).priceTier ?? "standard",
      paymentTerms: (customer as any).paymentTerms ?? "due_on_receipt",

      active: customer.active !== false,
    });

    // jump user to top so they see the form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Customer name is required.");
      return;
    }

    setLoading(true);
    try {
      if (editingCustomerId) {
        // ✅ update existing
        await updateCustomerSB(editingCustomerId, {
          ...formData,
        } as any);
      } else {
        // ✅ add new
        await addCustomerSB({
          ...formData,
        } as any);
      }

      await loadCustomers();
      resetForm();
    } catch (err) {
      console.error("Error saving customer:", err);
      alert("Failed to save customer. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const toggleCustomerStatus = async (customer: Customer) => {
    setLoading(true);
    try {
      const isActive = customer.active !== false;
      await updateCustomerSB(customer.id, { active: !isActive } as any);
      await loadCustomers();
    } catch (err) {
      console.error("Error updating customer:", err);
      alert("Failed to update customer. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (c: Customer) => {
    const a1 = (c as any).addressLine1 ?? "";
    const city = (c as any).city ?? "";
    const st = (c as any).state ?? "";
    const zip = (c as any).zip ?? "";

    const parts = [a1, [city, st, zip].filter(Boolean).join(" ")].filter(Boolean);
    return parts.join(", ");
  };

  const formatDelivery = (c: Customer) => {
    const days = Array.isArray((c as any).deliveryDays) ? ((c as any).deliveryDays as string[]) : [];
    const win = (c as any).deliveryWindow ?? "";
    const left = days.length ? `Delivery: ${days.join(", ")}` : "";
    const right = win ? `Window: ${win}` : "";
    return [left, right].filter(Boolean).join(" • ");
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Customers</h1>
          <div style={styles.statusPills}>
            <span style={{ ...styles.pill, ...(showArchived ? {} : styles.activePill) }}>
              Active: {activeCount}
            </span>
            <span style={{ ...styles.pill, ...(showArchived ? styles.activePill : {}) }}>
              Archived: {archivedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Search + filter */}
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="Search name, email, phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />

        <label style={styles.filterLabel}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={styles.checkbox}
          />
          Show archived customers
        </label>
      </div>

      {/* Add / Edit form */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={styles.cardTitle}>
              {editingCustomerId ? "Edit Customer" : "Add customer"}
            </h2>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Add the basics now. You can fill delivery windows, standing orders, and billing later.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {editingCustomerId ? (
              <button type="button" onClick={resetForm} style={styles.secondaryButton} disabled={loading}>
                Cancel
              </button>
            ) : null}
            <button form="customer-form" type="submit" style={styles.primaryButton} disabled={loading}>
              {loading ? "Saving..." : editingCustomerId ? "Save Changes" : "Add Customer"}
            </button>
          </div>
        </div>

        <form id="customer-form" onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Customer name *</label>
              <input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="e.g. Camino Restaurant"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Contact name</label>
              <input
                name="contactName"
                value={formData.contactName}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="e.g. Sam"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <input
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="orders@customer.com"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Phone</label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="(555) 555-5555"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Street address</label>
              <input
                name="addressLine1"
                value={formData.addressLine1}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="123 Main St"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Address line 2</label>
              <input
                name="addressLine2"
                value={formData.addressLine2}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="Suite 4B"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>City</label>
              <input name="city" value={formData.city} onChange={handleInputChange} style={styles.input} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>State</label>
              <input name="state" value={formData.state} onChange={handleInputChange} style={styles.input} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>ZIP</label>
              <input name="zip" value={formData.zip} onChange={handleInputChange} style={styles.input} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Delivery days</label>
              <div style={styles.checkboxGroup}>
                {DAYS_OF_WEEK.map((day) => (
                  <label key={day} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.deliveryDays.includes(day)}
                      onChange={(e) => toggleDeliveryDay(day, e.target.checked)}
                      style={styles.checkbox}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Delivery window</label>
              <input
                name="deliveryWindow"
                value={formData.deliveryWindow}
                onChange={handleInputChange}
                style={styles.input}
                placeholder="e.g. 7–9am"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Dropoff instructions</label>
              <textarea
                name="dropoffInstructions"
                value={formData.dropoffInstructions}
                onChange={handleInputChange}
                style={{ ...styles.input, minHeight: 80 }}
                rows={3}
                placeholder="e.g. Back door. Call on arrival. Leave in cooler."
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Price tier</label>
              <select name="priceTier" value={formData.priceTier} onChange={handleInputChange} style={styles.select}>
                {PRICE_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payment terms</label>
              <select
                name="paymentTerms"
                value={formData.paymentTerms}
                onChange={handleInputChange}
                style={styles.select}
              >
                {PAYMENT_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {term.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleInputChange}
                  style={styles.checkbox}
                />
                Active
              </label>
            </div>
          </div>
        </form>
      </div>

      {/* Customer list */}
      <div style={styles.customersList}>
        {filteredCustomers.length === 0 ? (
          <div style={styles.emptyState}>
            {showArchived ? "No archived customers found." : "No customers yet."}
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const isActive = customer.active !== false;

            const contactLine = [customer.contactName, customer.email, customer.phone]
              .filter(Boolean)
              .join(" • ");

            const addr = formatAddress(customer);
            const delivery = formatDelivery(customer);

            const tier = (customer as any).priceTier ? `Tier: ${(customer as any).priceTier}` : "";
            const terms = (customer as any).paymentTerms
              ? `Terms: ${String((customer as any).paymentTerms).replaceAll("_", " ")}`
              : "";
            const billing = [tier, terms].filter(Boolean).join(" • ");

            return (
              <div key={customer.id} style={styles.customerCard}>
                <div style={styles.customerInfo}>
                  <div style={styles.customerHeader}>
                    <h3 style={styles.customerName}>{customer.name}</h3>
                    <span
                      style={{
                        ...styles.statusBadge,
                        ...(isActive ? styles.activeBadge : styles.archivedBadge),
                      }}
                    >
                      {isActive ? "Active" : "Archived"}
                    </span>
                  </div>

                  {contactLine ? <div style={styles.customerDetail}>{contactLine}</div> : null}
                  {addr ? <div style={styles.customerDetail}>{addr}</div> : null}
                  {delivery ? <div style={styles.customerDetail}>{delivery}</div> : null}
                  {billing ? <div style={styles.customerDetail}>{billing}</div> : null}

                  {(customer as any).dropoffInstructions ? (
                    <div style={{ ...styles.customerDetail, fontStyle: "italic" }}>
                      {(customer as any).dropoffInstructions}
                    </div>
                  ) : null}
                </div>

                <div style={styles.customerActions}>
                  <button onClick={() => startEditing(customer)} style={styles.editButton} disabled={loading}>
                    Edit
                  </button>
                  <button
                    onClick={() => toggleCustomerStatus(customer)}
                    style={{
                      ...styles.toggleButton,
                      ...(isActive ? styles.archiveButton : styles.restoreButton),
                    }}
                    disabled={loading}
                  >
                    {isActive ? "Archive" : "Restore"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ----------------- Styles ----------------- */

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  title: {
    margin: 0,
    fontSize: 44,
    fontWeight: 900,
    color: "#0f172a",
  },
  statusPills: {
    display: "flex",
    gap: 10,
    marginTop: 10,
  },
  pill: {
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 700,
    backgroundColor: "#e2e8f0",
    color: "#334155",
  },
  activePill: {
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  searchInput: {
    flex: 1,
    minWidth: 240,
    maxWidth: 520,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    background: "#fff",
  },
  filterLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#0f172a",
  },
  checkbox: {
    width: 16,
    height: 16,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    padding: 18,
    marginBottom: 18,
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
    color: "#0f172a",
  },
  formGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 14,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },
  input: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    fontSize: 16,
    background: "#fff",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    backgroundColor: "white",
    fontSize: 16,
  },
  checkboxGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#0f172a",
  },
  primaryButton: {
    padding: "12px 18px",
    borderRadius: 999,
    border: "none",
    background: "#047857",
    color: "#fff",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  customersList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  customerCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    backgroundColor: "white",
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    gap: 14,
  },
  customerInfo: {
    flex: 1,
    minWidth: 0,
  },
  customerHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  customerName: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
    color: "#0f172a",
  },
  statusBadge: {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  activeBadge: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  archivedBadge: {
    backgroundColor: "#fee2e2",
    color: "#991b1b",
  },
  customerDetail: {
    fontSize: 14,
    color: "#475569",
    marginTop: 3,
    lineHeight: 1.4,
  },
  customerActions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "flex-end",
  },
  editButton: {
    padding: "10px 14px",
    backgroundColor: "#f1f5f9",
    color: "#0f172a",
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  toggleButton: {
    padding: "10px 14px",
    border: "1px solid transparent",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  archiveButton: {
    backgroundColor: "#fff",
    color: "#b91c1c",
    border: "1px solid #fecaca",
  },
  restoreButton: {
    backgroundColor: "#fff",
    color: "#166534",
    border: "1px solid #bbf7d0",
  },
  emptyState: {
    padding: 28,
    textAlign: "left",
    color: "#64748b",
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    fontSize: 16,
    fontWeight: 700,
  },
};
