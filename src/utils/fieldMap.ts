// src/utils/fieldMap.ts
import mapping from "../data/varietyFieldMap.json";

export type FieldConfig = {
  label: string;
  column: string;
  type: "text" | "textarea" | "number" | "select" | "datetime";
  numberKind?: "int" | "float";
  options?: string[];
  unit?: string;
  showInList?: boolean;
  editable?: boolean;
  required?: boolean;
  readonly?: boolean;
  placeholder?: string;
};

export const VARIETY_FIELDS = mapping.fields as FieldConfig[];
export const DISPLAY_FIELD = mapping.displayField as string;
export const ENTITY = mapping.entity as string;
export const PRIMARY_KEY = mapping.primaryKey as string;

export function coerceForSave(input: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of VARIETY_FIELDS) {
    if (!(f.column in input)) continue;
    const v = input[f.column];

    if (f.type === "number") {
      if (v === "" || v === null || v === undefined) {
        out[f.column] = null;
      } else if (f.numberKind === "int") {
        const n = parseInt(String(v), 10);
        out[f.column] = Number.isNaN(n) ? null : n;
      } else {
        const n = parseFloat(String(v));
        out[f.column] = Number.isNaN(n) ? null : n;
      }
    } else {
      out[f.column] = v === "" ? null : v;
    }
  }
  return out;
}
