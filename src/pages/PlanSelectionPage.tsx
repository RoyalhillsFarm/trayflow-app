// src/pages/PlanSelectionPage.tsx
import { useMemo, useState } from "react";
import trayflowIcon from "../assets/trayflow-icon.png";
import { supabase } from "../utils/supabaseClient";

const GREEN = "#047857";

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

export default function PlanSelectionPage() {
  const [farmName, setFarmName] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => farmName.trim().length > 0, [farmName]);

  async function getOrCreatePendingAccount(userId: string, email: string, farm: string) {
    const { data: existingProfile, error: profileLookupErr } = await supabase
      .from("profiles")
      .select("id, account_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileLookupErr) throw profileLookupErr;

    let accountId = existingProfile?.account_id ?? null;

    if (!accountId) {
      accountId = crypto.randomUUID();

      const { error: accountInsertErr } = await supabase.from("accounts").insert({
        id: accountId,
        name: farm,
        plan: "pending",
      });

      if (accountInsertErr) throw accountInsertErr;
    } else {
      const { error: accountUpdateErr } = await supabase
        .from("accounts")
        .update({
          name: farm,
          plan: "pending",
        })
        .eq("id", accountId);

      if (accountUpdateErr) throw accountUpdateErr;
    }

    const { error: profileUpsertErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: email || null,
        account_id: accountId,
        role: "admin",
        plan: "pending",
      },
      { onConflict: "id" }
    );

    if (profileUpsertErr) throw profileUpsertErr;

    return accountId;
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

      const cleanEmail = user.email?.trim().toLowerCase() ?? "";
      const cleanFarmName = farmName.trim();

      const accountId = await getOrCreatePendingAccount(
        user.id,
        cleanEmail,
        cleanFarmName
      );

      const resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          accountId,
          userId: user.id,
          email: cleanEmail,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Could not start checkout.");
      }

      if (!data.url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      setMsg("Redirecting to secure checkout...");
      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message ?? "Could not start checkout.");
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
          <img
            src={trayflowIcon}
            alt="TrayFlow"
            style={{ width: 44, height: 44, objectFit: "contain" }}
          />
          <div style={{ lineHeight: 1.1 }}>
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
              borderRadius: 12,
              border: "1px solid #fecaca",
              fontWeight: 700,
              marginBottom: 12,
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
              borderRadius: 12,
              border: "1px solid #bbf7d0",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
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
                padding: "12px 14px",
                borderRadius: 14,
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
            const info = PLAN_COPY[plan];
            const isLoading = loadingPlan === plan;

            return (
              <div
                key={plan}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 18,
                  background: "#ffffff",
                  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
                  {info.title}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#475569",
                    fontSize: 14,
                    lineHeight: 1.5,
                    minHeight: 66,
                  }}
                >
                  {info.subtitle}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gap: 8,
                    color: "#0f172a",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <div>{info.varieties}</div>
                  <div>{info.seats}</div>
                </div>

                <button
                  type="button"
                  disabled={!canSubmit || loadingPlan !== null}
                  onClick={() => handleChoosePlan(plan)}
                  style={{
                    width: "100%",
                    marginTop: 18,
                    padding: "14px 16px",
                    borderRadius: 16,
                    border: "none",
                    background: GREEN,
                    color: "white",
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: !canSubmit || loadingPlan !== null ? "not-allowed" : "pointer",
                    opacity: !canSubmit || loadingPlan !== null ? 0.7 : 1,
                  }}
                >
                  {isLoading ? "Redirecting…" : info.cta}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, color: "#64748b", fontSize: 12 }}>
          You can upgrade your plan later as your farm grows.
        </div>
      </div>
    </div>
  );
}