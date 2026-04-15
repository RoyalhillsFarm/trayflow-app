// src/pages/PlanSelectionPage.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import trayflowIcon from "../assets/trayflow-icon.png";
import { supabase } from "../utils/supabaseClient";

const GREEN = "#047857";
const MASTER_ACCOUNT_ID = "d564692f-cfc4-4b32-8d10-5ce4d6eee0c1";

type PlanKey = "sprout" | "farmer" | "commercial";

const PLAN_COPY: Record<
  PlanKey,
  {
    title: string;
    subtitle: string;
    varieties: string;
    seats: string;
    cta: string;
  }
> = {
  sprout: {
    title: "Sprout",
    subtitle:
      "Best for focused growers getting started with a streamlined production library.",
    varieties: "Up to 10 active microgreen varieties",
    seats: "1 seat",
    cta: "Choose Sprout",
  },
  farmer: {
    title: "Farmer",
    subtitle:
      "Built for growing farms that need more variety flexibility and team capacity.",
    varieties: "Up to 35 active microgreen varieties",
    seats: "3 seats",
    cta: "Choose Farmer",
  },
  commercial: {
    title: "Commercial Farm",
    subtitle:
      "For serious operations that want unlimited variety flexibility and full scaling room.",
    varieties: "Unlimited active microgreen varieties",
    seats: "10 seats",
    cta: "Choose Commercial Farm",
  },
};

const SPROUT_VARIETY_NAMES = [
  "Arugula",
  "Basil",
  "Broccoli",
  "Cabbage (Red)",
  "Mild Mix",
  "Mustard",
  "Pea Shoots",
  "Radish (Purple Plum)",
  "Spicy Mix",
  "Sunflower",
] as const;

type MasterVarietyRow = {
  variety: string;
  scientific_name: string | null;
  seed_weight_g_1020: number | null;
  soak_hours: number | null;
  blackout_days: number | null;
  harvest_days: number | null;
  expected_yield_oz_1020: number | null;
  difficulty: string | null;
  pro_tips: string | null;
  flavor_profile: string | null;
  best_uses: string | null;
  visual_notes: string | null;
  chef_notes: string | null;
  market_notes: string | null;
  spray_per_day_blackout: number | null;
  spray_during_blackout: boolean | null;
  water_after_lights_on: boolean | null;
  water_per_day: number | null;
  has_lights_on_task: boolean | null;
  default_pack_size_oz: number | null;
};

function prettyPlan(plan: PlanKey) {
  if (plan === "commercial") return "Commercial Farm";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export default function PlanSelectionPage() {
  const navigate = useNavigate();

  const [farmName, setFarmName] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => farmName.trim().length > 0, [farmName]);

  async function seedSproutVarieties(accountId: string) {
    const { data: masterRows, error: fetchErr } = await supabase
      .from("varieties")
      .select(
        `
          variety,
          scientific_name,
          seed_weight_g_1020,
          soak_hours,
          blackout_days,
          harvest_days,
          expected_yield_oz_1020,
          difficulty,
          pro_tips,
          flavor_profile,
          best_uses,
          visual_notes,
          chef_notes,
          market_notes,
          spray_per_day_blackout,
          spray_during_blackout,
          water_after_lights_on,
          water_per_day,
          has_lights_on_task,
          default_pack_size_oz
        `
      )
      .eq("account_id", MASTER_ACCOUNT_ID)
      .in("variety", [...SPROUT_VARIETY_NAMES])
      .order("variety", { ascending: true });

    if (fetchErr) throw fetchErr;

    const rows = (masterRows ?? []) as MasterVarietyRow[];

    if (rows.length !== SPROUT_VARIETY_NAMES.length) {
      const found = new Set(rows.map((r) => r.variety));
      const missing = SPROUT_VARIETY_NAMES.filter((name) => !found.has(name));
      throw new Error(
        `Sprout starter library is missing ${missing.length} variety record(s): ${missing.join(
          ", "
        )}`
      );
    }

    const inserts = rows.map((row) => ({
      variety: row.variety,
      scientific_name: row.scientific_name,
      seed_weight_g_1020: row.seed_weight_g_1020,
      soak_hours: row.soak_hours,
      blackout_days: row.blackout_days,
      harvest_days: row.harvest_days,
      expected_yield_oz_1020: row.expected_yield_oz_1020,
      difficulty: row.difficulty,
      pro_tips: row.pro_tips,
      flavor_profile: row.flavor_profile,
      best_uses: row.best_uses,
      visual_notes: row.visual_notes,
      chef_notes: row.chef_notes,
      market_notes: row.market_notes,
      spray_per_day_blackout: row.spray_per_day_blackout,
      spray_during_blackout: row.spray_during_blackout,
      water_after_lights_on: row.water_after_lights_on,
      water_per_day: row.water_per_day,
      has_lights_on_task: row.has_lights_on_task,
      default_pack_size_oz: row.default_pack_size_oz,
      account_id: accountId,
      disabled_at: null,
    }));

    const { error: insertErr } = await supabase.from("varieties").insert(inserts);

    if (insertErr) throw insertErr;
  }

  async function handleChoosePlan(plan: PlanKey) {
    setErr(null);
    setMsg(null);

    if (!farmName.trim()) {
      setErr("Please enter your farm or workspace name first.");
      return;
    }

    setLoadingPlan(plan);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) throw userErr;
      if (!user) {
        throw new Error("No signed-in user found. Please create your account again.");
      }

      const accountId = crypto.randomUUID();
      const cleanEmail = user.email?.trim().toLowerCase() ?? "";

      const { error: accountErr } = await supabase.from("accounts").insert({
        id: accountId,
        name: farmName.trim(),
        plan,
      });

      if (accountErr) throw accountErr;

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: cleanEmail || null,
          account_id: accountId,
          role: "admin",
          plan,
        },
        { onConflict: "id" }
      );

      if (profileErr) throw profileErr;

      if (plan === "sprout") {
        await seedSproutVarieties(accountId);
      }

      setMsg(`${prettyPlan(plan)} selected. Your TrayFlow workspace is ready.`);
      navigate("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Could not set up your workspace.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "#f7fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 20,
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <img src={trayflowIcon} alt="TrayFlow" style={{ width: 44, height: 44 }} />
          <div>
            <div style={{ fontSize: 34, fontWeight: 900, color: "#0f172a" }}>
              Choose Your Plan
            </div>
            <div style={{ marginTop: 6, color: "#475569", fontSize: 16 }}>
              Set up your TrayFlow workspace with the plan that fits your farm.
            </div>
          </div>
        </div>

        {err && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 10,
              border: "1px solid #fecaca",
              fontWeight: 700,
            }}
          >
            {err}
          </div>
        )}

        {msg && (
          <div
            style={{
              background: "#dcfce7",
              color: "#065f46",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 10,
              border: "1px solid #bbf7d0",
              fontWeight: 700,
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "grid", gap: 6, maxWidth: 500 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
              Farm or Workspace Name
            </span>
            <input
              type="text"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder="Royal Hills Farm"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                outline: "none",
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {(Object.keys(PLAN_COPY) as PlanKey[]).map((plan) => {
            const p = PLAN_COPY[plan];

            return (
              <div
                key={plan}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
                  {p.title}
                </div>

                <div style={{ marginTop: 8, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
                  {p.subtitle}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    fontWeight: 700,
                    color: "#0f172a",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div>{p.varieties}</div>
                  <div>{p.seats}</div>
                </div>

                <button
                  type="button"
                  onClick={() => handleChoosePlan(plan)}
                  disabled={!canSubmit || loadingPlan !== null}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "none",
                    background: GREEN,
                    color: "white",
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: !canSubmit || loadingPlan !== null ? "not-allowed" : "pointer",
                    opacity: !canSubmit || loadingPlan !== null ? 0.7 : 1,
                  }}
                >
                  {loadingPlan === plan ? "Setting up…" : p.cta}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}