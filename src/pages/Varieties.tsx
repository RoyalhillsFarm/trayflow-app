// src/pages/Varieties.tsx

import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type Variety = {
  id: string;
  variety: string;
  harvest_days: number;
  account_id: string;
};

export default function VarietiesPage() {
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVarieties();
  }, []);

  async function getAccountId() {
    const { data: userData } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", userData.user?.id)
      .single();

    return profile?.account_id;
  }

  async function loadVarieties() {
    setLoading(true);

    const accountId = await getAccountId();

    const { data, error } = await supabase
      .from("varieties")
      .select("*")
      .eq("account_id", accountId)
      .is("disabled_at", null);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    // ✅ HARD DEDUPE (prevents UI duplicates even if DB is messy)
    const uniqueMap = new Map<string, Variety>();

    (data || []).forEach((v) => {
      const key = `${v.account_id}_${v.variety.trim().toLowerCase()}`;

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, v);
      }
    });

    const cleaned = Array.from(uniqueMap.values()).sort((a, b) =>
      a.variety.localeCompare(b.variety)
    );

    setVarieties(cleaned);
    setLoading(false);
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading varieties...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Varieties</h1>

      {varieties.length === 0 ? (
        <p>No varieties yet.</p>
      ) : (
        <div style={{ marginTop: 20 }}>
          {varieties.map((v) => (
            <div
              key={v.id}
              style={{
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <strong>{v.variety}</strong>
              <div style={{ fontSize: 12, color: "#666" }}>
                {v.harvest_days} days
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}