function CustomersPage() {
  type CustomerRow = {
    id: string;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;

    delivery_address_line1: string | null;
    delivery_address_line2: string | null;
    delivery_city: string | null;
    delivery_state: string | null;
    delivery_zip: string | null;
    delivery_instructions: string | null;

    invoice_email: string | null;
    payment_terms: string | null;
    notes: string | null;

    created_at: string | null;
  };

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setAddress1("");
    setAddress2("");
    setCity("");
    setStateProv("");
    setZip("");
    setDeliveryNotes("");
    setInvoiceEmail("");
    setPaymentTerms("");
    setNotes("");
  };

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setError(error.message);
      setCustomers([]);
    } else {
      setCustomers((data ?? []) as CustomerRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please enter a customer name.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,

      delivery_address_line1: address1.trim() || null,
      delivery_address_line2: address2.trim() || null,
      delivery_city: city.trim() || null,
      delivery_state: stateProv.trim() || null,
      delivery_zip: zip.trim() || null,
      delivery_instructions: deliveryNotes.trim() || null,

      invoice_email: invoiceEmail.trim() || null,
      payment_terms: paymentTerms.trim() || null,
      notes: notes.trim() || null,
    };

    const { data, error } = await supabase
      .from("customers")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setSaving(false);
      alert(`Save failed: ${error.message}`);
      return;
    }

    // insert into list + keep alpha order
    setCustomers((prev) =>
      [...prev, data as CustomerRow].sort((a, b) => a.name.localeCompare(b.name))
    );

    resetForm();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const ok = confirm(
      "Delete this customer? (If orders depend on this customer, Supabase may block the delete.)"
    );
    if (!ok) return;

    // Optimistic UI
    const prev = customers;
    setCustomers((cur) => cur.filter((c) => c.id !== id));

    const { error } = await supabase.from("customers").delete().eq("id", id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      setCustomers(prev);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.45rem 0.6rem",
    borderRadius: 8,
    border: "1px solid #cbd5f5",
    fontSize: 14,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "0.25rem",
    fontSize: 14,
    color: "#0f172a",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontWeight: 700,
    marginTop: "0.9rem",
    marginBottom: "0.4rem",
    color: "#0f172a",
  };

  return (
    <div className="page">
      <h1 className="page-title">Customers</h1>

      <form
        onSubmit={handleAddCustomer}
        style={{ marginTop: "0.75rem", maxWidth: 900 }}
      >
        {/* Basic */}
        <div style={sectionTitleStyle}>Customer</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div>
            <label style={labelStyle}>Customer / Business name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Camino Restaurant"
            />
          </div>

          <div>
            <label style={labelStyle}>Contact name</label>
            <input
              style={inputStyle}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Chef Maria"
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
            />
          </div>
        </div>

        {/* Delivery */}
        <div style={sectionTitleStyle}>Delivery</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div>
            <label style={labelStyle}>Address line 1</label>
            <input
              style={inputStyle}
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              placeholder="Street address"
            />
          </div>

          <div>
            <label style={labelStyle}>Address line 2</label>
            <input
              style={inputStyle}
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              placeholder="Suite / unit / floor (optional)"
            />
          </div>

          <div>
            <label style={labelStyle}>City</label>
            <input
              style={inputStyle}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div>
              <label style={labelStyle}>State</label>
              <input
                style={inputStyle}
                value={stateProv}
                onChange={(e) => setStateProv(e.target.value)}
                placeholder="State"
              />
            </div>
            <div>
              <label style={labelStyle}>ZIP</label>
              <input
                style={inputStyle}
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="ZIP"
              />
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Delivery instructions</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="e.g. Deliver to back door. Call on arrival."
            />
          </div>
        </div>

        {/* Billing + Notes */}
        <div style={sectionTitleStyle}>Billing & Notes</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div>
            <label style={labelStyle}>Invoice email</label>
            <input
              style={inputStyle}
              value={invoiceEmail}
              onChange={(e) => setInvoiceEmail(e.target.value)}
              placeholder="billing@example.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Payment terms</label>
            <input
              style={inputStyle}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 7, Net 14, COD"
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Internal notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Prefers sunflower. Weekly standing order on Tuesdays."
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: 999,
              border: "none",
              background: "#047857",
              color: "white",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {saving ? "Saving..." : "Add Customer"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: 999,
              border: "1px solid #cbd5f5",
              background: "#ffffff",
              color: "#0f172a",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {/* List */}
      <div style={{ marginTop: "1.25rem", maxWidth: 900 }}>
        {loading && <p className="page-text">Loading…</p>}

        {error && (
          <p className="page-text" style={{ color: "#b91c1c" }}>
            Error: {error}
          </p>
        )}

        {!loading && !error && customers.length === 0 && (
          <p className="page-text">No customers yet. Add your first one above.</p>
        )}

        {!loading && !error && customers.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            {customers.map((c) => {
              const addressLine = [
                c.delivery_address_line1,
                c.delivery_address_line2,
              ]
                .filter(Boolean)
                .join(", ");

              const cityLine = [c.delivery_city, c.delivery_state, c.delivery_zip]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  key={c.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    marginBottom: "0.5rem",
                    background: "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ flex: "1 1 auto" }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>

                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "#64748b",
                        marginTop: "0.25rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      {c.contact_name && <span>Contact: {c.contact_name}</span>}
                      {c.email && <span>Email: {c.email}</span>}
                      {c.phone && <span>Phone: {c.phone}</span>}
                    </div>

                    {(addressLine || cityLine) && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "#64748b",
                          marginTop: "0.25rem",
                        }}
                      >
                        Delivery:{" "}
                        {[addressLine, cityLine].filter(Boolean).join(" • ")}
                      </div>
                    )}

                    {c.delivery_instructions && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "#64748b",
                          marginTop: "0.25rem",
                        }}
                      >
                        Notes: {c.delivery_instructions}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    style={{
                      padding: "0.3rem 0.8rem",
                      borderRadius: 999,
                      border: "1px solid #cbd5f5",
                      background: "#ffffff",
                      color: "#0f172a",
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && !error && (
        <div style={{ marginTop: "0.75rem", fontSize: 12, color: "#64748b" }}>
          {customers.length} customers
        </div>
      )}
    </div>
  );
}
