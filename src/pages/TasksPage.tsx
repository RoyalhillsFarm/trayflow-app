// src/pages/TasksPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";

type TaskStatus = "open" | "done" | "delivered";

type TaskRow = {
  id: string;
  account_id: string | null;
  title: string;
  dueDate: string;
  status: TaskStatus | string;
  notes?: string | null;
};

type TaskType =
  | "soak"
  | "sow"
  | "spray"
  | "lights_on"
  | "water"
  | "harvest"
  | "delivery"
  | "other";

function cleanTitle(title: string) {
  return (title ?? "").replace(/^sys:detail:/i, "").replace(/^sys:/i, "").trim();
}

function detectType(title: string): TaskType {
  const s = cleanTitle(title).toLowerCase();
  if (s.startsWith("soak")) return "soak";
  if (s.startsWith("sow")) return "sow";
  if (s.startsWith("spray")) return "spray";
  if (s.startsWith("lights on")) return "lights_on";
  if (s.startsWith("water")) return "water";
  if (s.startsWith("harvest")) return "harvest";
  if (s.startsWith("deliver")) return "delivery";
  return "other";
}

function typeLabel(type: TaskType) {
  return {
    soak: "Soak",
    sow: "Sow",
    spray: "Spray",
    lights_on: "Lights On",
    water: "Water",
    harvest: "Harvest",
    delivery: "Deliver",
    other: "Other",
  }[type];
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysYMD(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

async function getCurrentAccountId() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("No signed-in user found.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  if (!profile?.account_id) throw new Error("No account linked to this user.");

  return profile.account_id as string;
}

export default function TasksPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TaskType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("open");
  const [dateFilter, setDateFilter] = useState<"overdue" | "today" | "tomorrow" | "next7" | "all">("today");
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);

  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const tomorrowYMD = useMemo(() => addDaysYMD(todayYMD, 1), [todayYMD]);
  const next7EndYMD = useMemo(() => addDaysYMD(todayYMD, 6), [todayYMD]);

  function isDone(t: TaskRow) {
    return t.status === "done" || t.status === "delivered";
  }

  function isOverdue(t: TaskRow) {
    return t.dueDate < todayYMD && !isDone(t);
  }

  async function loadTasks() {
    const accountId = await getCurrentAccountId();

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("account_id", accountId)
      .order("due_date", { ascending: true })
      .order("title", { ascending: true });

    if (error) throw error;

    const normalized = (data ?? []).map((t: any) => ({
      ...t,
      dueDate: t.due_date ?? t.dueDate,
    }));

    setTasks(normalized as TaskRow[]);
  }

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const date = sp.get("date");
    const phase = sp.get("phase");

    setPinnedDate(date);

    if (phase) {
      const clean = phase === "deliver" ? "delivery" : phase;
      if (
        clean === "soak" ||
        clean === "sow" ||
        clean === "spray" ||
        clean === "lights_on" ||
        clean === "water" ||
        clean === "harvest" ||
        clean === "delivery" ||
        clean === "other"
      ) {
        setTypeFilter(clean);
      }
    }
  }, [location.search]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadTasks();
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load tasks.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.key]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();

    return tasks.filter((t) => {
      const type = detectType(t.title);

      if (pinnedDate && t.dueDate !== pinnedDate) return false;

      if (!pinnedDate) {
        if (dateFilter === "overdue" && !isOverdue(t)) return false;
        if (dateFilter === "today" && t.dueDate !== todayYMD) return false;
        if (dateFilter === "tomorrow" && t.dueDate !== tomorrowYMD) return false;
        if (dateFilter === "next7" && !(t.dueDate >= todayYMD && t.dueDate <= next7EndYMD)) return false;
      }

      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (statusFilter === "open" && isDone(t)) return false;
      if (statusFilter === "done" && !isDone(t)) return false;

      if (q && !`${t.title ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [tasks, query, typeFilter, statusFilter, dateFilter, pinnedDate, todayYMD, tomorrowYMD, next7EndYMD]);

  async function setTaskStatus(task: TaskRow, nextStatus: TaskStatus) {
    try {
      setSavingId(task.id);
      const accountId = await getCurrentAccountId();

      const { error } = await supabase
        .from("tasks")
        .update({ status: nextStatus })
        .eq("id", task.id)
        .eq("account_id", accountId);

      if (error) throw error;
      await loadTasks();
    } catch (e: any) {
      alert(e?.message ?? "Failed to update task.");
    } finally {
      setSavingId(null);
    }
  }

  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("open");
    setDateFilter("today");
    setPinnedDate(null);
    navigate("/tasks");
  }

  if (loading) return <div className="page"><h1 className="page-title">Tasks</h1><p>Loading…</p></div>;
  if (error) return <div className="page"><h1 className="page-title">Tasks</h1><p style={{ color: "#b91c1c" }}>{error}</p></div>;

  return (
    <div className="page">
      <h1 className="page-title">Tasks</h1>

      <div style={card}>
        <h2>Today’s Do Now</h2>

        <div style={pillWrap}>
          {["overdue", "today", "tomorrow", "next7", "all"].map((f) => (
            <button key={f} style={dateFilter === f ? activePill : pill} onClick={() => setDateFilter(f as any)}>
              {f}
            </button>
          ))}
        </div>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks..." style={input} />

        <div style={pillWrap}>
          {(["all", "soak", "sow", "spray", "lights_on", "water", "harvest", "delivery"] as Array<TaskType | "all">).map((type) => (
            <button key={type} style={typeFilter === type ? activePill : pill} onClick={() => setTypeFilter(type)}>
              {type === "all" ? "All" : typeLabel(type)}
            </button>
          ))}
        </div>

        <button onClick={resetFilters} style={secondaryButton}>Reset filters</button>
      </div>

      <h2 style={{ marginTop: 24 }}>Tasks ({filteredTasks.length})</h2>

      {filteredTasks.length === 0 ? (
        <p>Nothing matches your filters.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filteredTasks.map((task) => {
            const done = isDone(task);
            return (
              <div key={task.id} style={taskCard}>
                <div>
                  <strong>{cleanTitle(task.title)}</strong>
                  <div style={{ color: "#64748b" }}>Due {formatDisplayDate(task.dueDate)}</div>
                </div>

                <button
                  disabled={savingId === task.id}
                  onClick={() => setTaskStatus(task, done ? "open" : "done")}
                  style={done ? secondaryButton : primaryButton}
                >
                  {done ? "Reopen" : "Mark done"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  background: "#fff",
};

const pillWrap: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 14,
};

const pill: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 999,
  border: "1px solid #dbe3ef",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const activePill: React.CSSProperties = {
  ...pill,
  background: "#0f172a",
  color: "#fff",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 16,
  marginBottom: 14,
};

const taskCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};