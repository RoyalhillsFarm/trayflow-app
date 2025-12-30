// src/pages/Varieties.tsx
// Vite + React page: Supabase-connected Varieties manager,
// styled to match the existing TrayFlow pages.

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

function emptyFormFromFields(fields: FieldConfig[]) {
  const obj: Record<string, string> = {};
  for (const f of fields) if (f.editable) obj[f.column] = "";
  return obj;
}

function toInputString(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function sortByDisplayField<T extends Record<string, any>>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const av = (a[DISPLAY_FIELD] ?? "") as string;
    const bv = (b[DISPLAY_FIELD] ?? "") as string;
    return av.localeCompare(bv);
  });
}

const LIST_FIELDS = VARIETY_FIELDS.filter((f) => f.showInList);
const EDITABLE_FIELDS = VARIETY_FIELDS.filter((f) => f.editable);

const cardStyle: React.CSSProperties = {
  padding: "0.9rem 1.1rem",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
};

const pillButtonStyle: React.CSSProperties = {
  padding: "0.35rem 0.9rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.3rem 0.8rem",
  borderRadius: 999,
  border: "1px solid #cbd5f5",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 12,
  cursor: "pointer",
};

export default function Varieties() {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>(
    emptyFormFromFields(EDITABLE_FIELDS)
  );

  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [editState, setEditState] = useState<Record<string, string>>({});

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from(ENTITY)
      .select("*")
      .order(DISPLAY_FIELD, { ascending: true });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(sortByDisplayField(data ?? []));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleAdd = async () => {
    const required =
      EDITABLE_FIELDS.find((f) => f.required) ??
      EDITABLE_FIELDS.find((f) => f.column === DISPLAY_FIELD);

    if (required && !(form[required.column] ?? "").trim()) {
      alert(`Please fill in ${required.label}.`);
      return;
    }

    const payload = coerceForSave(form);
    const { data, error } = await supabase
      .from(ENTITY)
      .insert(payload)
      .select()
      .single();

    if (error) {
      alert(`Add failed: ${error.message}`);
      return;
    }

    setRows((prev) => sortByDisplayField([...prev, data as any]));
    setForm(emptyFormFromFields(EDITABLE_FIELDS));
  };

  const handleDelete = async (id: string) => {
    const prev = rows;
    setRows((cur) => cur.filter((r) => r[PRIMARY_KEY] !== id)); // optimistic
    const { error } = await supabase.from(ENTITY).delete().eq(PRIMARY_KEY, id);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      setRows(prev);
    }
    if (selected?.[PRIMARY_KEY] === id) setSelected(null);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    const id = selected[PRIMARY_KEY] as string;
    const partial = coerceForSave(editState);
    const { error } = await supabase.from(ENTITY).update(partial).eq(PRIMARY_KEY, id);
    if (error) {
      alert(`Update failed: ${error.message}`);
      return;
    }
    const merged = { ...selected, ...partial };
    setSelected(merged);
    setRows((prev) =>
      sortByDisplayField(prev.map((r) => (r[PRIMARY_KEY] === id ? merged : r)))
    );
  };

  const openDetails = (row: Record<string, any>) => {
    setSelected(row);
    const seed: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) seed[f.column] = toInputString(row[f.column]);
    setEditState(seed);
  };

  const list = useMemo(() => sortByDisplayField(rows), [rows]);

  return (
    <div className="page">
      <h1 className="page-title">Varieties</h1>

      {/* ADD VARIETY CARD */}
      <div style={{ ...cardStyle, marginTop: "0.75rem", maxWidth: 900 }}>
        <h2
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            marginBottom: "0.75rem",
            color: "#0f172a",
          }}
        >
          Add Variety
        </h2>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1rem",
          }}
        >
          {EDITABLE_FIELDS.map((f) => {
            const value = form[f.column] ?? "";
            const label = f.label;

            const wrapperStyle: React.CSSProperties = {
              display: "flex",
              flexDirection: "column",
              minWidth: 180,
              flex: f.type === "textarea" ? "1 1 100%" : "1 1 200px",
            };

            const inputStyle: React.CSSProperties = {
              width: "100%",
              padding: "0.4rem 0.55rem",
              borderRadius: 8,
              border: "1px solid #cbd5f5",
              fontSize: 14,
            };

            const labelStyle: React.CSSProperties = {
              marginBottom: "0.2rem",
              fontSize: 13,
              color: "#0f172a",
            };

            if (f.type === "select" && f.options) {
              return (
                <label key={f.column} style={wrapperStyle}>
                  <span style={labelStyle}>{label}</span>
                  <select
                    style={inputStyle}
                    value={value}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, [f.column]: e.target.value }))
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
                  <span style={labelStyle}>{label}</span>
                  <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                    value={value}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, [f.column]: e.target.value }))
                    }
                  />
                </label>
              );
            }

            const inputType = f.type === "number" ? "number" : "text";

            return (
              <label key={f.column} style={wrapperStyle}>
                <span style={labelStyle}>
                  {label}
                  {f.unit ? (
                    <span style={{ marginLeft: 4, color: "#64748b" }}>
                      ({f.unit})
                    </span>
                  ) : null}
                </span>
                <input
                  type={inputType}
                  style={inputStyle}
                  placeholder={f.placeholder ?? ""}
                  value={value}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, [f.column]: e.target.value }))
                  }
                />
              </label>
            );
          })}
        </div>

        <div style={{ marginTop: "0.9rem" }}>
          <button type="button" onClick={handleAdd} style={pillButtonStyle}>
            Add
          </button>
        </div>
      </div>

      {/* LIST OF VARIETIES */}
      <div style={{ marginTop: "1.25rem" }}>
        {loading && <p className="page-text">Loading…</p>}
        {error && (
          <p className="page-text" style={{ color: "#b91c1c" }}>
            Error: {error}
          </p>
        )}

        {!loading && !rows.length && !error && (
          <p className="page-text">No varieties yet. Add your first one above.</p>
        )}

        {!loading && rows.length > 0 && (
          <ul
            style={{
              listStyleType: "none",
              padding: 0,
              margin: 0,
              maxWidth: 900,
            }}
          >
            {list.map((row) => {
              const main = row[DISPLAY_FIELD] ?? "—";
              const seedWeight = row["seed_weight_g_1020"];
              const harvestDays = row["harvest_days"];
              const difficulty = row["difficulty"];

              return (
                <li key={row[PRIMARY_KEY]} style={{ marginBottom: "0.55rem" }}>
                  <div
                    style={{
                      ...cardStyle,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
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
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          marginBottom: 4,
                        }}
                      >
                        {main}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        {seedWeight != null && seedWeight !== "" && (
                          <span>{seedWeight} g/1020</span>
                        )}
                        {harvestDays != null && harvestDays !== "" && (
                          <span>{harvestDays} days</span>
                        )}
                        {difficulty && <span>Difficulty: {difficulty}</span>}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(row[PRIMARY_KEY])}
                      style={secondaryButtonStyle}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* DETAILS / EDIT MODAL */}
      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 40,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 720,
              borderRadius: 18,
              background: "#ffffff",
              padding: "1.4rem 1.4rem 1.1rem",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                {selected[DISPLAY_FIELD]}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={secondaryButtonStyle}
              >
                Close
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem 1rem",
              }}
            >
              {VARIETY_FIELDS.map((f) => {
                const label = f.label;

                const wrapperStyle: React.CSSProperties = {
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 180,
                  flex: f.type === "textarea" ? "1 1 100%" : "1 1 220px",
                };

                const labelStyle: React.CSSProperties = {
                  marginBottom: "0.2rem",
                  fontSize: 13,
                  color: "#0f172a",
                };

                const inputStyle: React.CSSProperties = {
                  width: "100%",
                  padding: "0.4rem 0.55rem",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  fontSize: 14,
                };

                if (f.readonly || !f.editable) {
                  const val = selected[f.column];
                  return (
                    <div key={f.column} style={wrapperStyle}>
                      <span style={labelStyle}>{label}</span>
                      <div
                        style={{
                          ...inputStyle,
                          background: "#f8fafc",
                          borderStyle: "dashed",
                        }}
                      >
                        {val ?? "—"}
                        {f.unit ? ` ${f.unit}` : ""}
                      </div>
                    </div>
                  );
                }

                const value = editState[f.column] ?? "";

                if (f.type === "select" && f.options) {
                  return (
                    <label key={f.column} style={wrapperStyle}>
                      <span style={labelStyle}>{label}</span>
                      <select
                        style={inputStyle}
                        value={value}
                        onChange={(e) =>
                          setEditState((s) => ({
                            ...s,
                            [f.column]: e.target.value,
                          }))
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
                      <span style={labelStyle}>{label}</span>
                      <textarea
                        style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                        value={value}
                        onChange={(e) =>
                          setEditState((s) => ({
                            ...s,
                            [f.column]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  );
                }

                const inputType = f.type === "number" ? "number" : "text";

                return (
                  <label key={f.column} style={wrapperStyle}>
                    <span style={labelStyle}>
                      {label}
                      {f.unit ? (
                        <span style={{ marginLeft: 4, color: "#64748b" }}>
                          ({f.unit})
                        </span>
                      ) : null}
                    </span>
                    <input
                      type={inputType}
                      style={inputStyle}
                      value={value}
                      onChange={(e) =>
                        setEditState((s) => ({
                          ...s,
                          [f.column]: e.target.value,
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "1rem",
              }}
            >
              <button
                type="button"
                onClick={handleSaveEdit}
                style={pillButtonStyle}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: "0.75rem",
          fontSize: 12,
          color: "#64748b",
        }}
      >
        {loading
          ? "Loading…"
          : error
          ? ""
          : `${rows.length} varieties in your library`}
      </div>
    </div>
  );
}
