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
  seed_weight_g_1020?: number | null;
  expected_yield_oz_1020?: number | null;
  difficulty?: string | null;
  flavor_profile?: string | null;
  best_uses?: string | null;
  visual_notes?: string | null;
  chef_notes?: string | null;
  market_notes?: string | null;
  pro_tips?: string | null;
  default_pack_size_oz?: number | null;
  water_per_day?: number | null;
  spray_per_day_blackout?: number | null;
  account_id: string;
};

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadVarieties();
  }, []);

  async function getAccountId() {
    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr) throw userErr;
    if (!userData.user) throw new Error("No signed-in user found.");

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", userData.user.id)
      .single();

    if (error) throw error;
    if (!profile?.account_id) throw new Error("No account found.");

    return profile.account_id as string;
  }

  async function loadVarieties() {
    try {
      setLoading(true);
      setError("");

      const accountId = await getAccountId();

      const { data, error } = await supabase
        .from("varieties")
        .select("*")
        .eq("account_id", accountId)
        .is("disabled_at", null)
        .order("variety", { ascending: true });

      if (error) throw error;

      const dedupeMap = new Map<string, Variety>();

      for (const row of data ?? []) {
        const key = String(row.variety ?? "").trim().toLowerCase();
        if (!key || dedupeMap.has(key)) continue;
        dedupeMap.set(key, row as Variety);
      }

      const cleaned = Array.from(dedupeMap.values()).sort((a, b) =>
        String(a.variety).localeCompare(String(b.variety))
      );

      setVarieties(cleaned);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load varieties.");
    } finally {
      setLoading(false);
    }
  }

  const totalVarieties = useMemo(() => varieties.length, [varieties]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Varieties</h1>
        <p className="page-text">Loading varieties…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Varieties</h1>

      <p className="page-text" style={{ marginTop: -12 }}>
        {totalVarieties} active varieties
      </p>

      {error && <div style={errorBox}>{error}</div>}

      {varieties.length === 0 ? (
        <div style={emptyBox}>No varieties found.</div>
      ) : (
        <div style={grid}>
          {varieties.map((v) => (
            <div key={v.id} style={card}>
              <div style={headerRow}>
                <div>
                  <h2 style={title}>{v.variety}</h2>
                  <p style={subtitle}>
                    {v.scientific_name || "Scientific name not listed"}
                  </p>
                </div>

                <span style={pill}>{v.difficulty || "Standard"}</span>
              </div>

              <div style={detailGrid}>
                <DetailCard label="Harvest Days" value={v.harvest_days ?? "-"} />
                <DetailCard label="Soak Hours" value={v.soak_hours ?? "-"} />
                <DetailCard label="Blackout Days" value={v.blackout_days ?? "-"} />
                <DetailCard label="Seed Weight / 1020" value={v.seed_weight_g_1020 ?? "-"} />
                <DetailCard label="Yield oz / 1020" value={v.expected_yield_oz_1020 ?? "-"} />
                <DetailCard label="Default Pack oz" value={v.default_pack_size_oz ?? "-"} />
                <DetailCard label="Water / Day" value={v.water_per_day ?? "-"} />
                <DetailCard label="Spray / Blackout Day" value={v.spray_per_day_blackout ?? "-"} />
              </div>

              <TextBlock label="Flavor Profile" value={v.flavor_profile} />
              <TextBlock label="Best Uses" value={v.best_uses} />
              <TextBlock label="Visual Notes" value={v.visual_notes} />
              <TextBlock label="Chef Notes" value={v.chef_notes} />
              <TextBlock label="Market Notes" value={v.market_notes} />
              <TextBlock label="Pro Tips" value={v.pro_tips} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={detailCard}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <div style={textBlock}>
      <div style={textLabel}>{label}</div>
      <div style={textValue}>{value}</div>
    </div>
  );
}

const grid: React.CSSProperties = {
  display: "grid",
  gap: 18,
  maxWidth: 1050,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 18,
  padding: 22,
  boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 16,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 900,
  color: "#0f172a",
};

const subtitle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 16,
};

const pill: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  background: "#ecfdf5",
  color: "#047857",
  fontWeight: 900,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const detailCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  background: "#f8fafc",
};

const detailLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 800,
  marginBottom: 8,
};

const detailValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#0f172a",
};

const textBlock: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const textLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#0f172a",
  fontWeight: 900,
  marginBottom: 6,
};

const textValue: React.CSSProperties = {
  color: "#475569",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const errorBox: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #fecaca",
  fontWeight: 800,
  marginBottom: 16,
};

const emptyBox: React.CSSProperties = {
  padding: 18,
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  background: "#fff",
  color: "#64748b",
};