// src/pages/Varieties.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import {
  VARIETY_FIELDS,
  DISPLAY_FIELD,
  PRIMARY_KEY,
  ENTITY,
  coerceForSave,
  type FieldConfig,
} from "../utils/fieldMap";

type VarietyRow = Record<string, any>;

type AccountInfo = {
  accountId: string;
  plan: string;
  maxVarieties: number | null;
};

function emptyFormFromFields(fields: FieldConfig[]) {
  const obj: Record<string, string> = {};
  for (const f of fields) {
    if (f.editable) obj[f.column] = "";
  }
  return obj;
}

function toInputString(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function sortByDisplayField<T extends Record<string, any>>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const av = String(a[DISPLAY_FIELD] ?? "");
    const bv = String(b[DISPLAY_FIELD] ?? "");
    return av.localeCompare(bv);
  });
}

function getPlanLimitFallback(plan: string): number | null {
  const p = plan.trim().toLowerCase();
  if (p === "sprout") return 10;
  if (p === "farmer") return 35;
  if (p === "commercial") return null;
  return null;
}

const LIST_FIELDS = VARIETY_FIELDS.filter((f) => f.showInList);
const EDITABLE_FIELDS = VARIETY_FIELDS.filter((f) => f.editable);

const cardStyle: React.CSSProperties = {
  padding: "0.95rem 1.05rem",
  borderRadius: 16,
  border: "1px solid #dbe3ef",
  background: "#ffffff",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.7rem 1.15rem",
  borderRadius: 999,
  border: "none",
  background: "#3b7f5f",
  color: "white",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.42rem 0.85rem",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "0.42rem 0.85rem",
  borderRadius: 999,
  border: "1px solid #fecaca",
  background: "#ffffff",
  color: "#b91c1c",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const enabledPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0.32rem 0.75rem",
  borderRadius: 999,
  background: "#e8f5ec",
  color: "#2f6d4f",
  fontSize: 12,
  fontWeight: 600,
};

const disabledPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0.32rem 0.75rem",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 600,
};

const infoPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0.32rem 0.75rem",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 600,
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 860,
          borderRadius: 18,
          background: "#ffffff",
          padding: "1.25rem 1.25rem 1rem",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: "0.8rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldEditor({
  values,
  setValues,
  fields,
}: {
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fields: FieldConfig[];
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem 1rem",
      }}
    >
      {fields.map((f) => {
        const value = values[f.column] ?? "";

        const wrapperStyle: React.CSSProperties = {
          display: "flex",
          flexDirection: "column",
          minWidth: 180,
          flex: f.type === "textarea" ? "1 1 100%" : "1 1 220px",
        };

        const labelStyle: React.CSSProperties = {
          marginBottom: "0.25rem",
          fontSize: 13,
          color: "#0f172a",
          fontWeight: 500,
        };

        const inputStyle: React.CSSProperties = {
          width: "100%",
          padding: "0.52rem 0.62rem",
          borderRadius: 10,
          border: "1px solid #cbd5e1",
          fontSize: 14,
          background: "#fff",
        };

        if (f.type === "select" && f.options) {
          return (
            <label key={f.column} style={wrapperStyle}>
              <span style={labelStyle}>
                {f.label}
                {f.unit ? (
                  <span style={{ marginLeft: 4, color: "#64748b" }}>({f.unit})</span>
                ) : null}
              </span>
              <select
                style={inputStyle}
                value={value}
                onChange={(e) =>
                  setValues((s) => ({ ...s, [f.column]: e.target.value }))
                }
              >
                <option value="">Select…</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (f.type === "textarea") {
          return (
            <label key={f.column} style={wrapperStyle}>
              <span style={labelStyle}>
                {f.label}
                {f.unit ? (
                  <span style={{ marginLeft: 4, color: "#64748b" }}>({f.unit})</span>
                ) : null}
              </span>
              <textarea
                style={{ ...inputStyle, minHeight: 84, resize: "vertical" }}
                value={value}
                onChange={(e) =>
                  setValues((s) => ({ ...s, [f.column]: e.target.value }))
                }
              />
            </label>
          );
        }

        const inputType = f.type === "number" ? "number" : "text";

        return (
          <label key={f.column} style={wrapperStyle}>
            <span style={labelStyle}>
              {f.label}
              {f.unit ? (
                <span style={{ marginLeft: 4, color: "#64748b" }}>({f.unit})</span>
              ) : null}
            </span>
            <input
              type={inputType}
              style={inputStyle}
              placeholder={f.placeholder ?? ""}
              value={value}
              onChange={(e) =>
                setValues((s) => ({ ...s, [f.column]: e.target.value }))
              }
            />
          </label>
        );
      })}
    </div>
  );
}

export default function Varieties() {
  const [rows, setRows] = useState<VarietyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"add" | "enable" | null>(null);

  const [form, setForm] = useState<Record<string, string>>(
    emptyFormFromFields(EDITABLE_FIELDS)
  );

  const [selected, setSelected] = useState<VarietyRow | null>(null);
  const [editState, setEditState] = useState<Record<string, string>>({});

  const fetchAccountInfo = async (): Promise<AccountInfo> => {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = userRes.user?.id ?? null;
    const userEmail = userRes.user?.email?.trim().toLowerCase() ?? null;

    if (!userId && !userEmail) {
      throw new Error("No signed-in user found.");
    }

    let profile: any = null;

    if (userId) {
      const { data: byId, error: byIdErr } = await supabase
        .from("profiles")
        .select("id, email, account_id, role, plan")
        .eq("id", userId)
        .limit(1);

      if (byIdErr) throw byIdErr;
      profile = byId?.[0] ?? null;
    }

    if (!profile && userEmail) {
      const { data: byEmail, error: byEmailErr } = await supabase
        .from("profiles")
        .select("id, email, account_id, role, plan")
        .ilike("email", userEmail)
        .limit(1);

      if (byEmailErr) throw byEmailErr;
      profile = byEmail?.[0] ?? null;
    }

    if (!profile?.account_id) {
      throw new Error(
        "No profile/account link found for this user. Please make sure your profiles table has your email and account_id."
      );
    }

    const accountId = String(profile.account_id);
    const plan = String(profile.plan ?? "").trim().toLowerCase();

    if (!plan) {
      throw new Error(
        "No plan found on your profile. Please make sure your profiles row has a plan value."
      );
    }

    let maxVarieties = getPlanLimitFallback(plan);

    const { data: limitRows, error: limitErr } = await supabase
      .from("plan_limits")
      .select("max_varieties")
      .eq("plan", plan)
      .limit(1);

    if (!limitErr && limitRows?.[0]?.max_varieties !== undefined) {
      const dbValue = limitRows[0].max_varieties;
      maxVarieties = dbValue === null ? null : Number(dbValue);
    }

    return {
      accountId,
      plan,
      maxVarieties,
    };
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);

      const info = await fetchAccountInfo();
      setAccountInfo(info);

      const { data, error } = await supabase
        .from(ENTITY)
        .select("*")
        .eq("account_id", info.accountId)
        .order(DISPLAY_FIELD, { ascending: true });

      if (error) throw error;

      setRows(sortByDisplayField((data ?? []) as VarietyRow[]));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load varieties.");
      setRows([]);
      setAccountInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const enabledCount = useMemo(
    () => rows.filter((r) => !r.disabled_at).length,
    [rows]
  );

  const disabledCount = useMemo(
    () => rows.filter((r) => !!r.disabled_at).length,
    [rows]
  );

  const sortedRows = useMemo(() => sortByDisplayField(rows), [rows]);

  const planLabel = useMemo(() => {
    const raw = accountInfo?.plan ?? "";
    if (!raw) return "";
    if (raw === "sprout") return "Sprout";
    if (raw === "farmer") return "Farmer";
    if (raw === "commercial") return "Commercial Farm";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [accountInfo?.plan]);

  const isAtVarietyLimit = useMemo(() => {
    if (!accountInfo) return false;
    if (accountInfo.maxVarieties === null) return false;
    return enabledCount >= accountInfo.maxVarieties;
  }, [accountInfo, enabledCount]);

  const openUpgradeModal = (reason: "add" | "enable") => {
    setUpgradeReason(reason);
    setShowUpgradeModal(true);
  };

  const upgradeTitle = useMemo(() => {
    if (accountInfo?.plan === "sprout") return "Upgrade to Farmer";
    if (accountInfo?.plan === "farmer") return "Upgrade to Commercial Farm";
    return "Upgrade Plan";
  }, [accountInfo?.plan]);

  const upgradeMessage = useMemo(() => {
    if (!accountInfo) return "";

    if (accountInfo.plan === "sprout") {
      return upgradeReason === "enable"
        ? "You’ve reached your 10 active variety limit on Sprout. Upgrade to Farmer to unlock up to 35 active varieties."
        : "You’ve reached your 10 active variety limit on Sprout. Upgrade to Farmer to add and manage up to 35 active varieties.";
    }

    if (accountInfo.plan === "farmer") {
      return upgradeReason === "enable"
        ? "You’ve reached your 35 active variety limit on Farmer. Upgrade to Commercial Farm for unlimited active varieties."
        : "You’ve reached your 35 active variety limit on Farmer. Upgrade to Commercial Farm for unlimited active varieties and more operational flexibility.";
    }

    return "Upgrade your plan to unlock more capacity.";
  }, [accountInfo, upgradeReason]);

  const handleOpenAdd = () => {
    if (isAtVarietyLimit) {
      openUpgradeModal("add");
      return;
    }
    setShowAddModal(true);
  };

  const handleAdd = async () => {
    const required =
      EDITABLE_FIELDS.find((f) => f.required) ??
      EDITABLE_FIELDS.find((f) => f.column === DISPLAY_FIELD);

    if (required && !(form[required.column] ?? "").trim()) {
      alert(`Please fill in ${required.label}.`);
      return;
    }

    if (!accountInfo?.accountId) {
      alert("No account found for this user.");
      return;
    }

    if (isAtVarietyLimit) {
      openUpgradeModal("add");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...coerceForSave(form),
        account_id: accountInfo.accountId,
        disabled_at: null,
      };

      const { data, error } = await supabase
        .from(ENTITY)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      setRows((prev) => sortByDisplayField([...prev, data as VarietyRow]));
      setForm(emptyFormFromFields(EDITABLE_FIELDS));
      setShowAddModal(false);
    } catch (e: any) {
      alert(`Add failed: ${e?.message ?? "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const okay = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!okay) return;

    const prev = rows;
    setRows((cur) => cur.filter((r) => r[PRIMARY_KEY] !== id));

    const { error } = await supabase.from(ENTITY).delete().eq(PRIMARY_KEY, id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      setRows(prev);
      return;
    }

    if (selected?.[PRIMARY_KEY] === id) setSelected(null);
  };

  const openDetails = (row: VarietyRow) => {
    setSelected(row);
    const seed: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) {
      seed[f.column] = toInputString(row[f.column]);
    }
    setEditState(seed);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;

    try {
      setSaving(true);

      const id = selected[PRIMARY_KEY] as string;
      const partial = coerceForSave(editState);

      const { error } = await supabase
        .from(ENTITY)
        .update(partial)
        .eq(PRIMARY_KEY, id);

      if (error) throw error;

      const merged = { ...selected, ...partial };
      setSelected(merged);

      setRows((prev) =>
        sortByDisplayField(prev.map((r) => (r[PRIMARY_KEY] === id ? merged : r)))
      );
    } catch (e: any) {
      alert(`Update failed: ${e?.message ?? "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (row: VarietyRow) => {
    const id = row[PRIMARY_KEY] as string;
    const isEnabled = !row.disabled_at;

    if (!isEnabled && isAtVarietyLimit) {
      openUpgradeModal("enable");
      return;
    }

    const patch = {
      disabled_at: isEnabled ? new Date().toISOString() : null,
    };

    const prev = rows;

    setRows((cur) =>
      sortByDisplayField(
        cur.map((r) => (r[PRIMARY_KEY] === id ? { ...r, ...patch } : r))
      )
    );

    const { error } = await supabase
      .from(ENTITY)
      .update(patch)
      .eq(PRIMARY_KEY, id);

    if (error) {
      alert(
        isEnabled
          ? `Disable failed: ${error.message}`
          : `Enable failed: ${error.message}`
      );
      setRows(prev);
      return;
    }

    if (selected?.[PRIMARY_KEY] === id) {
      setSelected((cur) => (cur ? { ...cur, ...patch } : cur));
    }
  };

  const headerLimitText = useMemo(() => {
    if (!accountInfo) return "—";
    if (accountInfo.maxVarieties === null || accountInfo.maxVarieties >= 9999) {
      return `${enabledCount} Active`;
    }
    return `${enabledCount} / ${accountInfo.maxVarieties} Active`;
  }, [accountInfo, enabledCount]);

  const varietyLimitText =
    accountInfo?.maxVarieties == null
      ? "Unlimited varieties"
      : `${accountInfo.maxVarieties} variety limit`;

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            Varieties
          </h1>

          <div
            style={{
              fontSize: 13,
              color: "#64748b",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 700, color: "#0f172a" }}>
              Royal Hills Farm
            </span>
            <span>•</span>
            <span>{planLabel}</span>
            <span>•</span>
            <span>{varietyLimitText}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={enabledPillStyle}>{headerLimitText}</span>

          {isAtVarietyLimit && accountInfo?.maxVarieties !== null && (
            <span style={infoPillStyle}>Limit reached</span>
          )}

          <button
            type="button"
            onClick={handleOpenAdd}
            style={primaryButtonStyle}
          >
            + Add Variety
          </button>
        </div>
      </div>

      {isAtVarietyLimit && accountInfo?.maxVarieties !== null && (
        <div
          style={{
            ...cardStyle,
            marginTop: "1rem",
            maxWidth: 980,
            borderColor: "#bbf7d0",
            background: "#f0fdf4",
          }}
        >
          <div style={{ fontWeight: 700, color: "#166534", marginBottom: 4 }}>
            You’ve reached your active variety limit.
          </div>
          <div style={{ fontSize: 14, color: "#166534" }}>
            {accountInfo?.plan === "sprout"
              ? "Upgrade to Farmer to unlock up to 35 active varieties."
              : "Upgrade to Commercial Farm for unlimited active varieties."}
          </div>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        {loading && <p className="page-text">Loading…</p>}

        {error && (
          <p className="page-text" style={{ color: "#b91c1c" }}>
            Error: {error}
          </p>
        )}

        {!loading && !rows.length && !error && (
          <div style={{ ...cardStyle, maxWidth: 980 }}>
            <p className="page-text" style={{ margin: 0 }}>
              No varieties yet. Click <strong>Add Variety</strong> to build your library.
            </p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <ul
            style={{
              listStyleType: "none",
              padding: 0,
              margin: 0,
              maxWidth: 980,
            }}
          >
            {sortedRows.map((row) => {
              const id = row[PRIMARY_KEY] as string;
              const main = row[DISPLAY_FIELD] ?? "—";
              const isEnabled = !row.disabled_at;

              return (
                <li key={id} style={{ marginBottom: "0.7rem" }}>
                  <div
                    style={{
                      ...cardStyle,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.9rem",
                      opacity: isEnabled ? 1 : 0.78,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openDetails(row)}
                      style={{
                        border: "none",
                        background: "none",
                        textAlign: "left",
                        padding: 0,
                        cursor: "pointer",
                        flex: "1 1 auto",
                        minWidth: 0,
                      }}
                      title="Open variety details"
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                          {main}
                        </div>
                        <span style={isEnabled ? enabledPillStyle : disabledPillStyle}>
                          {isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.8rem",
                        }}
                      >
                        {LIST_FIELDS.map((f) => {
                          const value = row[f.column];
                          if (value === null || value === undefined || value === "") return null;
                          if (f.column === DISPLAY_FIELD) return null;

                          return (
                            <span key={f.column}>
                              {f.label}: {value}
                              {f.unit ? ` ${f.unit}` : ""}
                            </span>
                          );
                        })}
                      </div>
                    </button>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        gap: 8,
                        flex: "0 0 auto",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(row)}
                        style={secondaryButtonStyle}
                      >
                        {isEnabled ? "Disable" : "Enable"}
                      </button>

                      <button
                        type="button"
                        onClick={() => openDetails(row)}
                        style={secondaryButtonStyle}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(id, String(main))}
                        style={dangerButtonStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && !error && (
        <div
          style={{
            marginTop: "0.9rem",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          {rows.length} varieties in your library • {disabledCount} disabled
        </div>
      )}

      {showAddModal && (
        <Modal title="Add Variety" onClose={() => setShowAddModal(false)}>
          <FieldEditor values={form} setValues={setForm} fields={EDITABLE_FIELDS} />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              style={primaryButtonStyle}
              disabled={saving}
            >
              {saving ? "Saving…" : "Add Variety"}
            </button>
          </div>
        </Modal>
      )}

      {showUpgradeModal && (
        <Modal title={upgradeTitle} onClose={() => setShowUpgradeModal(false)}>
          <div style={{ fontSize: 15, color: "#334155", lineHeight: 1.6 }}>
            {upgradeMessage}
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "0.9rem 1rem",
              borderRadius: 14,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              color: "#475569",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {accountInfo?.plan === "sprout"
              ? "Farmer gives growers more room to expand their production lineup, manage more active varieties, and grow beyond the starter stage."
              : "Commercial Farm unlocks unlimited active varieties and supports larger, more complex production workflows."}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              style={secondaryButtonStyle}
            >
              Maybe later
            </button>

            <button
              type="button"
              onClick={() => {
                alert(
                  "Upgrade flow placeholder: next we can connect this button to billing, a contact form, or an upgrade request page."
                );
              }}
              style={primaryButtonStyle}
            >
              Upgrade Plan
            </button>
          </div>
        </Modal>
      )}

      {selected && (
        <Modal
          title={`Edit Variety: ${selected[DISPLAY_FIELD] ?? "Variety"}`}
          onClose={() => setSelected(null)}
        >
          <FieldEditor
            values={editState}
            setValues={setEditState}
            fields={EDITABLE_FIELDS}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <span style={!selected.disabled_at ? enabledPillStyle : disabledPillStyle}>
                {!selected.disabled_at ? "Currently enabled" : "Currently disabled"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleToggleEnabled(selected)}
                style={secondaryButtonStyle}
              >
                {!selected.disabled_at ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                style={primaryButtonStyle}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}