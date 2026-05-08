// src/pages/Varieties.tsx

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type Variety = {
  id: string;
  variety: string;
  harvest_days: number | null;
  soak_hours?: number | null;
  blackout_days?: number | null;
  light_days?: number | null;
  seed_grams?: number | null;
  notes?: string | null;
  account_id: string;
};

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadVarieties();
  }, []);

  async function getAccountId() {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) return null;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", userData.user.id)
      .single();

    if (error) {
      console.error(error);
      return null;
    }

    return profile?.account_id ?? null;
  }

  async function loadVarieties() {
    try {
      setLoading(true);
      setError("");

      const accountId = await getAccountId();

      if (!accountId) {
        setError("No account found.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("varieties")
        .select("*")
        .eq("account_id", accountId)
        .is("disabled_at", null)
        .order("variety", { ascending: true });

      if (error) {
        console.error(error);
        setError(error.message);
        setLoading(false);
        return;
      }

      // HARD DEDUPE
      const dedupeMap = new Map<string, Variety>();

      (data || []).forEach((v: Variety) => {
        const key = v.variety.trim().toLowerCase();

        if (!dedupeMap.has(key)) {
          dedupeMap.set(key, v);
        }
      });

      const cleaned = Array.from(dedupeMap.values()).sort((a, b) =>
        a.variety.localeCompare(b.variety)
      );

      setVarieties(cleaned);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load varieties");
    } finally {
      setLoading(false);
    }
  }

  const totalVarieties = useMemo(() => varieties.length, [varieties]);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Varieties</h1>
        <p>Loading varieties...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1100,
      }}
    >
      <h1
        style={{
          fontSize: 64,
          fontWeight: 800,
          marginBottom: 8,
          color: "#0b132b",
        }}
      >
        Varieties
      </h1>

      <div
        style={{
          marginBottom: 24,
          color: "#666",
          fontSize: 18,
        }}
      >
        {totalVarieties} active varieties
      </div>

      {error && (
        <div
          style={{
            background: "#ffe5e5",
            color: "#b00020",
            padding: 16,
            borderRadius: 10,
            marginBottom: 24,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {varieties.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          No varieties found.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 20,
          }}
        >
          {varieties.map((v) => (
            <div
              key={v.id}
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 16,
                padding: 24,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 34,
                      fontWeight: 700,
                      color: "#0b132b",
                      marginBottom: 6,
                    }}
                  >
                    {v.variety}
                  </div>

                  <div
                    style={{
                      color: "#666",
                      fontSize: 18,
                    }}
                  >
                    Harvest: {v.harvest_days ?? "-"} days
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 16,
                  marginTop: 20,
                }}
              >
                <DetailCard
                  label="Soak Hours"
                  value={v.soak_hours ?? "-"}
                />

                <DetailCard
                  label="Blackout Days"
                  value={v.blackout_days ?? "-"}
                />

                <DetailCard
                  label="Light Days"
                  value={v.light_days ?? "-"}
                />

                <DetailCard
                  label="Seed Grams"
                  value={v.seed_grams ?? "-"}
                />
              </div>

              {v.notes && (
                <div
                  style={{
                    marginTop: 24,
                    padding: 16,
                    background: "#f8f8f8",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    Notes
                  </div>

                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                      color: "#444",
                    }}
                  >
                    {v.notes}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#777",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#0b132b",
        }}
      >
        {value}
      </div>
    </div>
  );
}