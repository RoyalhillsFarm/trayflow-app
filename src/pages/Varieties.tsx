// src/pages/Varieties.tsx

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type Variety = {
  id: string;
  account_id: string;

  variety: string;
  scientific_name?: string | null;

  harvest_days?: number | null;
  soak_hours?: number | null;
  blackout_days?: number | null;

  seed_weight_g_1020?: number | null;
  expected_yield_oz_1020?: number | null;

  difficulty?: string | null;
  flavor_profile?: string | null;
  best_uses?: string | null;
  chef_notes?: string | null;
  pro_tips?: string | null;

  disabled_at?: string | null;
};

const EMPTY_FORM = {
  variety: "",
  scientific_name: "",

  harvest_days: "",
  soak_hours: "",
  blackout_days: "",

  seed_weight_g_1020: "",
  expected_yield_oz_1020: "",

  difficulty: "",
  flavor_profile: "",
  best_uses: "",
  chef_notes: "",
  pro_tips: "",
};

function getPlanLimit(plan?: string | null) {
  if (plan === "sprout") return 10;
  if (plan === "farmer") return 35;
  return Infinity;
}

export default function VarietiesPage() {
  const [loading, setLoading] = useState(true);

  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [plan, setPlan] = useState<string>("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<any>(EMPTY_FORM);

  useEffect(() => {
    void loadVarieties();
  }, []);

  async function getAccountInfo() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("User not found.");
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("account_id, plan")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    if (!data?.account_id) {
      throw new Error("Account not found.");
    }

    return {
      accountId: data.account_id as string,
      plan: (data.plan as string) || "free",
    };
  }

  async function loadVarieties() {
    try {
      setLoading(true);

      const info = await getAccountInfo();

      setPlan(info.plan);

      const { data, error } = await supabase
        .from("varieties")
        .select("*")
        .eq("account_id", info.accountId)
        .is("disabled_at", null)
        .order("variety", { ascending: true });

      if (error) throw error;

      const deduped = new Map<string, Variety>();

      for (const row of data || []) {
        const key = String(row.variety || "")
          .trim()
          .toLowerCase();

        if (!key) continue;

        if (!deduped.has(key)) {
          deduped.set(key, row as Variety);
        }
      }

      setVarieties(Array.from(deduped.values()));
    } catch (err: any) {
      alert(err.message || "Failed to load varieties.");
    } finally {
      setLoading(false);
    }
  }

  const activeCount = useMemo(() => {
    return varieties.length;
  }, [varieties]);

  const maxVarieties = getPlanLimit(plan);

  function openAddForm() {
    setEditingId("new");
    setForm(EMPTY_FORM);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openEditForm(v: Variety) {
    setEditingId(v.id);

    setForm({
      variety: v.variety || "",
      scientific_name: v.scientific_name || "",

      harvest_days: v.harvest_days ?? "",
      soak_hours: v.soak_hours ?? "",
      blackout_days: v.blackout_days ?? "",

      seed_weight_g_1020: v.seed_weight_g_1020 ?? "",
      expected_yield_oz_1020: v.expected_yield_oz_1020 ?? "",

      difficulty: v.difficulty || "",
      flavor_profile: v.flavor_profile || "",
      best_uses: v.best_uses || "",
      chef_notes: v.chef_notes || "",
      pro_tips: v.pro_tips || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function updateField(key: string, value: string) {
    setForm((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  }

  function buildPayload(accountId: string) {
    const numericFields = [
      "harvest_days",
      "soak_hours",
      "blackout_days",
      "seed_weight_g_1020",
      "expected_yield_oz_1020",
    ];

    const payload: any = {
      account_id: accountId,
    };

    for (const [key, value] of Object.entries(form)) {
      if (numericFields.includes(key)) {
        payload[key] = value === "" ? null : Number(value);
      } else {
        payload[key] = String(value ?? "").trim() || null;
      }
    }

    return payload;
  }

  async function saveVariety() {
    try {
      const varietyName = String(form.variety || "").trim();

      if (!varietyName) {
        alert("Variety name is required.");
        return;
      }

      const info = await getAccountInfo();

      const limit = getPlanLimit(info.plan);

      if (editingId === "new" && varieties.length >= limit) {
        alert(
          `You’ve reached the maximum varieties for the ${info.plan} plan.\n\nDisable a variety before adding another one or upgrade your plan.`
        );
        return;
      }

      const duplicate = varieties.find(
        (v) =>
          v.id !== editingId &&
          v.variety.trim().toLowerCase() ===
            varietyName.trim().toLowerCase()
      );

      if (duplicate) {
        alert("That variety already exists.");
        return;
      }

      const payload = buildPayload(info.accountId);

      if (editingId === "new") {
        const { error } = await supabase
          .from("varieties")
          .insert(payload);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("varieties")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
      }

      setEditingId(null);

      setForm(EMPTY_FORM);

      await loadVarieties();
    } catch (err: any) {
      alert(err.message || "Failed to save variety.");
    }
  }

  async function disableVariety(id: string) {
    const confirmed = window.confirm(
      "Disable this variety?"
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("varieties")
        .update({
          disabled_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      await loadVarieties();
    } catch (err: any) {
      alert(err.message || "Failed to disable variety.");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Varieties</h1>
        <p>Loading varieties...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Varieties</h1>

      <p className="page-text">
        {activeCount} active varieties
        {Number.isFinite(maxVarieties)
          ? ` / ${maxVarieties} max on ${plan} plan`
          : ` / unlimited`}
      </p>

      <button style={greenBtn} onClick={openAddForm}>
        + Add Variety
      </button>

      {editingId && (
        <div style={editorCard}>
          <h2 style={{ marginTop: 0 }}>
            {editingId === "new"
              ? "Add Variety"
              : "Edit Variety"}
          </h2>

          <div style={formGrid}>
            <Field
              label="variety"
              value={form.variety}
              onChange={(v) =>
                updateField("variety", v)
              }
            />

            <Field
              label="scientific name"
              value={form.scientific_name}
              onChange={(v) =>
                updateField("scientific_name", v)
              }
            />

            <Field
              label="harvest days"
              value={form.harvest_days}
              onChange={(v) =>
                updateField("harvest_days", v)
              }
            />

            <Field
              label="soak hours"
              value={form.soak_hours}
              onChange={(v) =>
                updateField("soak_hours", v)
              }
            />

            <Field
              label="blackout days"
              value={form.blackout_days}
              onChange={(v) =>
                updateField("blackout_days", v)
              }
            />

            <Field
              label="seed weight g 1020"
              value={form.seed_weight_g_1020}
              onChange={(v) =>
                updateField(
                  "seed_weight_g_1020",
                  v
                )
              }
            />

            <Field
              label="expected yield oz 1020"
              value={form.expected_yield_oz_1020}
              onChange={(v) =>
                updateField(
                  "expected_yield_oz_1020",
                  v
                )
              }
            />

            <Field
              label="difficulty"
              value={form.difficulty}
              onChange={(v) =>
                updateField("difficulty", v)
              }
            />

            <Field
              label="flavor profile"
              value={form.flavor_profile}
              onChange={(v) =>
                updateField("flavor_profile", v)
              }
            />

            <Field
              label="best uses"
              value={form.best_uses}
              onChange={(v) =>
                updateField("best_uses", v)
              }
            />

            <Field
              label="chef notes"
              value={form.chef_notes}
              onChange={(v) =>
                updateField("chef_notes", v)
              }
            />

            <Field
              label="pro tips"
              value={form.pro_tips}
              onChange={(v) =>
                updateField("pro_tips", v)
              }
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              style={greenBtn}
              onClick={saveVariety}
            >
              Save Variety
            </button>

            <button
              style={whiteBtn}
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={cardsGrid}>
        {varieties.map((v) => (
          <div key={v.id} style={card}>
            <div style={cardHeader}>
              <div>
                <h2 style={title}>
                  {v.variety}
                </h2>

                <div style={muted}>
                  {v.scientific_name ||
                    "Scientific name not listed"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  style={whiteBtn}
                  onClick={() =>
                    openEditForm(v)
                  }
                >
                  Edit
                </button>

                <button
                  style={redBtn}
                  onClick={() =>
                    disableVariety(v.id)
                  }
                >
                  Disable
                </button>
              </div>
            </div>

            <div style={detailGrid}>
              <Detail
                label="Harvest"
                value={v.harvest_days}
              />

              <Detail
                label="Soak"
                value={v.soak_hours}
              />

              <Detail
                label="Blackout"
                value={v.blackout_days}
              />

              <Detail
                label="Seed g / 1020"
                value={v.seed_weight_g_1020}
              />

              <Detail
                label="Yield oz / 1020"
                value={
                  v.expected_yield_oz_1020
                }
              />
            </div>

            <TextBlock
              label="Flavor"
              value={v.flavor_profile}
            />

            <TextBlock
              label="Best Uses"
              value={v.best_uses}
            />

            <TextBlock
              label="Chef Notes"
              value={v.chef_notes}
            />

            <TextBlock
              label="Pro Tips"
              value={v.pro_tips}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={fieldLabel}>
      {label}

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        style={input}
      />
    </label>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div style={detailCard}>
      <div style={detailLabel}>
        {label}
      </div>

      <div style={detailValue}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;

  return (
    <div style={textCard}>
      <strong>{label}</strong>

      <div>{value}</div>
    </div>
  );
}

const greenBtn: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const whiteBtn: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const redBtn: React.CSSProperties = {
  ...greenBtn,
  background: "#b91c1c",
};

const editorCard: React.CSSProperties = {
  marginTop: 24,
  marginBottom: 24,
  padding: 24,
  background: "#fff",
  borderRadius: 20,
  border: "2px solid #047857",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(220px,1fr))",
  gap: 16,
  marginBottom: 20,
};

const fieldLabel: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontWeight: 800,
};

const input: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 15,
};

const cardsGrid: React.CSSProperties = {
  display: "grid",
  gap: 20,
  marginTop: 24,
  maxWidth: 1100,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 20,
  padding: 24,
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 20,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 36,
  fontWeight: 900,
};

const muted: React.CSSProperties = {
  color: "#64748b",
  marginTop: 6,
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(170px,1fr))",
  gap: 14,
  marginTop: 20,
};

const detailCard: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
};

const detailLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 900,
};

const detailValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 900,
};

const textCard: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  background: "#f8fafc",
  color: "#475569",
};