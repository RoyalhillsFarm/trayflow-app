// src/pages/TasksPage.tsx
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { formatDisplayDate } from "../utils/formatDate";
import sprayIcon from "../assets/icons/spray.png";
import { getTasks as getTasksSB, syncPhaseTasksRange, type Task } from "../lib/supabaseStorage";

/* ----------------- Task type detection ----------------- */
type TaskType =
  | "soak"
  | "sow"
  | "spray"
  | "lights_on"
  | "water"
  | "harvest"
  | "delivery"
  | "other";

function isSys(title: string) {
  return /^sys:/i.test(title ?? "");
}

function isDetailRow(title: string) {
  return /^sys:detail:/i.test(title ?? "");
}

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

function typeOrder(t: TaskType) {
  switch (t) {
    case "soak":
      return 0;
    case "sow":
      return 1;
    case "spray":
      return 2;
    case "lights_on":
      return 3;
    case "water":
      return 4;
    case "harvest":
      return 5;
    case "delivery":
      return 6;
    default:
      return 99;
  }
}

/* ----------------- URL param helpers ----------------- */
function parsePhaseParamToType(p: string | null): TaskType | null {
  if (!p) return null;
  const x = p.toLowerCase().trim();

  // allow both "deliver" and "delivery"
  if (x === "deliver") return "delivery";

  if (
    x === "soak" ||
    x === "sow" ||
    x === "spray" ||
    x === "lights_on" ||
    x === "water" ||
    x === "harvest" ||
    x === "delivery" ||
    x === "other"
  ) {
    return x as TaskType;
  }
  return null;
}

/* ----------------- Icon UI ----------------- */
function IconWrap({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        background: "#fff",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
      }}
    >
      {children}
    </div>
  );
}

function TaskIcon({ type }: { type: TaskType }) {
  if (type === "spray") {
    return (
      <IconWrap>
        <img
          src={sprayIcon}
          alt="Spray"
          style={{ width: 24, height: 24, objectFit: "contain", display: "block" }}
        />
      </IconWrap>
    );
  }

  const emoji: Record<TaskType, string> = {
    soak: "🪣",
    sow: "🌱",
    spray: "", // handled above
    lights_on: "💡",
    water: "💧",
    harvest: "✂️",
    delivery: "🚚",
    other: "📝",
  };

  return (
    <IconWrap>
      <span style={{ fontSize: 20, lineHeight: "20px" }}>{emoji[type] ?? "📝"}</span>
    </IconWrap>
  );
}

/* ----------------- Page ----------------- */
export default function TasksPage() {
  const location = useLocation();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Expand/collapse: key is "dueDate__type"
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TaskType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Task["status"] | "all">("all");

  const [dateFilter, setDateFilter] = useState<"overdue" | "today" | "tomorrow" | "next7" | "all">(
    "today"
  );

  // ✅ NEW: when set, TasksPage shows ONLY this date (from /tasks?date=YYYY-MM-DD)
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);

  const todayYMD = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const tomorrowYMD = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const next7EndYMD = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const isDone = (t: Task) => (t.status as any) === "delivered" || (t.status as any) === "done";
  const isOverdue = (t: Task) => t.dueDate < todayYMD && !isDone(t);
  const isToday = (t: Task) => t.dueDate === todayYMD;
  const isTomorrow = (t: Task) => t.dueDate === tomorrowYMD;
  const isInNext7 = (t: Task) => t.dueDate >= todayYMD && t.dueDate <= next7EndYMD;

  async function reload() {
    const loaded = await getTasksSB();

    // Sort: date asc -> type order -> summary before detail -> title
    const sorted = [...loaded].sort((a, b) => {
      const d = a.dueDate.localeCompare(b.dueDate);
      if (d !== 0) return d;

      const ta = detectType(a.title);
      const tb = detectType(b.title);
      const td = typeOrder(ta) - typeOrder(tb);
      if (td !== 0) return td;

      const ad = isDetailRow(a.title) ? 1 : 0;
      const bd = isDetailRow(b.title) ? 1 : 0;
      if (ad !== bd) return ad - bd;

      return cleanTitle(a.title).localeCompare(cleanTitle(b.title));
    });

    setTasks(sorted);
  }

  // ✅ Read /tasks?date=YYYY-MM-DD&phase=sow and apply filters
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const date = sp.get("date");
    const phase = parsePhaseParamToType(sp.get("phase"));

    if (date) {
      setPinnedDate(date);
      setDateFilter("all"); // dateFilter is effectively ignored when pinnedDate is set
      setQuery("");
      setExpanded({});
    } else {
      setPinnedDate(null);
    }

    if (phase) {
      setTypeFilter(phase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ Always rebuild the next 7 days when you open Tasks
        await syncPhaseTasksRange(todayYMD, 7);

        await reload();
        if (!alive) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, todayYMD]);

  async function setTaskStatus(task: Task, nextStatus: Task["status"]) {
    setSavingId(task.id);
    try {
      const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);

      if (error) throw new Error(error.message);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? "Failed to update task.");
    } finally {
      setSavingId(null);
    }
  }

  // Build a lookup: (dueDate + type) -> detail row
  const detailByDayType = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (!isDetailRow(t.title)) continue;
      const tt = detectType(t.title);
      map.set(`${t.dueDate}__${tt}`, t);
    }
    return map;
  }, [tasks]);

  // Counts (open only). Detail rows do NOT count as separate tasks.
  const doNow = useMemo(() => {
    const counts = {
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
      if (isDetailRow(t.title)) continue; // never count detail rows
      if (isDone(t)) continue;

      // If pinnedDate is active, counts should reflect that scope
      if (pinnedDate && t.dueDate !== pinnedDate) continue;

      const tt = detectType(t.title);

      counts.type.all++;
      counts.type[tt]++;

      if (isOverdue(t)) counts.overdue++;
      if (isToday(t)) counts.today++;
      if (isTomorrow(t)) counts.tomorrow++;
      if (isInNext7(t)) counts.next7++;
    }

    counts.all = counts.type.all;
    return counts;
  }, [tasks, pinnedDate, todayYMD, tomorrowYMD, next7EndYMD]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      // Hide detail rows from the list; they show only when expanded
      if (isDetailRow(t.title)) return false;

      // ✅ If pinnedDate exists, only show that date
      const matchesPinnedDate = pinnedDate ? t.dueDate === pinnedDate : true;

      const tt = detectType(t.title);
      const title = cleanTitle(t.title);

      const matchesStatus = statusFilter === "all" ? !isDone(t) : t.status === statusFilter;

      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q || title.toLowerCase().includes(q) || (t.status ?? "").toLowerCase().includes(q);

      const matchesType = typeFilter === "all" ? true : tt === typeFilter;

      const matchesDate =
        dateFilter === "all"
          ? true
          : dateFilter === "overdue"
          ? isOverdue(t)
          : dateFilter === "today"
          ? isToday(t)
          : dateFilter === "tomorrow"
          ? isTomorrow(t)
          : isInNext7(t);

      return matchesStatus && matchesQuery && matchesType && matchesDate && matchesPinnedDate;
    });
  }, [tasks, query, typeFilter, statusFilter, dateFilter, pinnedDate, todayYMD, tomorrowYMD, next7EndYMD]);

  const sectionTitle = pinnedDate
    ? `Tasks for ${formatDisplayDate(pinnedDate)}`
    : dateFilter === "overdue"
    ? "Overdue"
    : dateFilter === "today"
    ? "Due Today"
    : dateFilter === "tomorrow"
    ? "Due Tomorrow"
    : dateFilter === "next7"
    ? "Next 7 Days"
    : "All dates";

  if (loading && !tasks.length) {
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

  return (
    <div className="page">
      <h1 className="page-title">Tasks</h1>

      <div style={styles.panel}>
        <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>Today’s Do Now</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Pill
            label="Overdue"
            value={doNow.overdue}
            active={dateFilter === "overdue"}
            tone={doNow.overdue > 0 ? "danger" : "neutral"}
            onClick={() => setDateFilter("overdue")}
          />
          <Pill
            label="Due today"
            value={doNow.today}
            active={dateFilter === "today"}
            onClick={() => setDateFilter("today")}
          />
          <Pill
            label="Due tomorrow"
            value={doNow.tomorrow}
            active={dateFilter === "tomorrow"}
            onClick={() => setDateFilter("tomorrow")}
          />
          <Pill
            label="Next 7 days"
            value={doNow.next7}
            active={dateFilter === "next7"}
            onClick={() => setDateFilter("next7")}
          />
          <Pill
            label="All dates"
            value={doNow.all}
            active={dateFilter === "all"}
            onClick={() => setDateFilter("all")}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks (customer, variety, etc.)"
            style={styles.input}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{ ...styles.input, width: 220, flex: "0 0 auto" }}
          >
            <option value="all">Open tasks</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="ready">Ready</option>
            <option value="delivered">Delivered (completed)</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <TypeChip label="All" count={doNow.type.all} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
          <TypeChip label="Soak" count={doNow.type.soak} active={typeFilter === "soak"} onClick={() => setTypeFilter("soak")} />
          <TypeChip label="Sow" count={doNow.type.sow} active={typeFilter === "sow"} onClick={() => setTypeFilter("sow")} />
          <TypeChip label="Spray" count={doNow.type.spray} active={typeFilter === "spray"} onClick={() => setTypeFilter("spray")} />
          <TypeChip label="Lights On" count={doNow.type.lights_on} active={typeFilter === "lights_on"} onClick={() => setTypeFilter("lights_on")} />
          <TypeChip label="Water" count={doNow.type.water} active={typeFilter === "water"} onClick={() => setTypeFilter("water")} />
          <TypeChip label="Harvest" count={doNow.type.harvest} active={typeFilter === "harvest"} onClick={() => setTypeFilter("harvest")} />
          <TypeChip label="Deliver" count={doNow.type.delivery} active={typeFilter === "delivery"} onClick={() => setTypeFilter("delivery")} />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
              setStatusFilter("all");
              setDateFilter("today");
              setExpanded({});
              setPinnedDate(null); // ✅ clear dashboard pin
            }}
            style={styles.resetBtn}
          >
            Reset filters
          </button>

          {pinnedDate ? (
            <div style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>
              Showing only: <strong>{formatDisplayDate(pinnedDate)}</strong> (from Dashboard)
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: "0.9rem" }}>
        <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>
          {sectionTitle} ({filtered.length})
        </div>

        {filtered.length === 0 ? (
          <p className="page-text">Nothing matches your filters.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((t) => {
              const tt = detectType(t.title);
              const overdue = isOverdue(t);
              const today = isToday(t);

              const title = cleanTitle(t.title);
              const canMarkDone = !isDone(t);
              const isSaving = savingId === t.id;

              const key = `${t.dueDate}__${tt}`;
              const detail = detailByDayType.get(key);
              const open = Boolean(expanded[key]) && Boolean(detail);

              return (
                <div key={t.id}>
                  <div
                    onClick={() => {
                      // Only SYS summary rows expand
                      if (!isSys(t.title)) return;
                      setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
                    }}
                    style={{
                      padding: "0.85rem 1rem",
                      borderRadius: 14,
                      border: overdue ? "1px solid #fecaca" : "1px solid #e2e8f0",
                      background: overdue ? "#fff7ed" : "#fff",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      cursor: isSys(t.title) ? "pointer" : "default",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <TaskIcon type={tt} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>{title}</div>
                        <div style={{ fontSize: 13, color: overdue ? "#9a3412" : "#64748b", marginTop: 3 }}>
                          Due: <strong>{formatDisplayDate(t.dueDate)}</strong>
                          {today ? " • Today" : null}
                          {overdue ? " • Overdue" : null}
                          {isSys(t.title) ? (open ? " • Details open" : " • Click for details") : null}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          canMarkDone ? setTaskStatus(t, "delivered") : setTaskStatus(t, "planned");
                        }}
                        disabled={isSaving}
                        style={{
                          ...styles.doneBtn,
                          background: canMarkDone ? "#047857" : "#fff",
                          color: canMarkDone ? "#fff" : "#0f172a",
                          border: canMarkDone ? "1px solid #047857" : "1px solid #cbd5f5",
                        }}
                        title={canMarkDone ? "Mark complete" : "Undo (set back to planned)"}
                      >
                        {isSaving ? "Saving…" : canMarkDone ? "Done" : "Undo"}
                      </button>

                      <span style={statusPillStyle(t.status as any)}>{(t.status ?? "").replace("_", " ")}</span>
                    </div>
                  </div>

                  {open && detail ? (
                    <div
                      style={{
                        marginTop: 8,
                        marginLeft: 52,
                        padding: "0.75rem 1rem",
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                        color: "#0f172a",
                        fontSize: 14,
                        lineHeight: "20px",
                      }}
                    >
                      {cleanTitle(detail.title)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
        Tip: If tasks ever look stale, refresh this page to re-sync the next 7 days.
      </div>
    </div>
  );
}

/* ----------------- Small UI bits ----------------- */
function Pill({
  label,
  value,
  active,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone?: "neutral" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid #e2e8f0",
        background: active ? (tone === "danger" ? "#fee2e2" : "#0f172a") : "#fff",
        color: active ? (tone === "danger" ? "#b91c1c" : "#fff") : "#0f172a",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 14,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          padding: "2px 10px",
          borderRadius: 999,
          background: active ? (tone === "danger" ? "#fecaca" : "rgba(255,255,255,0.15)") : "#f1f5f9",
          color: active ? (tone === "danger" ? "#b91c1c" : "#fff") : "#0f172a",
          fontSize: 13,
        }}
      >
        {value}
      </span>
    </button>
  );
}

function TypeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid #e2e8f0",
        background: active ? "#0f172a" : "#fff",
        color: active ? "#fff" : "#0f172a",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 14,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          padding: "2px 10px",
          borderRadius: 999,
          background: active ? "rgba(255,255,255,0.15)" : "#f1f5f9",
          color: active ? "#fff" : "#0f172a",
          fontSize: 13,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function statusPillStyle(status: string): CSSProperties {
  const s = (status ?? "").toLowerCase();
  const base: CSSProperties = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
    fontWeight: 900,
  };

  if (s === "delivered" || s === "done") return { ...base, background: "#ecfdf5", color: "#065f46" };
  if (s === "in_progress") return { ...base, background: "#eff6ff", color: "#1e3a8a" };
  if (s === "ready") return { ...base, background: "#fef3c7", color: "#92400e" };
  return { ...base, background: "#e0f2fe", color: "#0369a1" };
}

/* ----------------- Styles ----------------- */
const styles: Record<string, CSSProperties> = {
  panel: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
    marginTop: "0.75rem",
  },
  input: {
    flex: 1,
    minWidth: 260,
    padding: "0.7rem 0.9rem",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    fontSize: 16,
    background: "#fff",
  },
  resetBtn: {
    padding: "0.6rem 0.9rem",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  doneBtn: {
    padding: "0.55rem 0.9rem",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
    minWidth: 86,
  },
};
