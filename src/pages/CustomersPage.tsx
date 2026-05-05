import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

/* ---------------- TYPES ---------------- */
type Customer = any;

/* ---------------- CONSTANTS ---------------- */
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const PRICE_TIERS = ["standard", "premium", "wholesale"] as const;
const PAYMENT_TERMS = ["due_on_receipt", "net_15", "net_30", "net_60"] as const;

/* ---------------- ACCOUNT HELPER ---------------- */
async function getAccountId() {
  const { data: userData } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", userData.user?.id)
    .single();

  return profile?.account_id;
}

/* ---------------- DRAFT ---------------- */
function emptyDraft() {
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

/* ---------------- PAGE ---------------- */
export default function CustomersPage() {
  const location = useLocation();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>(emptyDraft());

  /* ---------------- LOAD ---------------- */
  const loadCustomers = async () => {
    setLoading(true);

    const accountId = await getAccountId();

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("account_id", accountId)
      .order("name");

    if (error) {
      console.error(error);
      alert("Failed to load customers");
    }

    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadCustomers();
  }, [location.key]);

  /* ---------------- SAVE ---------------- */
  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Customer name required");
      return;
    }

    const accountId = await getAccountId();

    if (editingCustomerId) {
      await supabase
        .from("customers")
        .update(formData)
        .eq("id", editingCustomerId);
    } else {
      await supabase.from("customers").insert({
        ...formData,
        account_id: accountId,
      });
    }

    setFormData(emptyDraft());
    setEditingCustomerId(null);
    loadCustomers();
  };

  /* ---------------- EDIT ---------------- */
  const startEditing = (c: any) => {
    setEditingCustomerId(c.id);
    setFormData(c);
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ padding: 20 }}>
      <h1>Customers</h1>

      {/* FORM */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Customer name"
        />

        <button type="submit">
          {editingCustomerId ? "Update" : "Add"} Customer
        </button>
      </form>

      {/* LIST */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        customers.map((c) => (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <strong>{c.name}</strong>

            <button onClick={() => startEditing(c)}>Edit</button>
          </div>
        ))
      )}
    </div>
  );
}