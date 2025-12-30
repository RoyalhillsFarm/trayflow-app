// src/app/varieties/page.tsx
// Supabase-connected Varieties Manager using your JSON field map.
//
// Prereqs in your project:
// - src/utils/supabaseClient.ts (with your Supabase URL + anon key)
// - src/data/varietyFieldMap.json (the mapping file)
// - src/utils/fieldMap.ts (exports VARIETY_FIELDS, DISPLAY_FIELD, PRIMARY_KEY, ENTITY, coerceForSave)
//
// This page renders:
// - Add form (generated from mapping)
// - List (columns chosen by mapping.showInList)
// - Click row to open Details/Edit modal
// - Delete row
//
// TailwindCSS classes assume Tailwind is configured.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import {
  VARIETY_FIELDS,
  DISPLAY_FIELD,
  PRIMARY_KEY,
  ENTITY,
  coerceForSave,
  type FieldConfig,
} from "@/utils/fieldMap";

// -------- helpers --------
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
    const av = (a[DISPLAY_FIELD] ?? "") as string;
    const bv = (b[DISPLAY_FIELD] ?? "") as string;
    return av.localeCompare(bv);
  });
}

const LIST_FIELDS = VARIETY_FIELDS.filter((f) => f.showInList);
const EDITABLE_FIELDS = VARIETY_FIELDS.filter((f) => f.editable);

export default function VarietiesPage() {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [form, setForm] = useState<Record<string, string>>(
    emptyFormFromFields(EDITABLE_FIELDS)
  );

  // Details/Edit modal state
  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [editState, setEditState] = useState<Record<string, string>>({});

  // Fetch all rows
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

  // Add
  const handleAdd = async () => {
    const required = EDITABLE_FIELDS.find((f) => f.required) ?? EDITABLE_FIELDS.find((f) => f.column === DISPLAY_FIELD);
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

  // Delete
  const handleDelete = async (id: string) => {
    const prev = rows;
    setRows((cur) => cur.filter((r) => r[PRIMARY_KEY] !== id)); // optimistic

    const { error } = await supabase.from(ENTITY).delete().eq(PRIMARY_KEY, id);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      setRows(prev); // rollback
      return;
    }
    if (selected?.[PRIMARY_KEY] === id) setSelected(null);
  };

  // Save edits
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

  // Open details modal
  const openDetails = (row: Record<string, any>) => {
    setSelected(row);
    const seed: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) seed[f.column] = toInputString(row[f.column]);
    setEditState(seed);
  };

  const list = useMemo(() => sortByDisplayField(rows), [rows]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Varieties</h1>

      {/* Add form */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold text-slate-800">Add Variety</h2>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {EDITABLE_FIELDS.map((f) => {
            const value = form[f.column] ?? "";
            const label = f.label;
            const common =
              "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30";

            if (f.type === "select" && f.options) {
              return (
                <label key={f.column} className="text-sm">
                  <span className="mb-1 block text-slate-700">{label}</span>
                  <select
                    className={common}
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
                <label key={f.column} className="text-sm sm:col-span-3 lg:col-span-4">
                  <span className="mb-1 block text-slate-700">{label}</span>
                  <textarea
                    className={common}
                    rows={3}
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
              <label key={f.column} className="text-sm">
                <span className="mb-1 block text-slate-700">
                  {label}
                  {f.unit ? <span className="ml-1 text-slate-400">({f.unit})</span> : null}
                </span>
                <input
                  type={inputType}
                  className={common}
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

        <div className="mt-3">
          <button
            onClick={handleAdd}
            className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
        {list.map((row) => (
          <li
            key={row[PRIMARY_KEY]}
            className="flex items-center justify-between p-3 hover:bg-slate-50 transition"
          >
            <button
              onClick={() => openDetails(row)}
              className="text-left font-medium text-slate-800 hover:text-emerald-800"
            >
              {row[DISPLAY_FIELD] ?? "—"}
            </button>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              {LIST_FIELDS.filter((f) => f.column !== DISPLAY_FIELD).map((f) => {
                const val = row[f.column];
                const content =
                  val === null || val === undefined || val === ""
                    ? "—"
                    : `${val}${f.unit ? ` ${f.unit}` : ""}`;
                return <span key={f.column}>{content}</span>;
              })}

              <button
                onClick={() => handleDelete(row[PRIMARY_KEY])}
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}

        {!loading && list.length === 0 && (
          <li className="p-3 text-sm text-slate-500">No varieties yet.</li>
        )}
      </ul>

      {/* Details / Edit Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                {selected[DISPLAY_FIELD]}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {VARIETY_FIELDS.map((f) => {
                const label = f.label;

                // Read-only
                if (f.readonly) {
                  const val = selected[f.column];
                  return (
                    <div key={f.column} className="text-sm">
                      <div className="mb-1 font-medium text-slate-700">{label}</div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        {val ?? "—"}
                        {f.unit ? ` ${f.unit}` : ""}
                      </div>
                    </div>
                  );
                }

                // Non-editable fields shown as static
                if (!f.editable) {
                  const val = selected[f.column];
                  return (
                    <div key={f.column} className="text-sm">
                      <div className="mb-1 font-medium text-slate-700">{label}</div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        {val ?? "—"}
                        {f.unit ? ` ${f.unit}` : ""}
                      </div>
                    </div>
                  );
                }

                // Editable fields
                const value = editState[f.column] ?? "";
                const common =
                  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30";

                if (f.type === "select" && f.options) {
                  return (
                    <label key={f.column} className="text-sm">
                      <span className="mb-1 block text-slate-700">{label}</span>
                      <select
                        className={common}
                        value={value}
                        onChange={(e) =>
                          setEditState((s) => ({ ...s, [f.column]: e.target.value }))
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
                    <label key={f.column} className="text-sm sm:col-span-2">
                      <span className="mb-1 block text-slate-700">{label}</span>
                      <textarea
                        className={common}
                        rows={3}
                        value={value}
                        onChange={(e) =>
                          setEditState((s) => ({ ...s, [f.column]: e.target.value }))
                        }
                      />
                    </label>
                  );
                }

                const inputType = f.type === "number" ? "number" : "text";
                return (
                  <label key={f.column} className="text-sm">
                    <span className="mb-1 block text-slate-700">
                      {label}
                      {f.unit ? <span className="ml-1 text-slate-400">({f.unit})</span> : null}
                    </span>
                    <input
                      type={inputType}
                      className={common}
                      value={value}
                      onChange={(e) =>
                        setEditState((s) => ({ ...s, [f.column]: e.target.value }))
                      }
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={handleSaveEdit}
                className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer status */}
      <div className="text-sm text-slate-500">
        {loading ? "Loading…" : error ? `Error: ${error}` : `${rows.length} varieties`}
      </div>
    </div>
  );
}
