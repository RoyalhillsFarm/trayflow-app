// src/pages/Varieties.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type Variety = {
  id: string;
  variety: string;
  scientific_name?: string | null;
  harvest_days?: number | null;
  soak_hours?: number | null;
  blackout_days?: number | null;
  light_days?: number | null;
  seed_weight_g_1020?: number | null;
  expected_yield_oz_1020?: number | null;
  difficulty?: string | null;
  flavor_profile?: string | null;
  best_uses?: string | null;
  chef_notes?: string | null;
  pro_tips?: string | null;
  disabled_at?: string | null;
  account_id: string;
};

const EMPTY = {
  variety: "",
  scientific_name: "",
  harvest_days: "",
  soak_hours: "",
  blackout_days: "",
  light_days: "",
  seed_weight_g_1020: "",
  expected_yield_oz_1020: "",
  difficulty: "",
  flavor_profile: "",
  best_uses: "",
  chef_notes: "",
  pro_tips: "",
};

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY);

  useEffect(() => {
    void loadVarieties();
  }, []);

  async function getAccountId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found.");

    const { data, error } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    if (!data?.account_id) throw new Error("No account found.");

    return data.account_id as string;
  }

  async function loadVarieties() {
    setLoading(true);
    try {
      const accountId = await getAccountId();

      const { data, error } = await supabase
        .from("varieties")
        .select("*")
        .eq("account_id", accountId)
        .is("disabled_at", null)
        .order("variety", { ascending: true });

      if (error) throw error;

      const map = new Map<string, Variety>();
      for (const row of data ?? []) {
        const key = String(row.variety ?? "").trim().toLowerCase();
        if (!key || map.has(key)) continue;
        map.set(key, row as Variety);
      }

      setVarieties(Array.from(map.values()));
    } catch (e: any) {
      alert(e?.message ?? "Failed to load varieties.");
    } finally {
      setLoading(false);
    }
  }

  const total = useMemo(() => varieties.length, [varieties]);

  function startAdd() {
    setEditingId("new");
    setForm(EMPTY);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(v: Variety) {
    setEditingId(v.id);
    setForm({
      variety: v.variety ?? "",
      scientific_name: v.scientific_name ?? "",
      harvest_days: v.harvest_days ?? "",
      soak_hours: v.soak_hours ?? "",
      blackout_days: v.blackout_days ?? "",
      light_days: v.light_days ?? "",
      seed_weight_g_1020: v.seed_weight_g_1020 ?? "",
      expected_yield_oz_1020: v.expected_yield_oz_1020 ?? "",
      difficulty: v.difficulty ?? "",
      flavor_profile: v.flavor_profile ?? "",
      best_uses: v.best_uses ?? "",
      chef_notes: v.chef_notes ?? "",
      pro_tips: v.pro_tips ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cleanPayload(accountId: string) {
    const numberFields = [
      "harvest_days",
      "soak_hours",
      "blackout_days",
      "light_days",
      "seed_weight_g_1020",
      "expected_yield_oz_1020",
    ];

    const payload: any = { account_id: accountId };

    for (const [key, value] of Object.entries(form)) {
      if (numberFields.includes(key)) {
        payload[key] = value === "" ? null : Number(value);
      } else {
        payload[key] = String(value ?? "").trim() || null;
      }
    }

    return payload;
  }

  async function saveVariety() {
    if (!String(form.variety ?? "").trim()) {
      alert("Variety name is required.");
      return;
    }

    try {
      const accountId = await getAccountId();
      const payload = cleanPayload(accountId);

      const duplicate = varieties.find(
        (v) =>
          v.id !== editingId &&
          v.variety.trim().toLowerCase() === payload.variety.trim().toLowerCase()
      );

      if (duplicate) {
        alert("That variety already exists.");
        return;
      }

      if (editingId === "new") {
        const { error } = await supabase.from("varieties").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("varieties")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
      }

      setEditingId(null);
      setForm(EMPTY);
      await loadVarieties();
    } catch (e: any) {
      alert(e?.message ?? "Failed to save variety.");
    }
  }

  async function disableVariety(id: string) {
    const ok = window.confirm("Disable this variety?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("varieties")
        .update({ disabled_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      await loadVarieties();
    } catch (e: any) {
      alert(e?.message ?? "Failed to disable variety.");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Varieties</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Varieties</h1>
      <p className="page-text">{total} active varieties</p>

      <button onClick={startAdd} style={greenBtn}>
        + Add Variety
      </button>

      {editingId && (
        <div style={editor}>
          <h2>{editingId === "new" ? "Add Variety" : "Edit Variety"}</h2>

          <div style={formGrid}>
            {Object.keys(EMPTY).map((key) => (
              <label key={key} style={label}>
                {key.replaceAll("_", " ")}
                <input
                  value={form[key] ?? ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={input}
                />
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={saveVariety} style={greenBtn}>
              Save Variety
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
              style={whiteBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={grid}>
        {varieties.map((v) => (
          <div key={v.id} style={card}>
            <div style={header}>
              <div>
                <h2 style={title}>{v.variety}</h2>
                <p style={muted}>{v.scientific_name || "Scientific name not listed"}</p>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => startEdit(v)} style={whiteBtn}>
                  Edit
                </button>
                <button onClick={() => disableVariety(v.id)} style={redBtn}>
                  Disable
                </button>
              </div>
            </div>

            <div style={details}>
              <Detail label="Harvest" value={v.harvest_days ?? "-"} />
              <Detail label="Soak" value={v.soak_hours ?? "-"} />
              <Detail label="Blackout" value={v.blackout_days ?? "-"} />
              <Detail label="Light" value={v.light_days ?? "-"} />
              <Detail label="Seed g / 1020" value={v.seed_weight_g_1020 ?? "-"} />
              <Detail label="Yield oz / 1020" value={v.expected_yield_oz_1020 ?? "-"} />
            </div>

            <Text label="Flavor" value={v.flavor_profile} />
            <Text label="Best Uses" value={v.best_uses} />
            <Text label="Chef Notes" value={v.chef_notes} />
            <Text label="Pro Tips" value={v.pro_tips} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={detailCard}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

function Text({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <div style={textBlock}>
      <strong>{label}</strong>
      <div>{value}</div>
    </div>
  );
}

const greenBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const whiteBtn: React.CSSProperties = {
  padding: "12px 18px",
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

const editor: React.CSSProperties = {
  marginTop: 18,
  marginBottom: 18,
  padding: 18,
  borderRadius: 18,
  border: "2px solid #047857",
  background: "#fff",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
};

const input: React.CSSProperties = {
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 15,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 18,
  maxWidth: 1050,
  marginTop: 18,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 18,
  padding: 22,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  fontWeight: 900,
};

const muted: React.CSSProperties = {
  color: "#64748b",
};

const details: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const detailCard: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
};

const detailLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 900,
};

const detailValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
};

const textBlock: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#f8fafc",
  color: "#475569",
};