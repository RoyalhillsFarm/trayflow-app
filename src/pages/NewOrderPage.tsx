// src/pages/NewOrderPage.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type VarietyRow = {
  id: string;
  variety: string;
  account_id: string;
  disabled_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  account_id: string | null;
  role: string | null;
  plan: string | null;
};

export default function NewOrderPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);

  const [selectedVarietyId, setSelectedVarietyId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

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
        setVarieties([]);
        setError("No account is linked to this user yet.");
        return;
      }

      const { data: varietyRows, error: varietyErr } = await supabase
        .from("varieties")
        .select("id, variety, account_id, disabled_at")
        .eq("account_id", typedProfile.account_id)
        .is("disabled_at", null)
        .order("variety", { ascending: true });

      if (varietyErr) throw varietyErr;

      const unique = new Map<string, VarietyRow>();
      for (const row of (varietyRows ?? []) as VarietyRow[]) {
        if (!unique.has(row.id)) unique.set(row.id, row);
      }

      const filtered = Array.from(unique.values());

      setVarieties(filtered);

      if (filtered.length > 0) {
        setSelectedVarietyId(filtered[0].id);
      } else {
        setSelectedVarietyId("");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load order page.");
      setVarieties([]);
      setSelectedVarietyId("");
    } finally {
      setLoading(false);
    }
  }

  const selectedVariety = useMemo(
    () => varieties.find((v) => v.id === selectedVarietyId) ?? null,
    [varieties, selectedVarietyId]
  );

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();

    if (!profile?.account_id) {
      setError("No account found for this user.");
      return;
    }

    if (!selectedVarietyId) {
      setError("Please select a variety.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // NOTE:
      // This insert is intentionally minimal so it does not guess your full schema.
      // If your orders table requires more columns, keep your existing save logic
      // and only preserve the account-filtered variety loading from this file.
      const { error: insertErr } = await supabase.from("orders").insert({
        account_id: profile.account_id,
        notes: notes || null,
      });

      if (insertErr) throw insertErr;

      alert(
        `Order shell created for ${selectedVariety?.variety ?? "selected variety"}. ` +
          `If your orders table needs more required fields, keep your existing submit logic and only use this page's filtered variety-loading logic.`
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to create order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">New Order</h1>

      <div
        style={{
          marginTop: 12,
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          background: "#fff",
          maxWidth: 760,
        }}
      >
        {loading && <p className="page-text">Loading…</p>}

        {!loading && error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #fecaca",
              fontWeight: 700,
              marginBottom: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && profile && (
          <div style={{ marginBottom: 12, color: "#475569", fontSize: 14 }}>
            <div>
              <strong>User:</strong> {profile.email ?? "—"}
            </div>
            <div>
              <strong>Plan:</strong> {profile.plan ?? "—"}
            </div>
            <div>
              <strong>Account ID:</strong> {profile.account_id ?? "—"}
            </div>
          </div>
        )}

        {!loading && !error && varieties.length === 0 && (
          <div
            style={{
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 12,
              padding: 14,
              color: "#475569",
            }}
          >
            No enabled varieties exist for this account. Add or seed varieties first.
          </div>
        )}

        {!loading && varieties.length > 0 && (
          <form onSubmit={handleCreateOrder} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Variety</span>
              <select
                value={selectedVarietyId}
                onChange={(e) => setSelectedVarietyId(e.target.value)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                }}
              >
                {varieties.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.variety}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Quantity</span>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                  maxWidth: 180,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                  resize: "vertical",
                }}
              />
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "12px 18px",
                  borderRadius: 999,
                  border: "none",
                  background: "#047857",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : "Create Order"}
              </button>

              {selectedVariety && (
                <span style={{ color: "#64748b", fontSize: 14 }}>
                  Selected: {selectedVariety.variety}
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}