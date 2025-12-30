// src/pages/NewTaskPage.tsx
import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

type TaskStatus = "planned" | "in_progress" | "ready" | "delivered";

export default function NewTaskPage() {
  const navigate = useNavigate();

  const todayYMD = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayYMD);
  const [status, setStatus] = useState<TaskStatus>("planned");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) {
      alert("Please enter a task title.");
      return;
    }
    if (!dueDate) {
      alert("Please choose a due date.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: title.trim(),
        due_date: dueDate,
        status,
      });

      if (error) throw new Error(error.message);

      alert("Task created ✅");
      navigate("/tasks");
    } catch (e: any) {
      alert(e?.message ?? "Failed to create task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h1 className="page-title">New Task</h1>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/tasks")} style={secondaryBtn} disabled={saving}>
            Cancel
          </button>
          <button onClick={save} style={primaryBtn} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          background: "#fff",
          padding: 14,
          maxWidth: 780,
        }}
      >
        <div style={field}>
          <div style={label}>Task title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='Example: "Spray: Amaranth x2 → Royal Hills Farm"'
            style={input}
            disabled={saving}
          />
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
            Tip: start with <strong>Sow:</strong>, <strong>Spray:</strong>, <strong>Water:</strong>, etc. so the correct icon shows.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ ...field, width: 220 }}>
            <div style={label}>Due date</div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={input}
              disabled={saving}
            />
          </div>

          <div style={{ ...field, width: 220 }}>
            <div style={label}>Status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              style={input}
              disabled={saving}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="ready">Ready</option>
              <option value="delivered">Delivered (done)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/* styles */
const label: CSSProperties = { fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 800 };
const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 };
const input: CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.8rem",
  borderRadius: 12,
  border: "1px solid #cbd5f5",
  fontSize: 16,
  background: "#fff",
};

const primaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "white",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 900,
};

const secondaryBtn: CSSProperties = {
  padding: "0.45rem 1.1rem",
  borderRadius: 999,
  border: "1px solid #cbd5f5",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 900,
};
