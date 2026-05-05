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
  return (title ?? "")
    .replace(/^sys:detail:/i, "")
    .replace(/^sys:/i, "")
    .trim();
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
  const labels: Record<TaskType, string> = {
    soak: "Soak",
    sow: "Sow",
    spray: "Spray",
    lights_on: "Lights On",
    water: "Water",
    harvest: "Harvest",
    delivery: "Deliver",
    other: "Other",
  };

  return labels[type];
}

function typeOrder(type: TaskType) {
  const order: Record<TaskType, number> = {
    soak: 0,
    sow: 1,
    spray: 2,
    lights_on: 3,
    water: 4,
    harvest: 5,
    delivery: 6,
    other: 99,
  };

  return order[type];
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYMD(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

async function getCurrentAccountId() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("No signed-in user found.");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .single();

  if (profileErr) throw profileErr;
  if (!profile?.account_id) throw new Error("No account is linked to this user.");

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
  const [dateFilter, setDateFilter] = useState<
    "overdue" | "today" | "tomorrow" | "next7" | "all"
  >("today");
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
      .order("dueDate", { ascending: true })
      .order("title", { ascending: true });

    if (error) throw error;

    const sorted = ((data ?? []) as TaskRow[]).sort((a, b) => {
      const dateSort = a.dueDate.localeCompare(b.dueDate);
      if (dateSort !== 0) return dateSort;

      const typeSort = typeOrder(detectType(a.title)) - typeOrder(detectType(b.title));
      if (typeSort !== 0) return typeSort;

      return cleanTitle(a.title).localeCompare(cleanTitle(b.title));
    });

    setTasks(sorted);
  }

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const date = sp.get("date");
    const phase = sp.get("phase");

    if (date) {
      setPinnedDate(date);
      setDateFilter("all");
    } else {
      setPinnedDate(null);
    }

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

  const counts = useMemo(() => {
    const base = {
      overdue: 0,
      today: 0,
      tomorrow: 0,
      next7: 0,
      all: 0,
      type: {
        all: 0,
        soak: 0,
        sow: 0,
        spray: 0,
        lights_on: 0,
        water: 0,
        harvest: 0,
        delivery: 0,
        other: 0,
      } as Record<TaskType | "all", number>,
    };

    for (const t of tasks) {
      if (isDone(t)) continue;
      if (pinnedDate && t.dueDate !== pinnedDate) continue;

      const type = detectType(t.title);

      base.all++;
      base.type.all++;
      base.type[type]++;

      if (isOverdue(t)) base.overdue++;
      if (t.dueDate === todayYMD) base.today++;
      if (t.dueDate === tomorrowYMD) base.tomorrow++;
      if (t.dueDate >= todayYMD && t.dueDate <= next7EndYMD) base.next7++;
    }

    return base;
  }, [tasks, pinnedDate, todayYMD, tomorrowYMD, next7EndYMD]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();

    return tasks.filter((t) => {
      const type = detectType(t.title);

      if (pinnedDate && t.dueDate !== pinnedDate) return false;

      if (!pinnedDate) {
        if (dateFilter === "overdue" && !isOverdue(t)) return false;
        if (dateFilter === "today" && t.dueDate !== todayYMD) return false;
        if (dateFilter === "tomorrow" && t.dueDate !== tomorrowYMD) return false;
        if (dateFilter === "next7" && !(t.dueDate >= todayYMD && t.dueDate <= next7EndYMD)) {
          return false;
        }
      }

      if (typeFilter !== "all" && type !== typeFilter) return false;

      if (statusFilter === "open" && isDone(t)) return false;
      if (statusFilter === "done" && !isDone(t)) return false;

      if (q) {
        const hay = `${t.title ?? ""} ${t.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    tasks,
    query,
    typeFilter,
    statusFilter,
    dateFilter,
    pinnedDate,
    todayYMD,
    tomorrowYMD,
    next7EndYMD,
  ]);

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

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Tasks</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Tasks</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      </div>
    );
  }

  const heading = pinnedDate
    ? `Tasks for ${formatDisplayDate(pinnedDate)}`
    : dateFilter === "overdue"
    ? `Overdue (${filteredTasks.length})`
    : dateFilter === "today"
    ? `Due Today (${filteredTasks.length})`
    : dateFilter === "tomorrow"
    ? `Due Tomorrow (${filteredTasks.length})`
    : dateFilter === "next7"
    ? `Next 7 Days (${filteredTasks.length})`
    : `All Tasks (${filteredTasks.length})`;

  return (
    <div className="page">
      <h1 className="page-title">Tasks</h1>

      <div style={card}>
        <h2 style={sectionTitle}>Today’s Do Now</h2>

        <div style={pillWrap}>
          <button style={dateFilter === "overdue" ? activePill : pill} onClick={() => setDateFilter("overdue")}>
            Overdue <span style={countBadge}>{counts.overdue}</span>
          </button>
          <button style={dateFilter === "today" ? activePill : pill} onClick={() => setDateFilter("today")}>
            Due today <span style={countBadge}>{counts.today}</span>
          </button>
          <button style={dateFilter === "tomorrow" ? activePill : pill} onClick={() => setDateFilter("tomorrow")}>
            Due tomorrow <span style={countBadge}>{counts.tomorrow}</span>
          </button>
          <button style={dateFilter === "next7" ? activePill : pill} onClick={() => setDateFilter("next7")}>
            Next 7 days <span style={countBadge}>{counts.next7}</span>
          </button>
          <button style={dateFilter === "all" ? activePill : pill} onClick={() => setDateFilter("all")}>
            All dates <span style={countBadge}>{counts.all}</span>
          </button>
        </div>

        <div style={toolbar}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks..."
            style={input}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={select}
          >
            <option value="open">Open tasks</option>
            <option value="done">Done tasks</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        <div style={pillWrap}>
          {(["all", "soak", "sow", "spray", "lights_on", "water", "harvest", "delivery"] as Array<TaskType | "all">).map(
            (type) => (
              <button
                key={type}
                style={typeFilter === type ? activePill : pill}
                onClick={() => setTypeFilter(type)}
              >
                {type === "all" ? "All" : typeLabel(type)}
                <span style={countBadge}>{counts.type[type]}</span>
              </button>
            )
          )}
        </div>

        <button onClick={resetFilters} style={secondaryButton}>
          Reset filters
        </button>
      </div>

      <h2 style={{ marginTop: 24 }}>{heading}</h2>

      {filteredTasks.length === 0 ? (
        <p className="page-text">Nothing matches your filters.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filteredTasks.map((task) => {
            const type = detectType(task.title);
            const done = isDone(task);

            return (
              <div key={task.id} style={taskCard}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {typeLabel(type)}: {cleanTitle(task.title)}
                  </div>

                  <div style={{ color: "#64748b", marginTop: 4 }}>
                    Due {formatDisplayDate(task.dueDate)}
                  </div>

                  {task.notes ? (
                    <div style={{ color: "#475569", marginTop: 8 }}>{task.notes}</div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {done ? (
                    <button
                      disabled={savingId === task.id}
                      onClick={() => setTaskStatus(task, "open")}
                      style={secondaryButton}
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      disabled={savingId === task.id}
                      onClick={() => setTaskStatus(task, "done")}
                      style={primaryButton}
                    >
                      Mark done
                    </button>
                  )}
                </div>
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

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
  fontWeight: 900,
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
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const activePill: React.CSSProperties = {
  ...pill,
  background: "#0f172a",
  color: "#fff",
};

const countBadge: React.CSSProperties = {
  marginLeft: 8,
  padding: "2px 9px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#0f172a",
};

const toolbar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 260px",
  gap: 12,
  marginBottom: 14,
};

const input: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 16,
};

const select: React.CSSProperties = {
  ...input,
  background: "#fff",
};

const taskCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
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