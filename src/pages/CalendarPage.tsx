// src/pages/CalendarPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { formatDisplayDate } from "../utils/formatDate";
import { getTasks as getTasksSB, syncPhaseTasksRange, type Task } from "../lib/supabaseStorage";

/* ----------------- Helpers ----------------- */
function toYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0 Sun
  return addDays(x, -dow);
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

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

function parseSysDetail(cleaned: string): { phaseTitle: string; detailText: string } {
  // cleaned example: "Spray (Blackout) — Ling — 5 trays (Amaranth x1...) • Test — 2 trays ..."
  const parts = cleaned.split(" — ");
  if (parts.length <= 1) return { phaseTitle: cleaned.trim(), detailText: "" };
  const phaseTitle = parts.shift()!.trim();
  const detailText = parts.join(" — ").trim();
  return { phaseTitle, detailText };
}

type CalItem = {
  id: string;
  date: string; // ymd
  title: string; // cleaned display title
  status?: string | null;
  taskType?: string | null;
  isSys: boolean;
};

/* ----------------- Page ----------------- */
export default function CalendarPage() {
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"week" | "month">("week");

  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Modal
  const [openItem, setOpenItem] = useState<CalItem | null>(null);

  const todayYMD = useMemo(() => toYMD(new Date()), []);

  async function reload() {
    const loaded = await getTasksSB();
    setTasks(loaded);
  }

  async function resyncAndReload() {
    setLoading(true);
    setError(null);
    try {
      await syncPhaseTasksRange(todayYMD, 30);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to load calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ Ensure SYS tasks exist (same concept as Tasks page)
        await syncPhaseTasksRange(todayYMD, 30);

        await reload();
        if (!alive) return;
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load calendar.");
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

  // Build SYS detail lookup:
  // key = `${ymd}__${phaseTitleLower}`
  const sysDetailByDayPhase = useMemo(() => {
    const m = new Map<string, { phaseTitle: string; detailText: string }>();

    for (const t of tasks) {
      if (!isDetailRow(t.title)) continue;
      const cleaned = cleanTitle(t.title);
      const parsed = parseSysDetail(cleaned);
      const key = `${t.dueDate}__${parsed.phaseTitle.toLowerCase()}`;
      m.set(key, parsed);
    }

    return m;
  }, [tasks]);

  const items: CalItem[] = useMemo(() => {
    // Show:
    // - SYS summary rows (NOT detail rows)
    // - manual tasks (non-SYS)
    const filtered = tasks.filter((t) => {
      if (isSys(t.title)) return !isDetailRow(t.title);
      return true;
    });

    return filtered.map((t) => ({
      id: t.id,
      date: t.dueDate,
      title: cleanTitle(t.title),
      status: (t as any).status ?? null,
      taskType: (t as any).task_type ?? null,
      isSys: isSys(t.title),
    }));
  }, [tasks]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) {
      const arr = m.get(it.date) ?? [];
      arr.push(it);
      m.set(it.date, arr);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      m.set(k, arr);
    }
    return m;
  }, [items]);

  /* ----------------- Week view range ----------------- */
  const weekDays = useMemo(() => {
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [anchor]);

  /* ----------------- Month view grid ----------------- */
  const monthGrid = useMemo(() => {
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first); // start on Sunday
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)); // 6 weeks
  }, [anchor]);

  const headerLabel = useMemo(() => {
    const d = anchor;
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [anchor]);

  function prev() {
    setAnchor((d) => {
      const x = new Date(d);
      if (view === "week") x.setDate(x.getDate() - 7);
      else x.setMonth(x.getMonth() - 1);
      return x;
    });
  }
  function next() {
    setAnchor((d) => {
      const x = new Date(d);
      if (view === "week") x.setDate(x.getDate() + 7);
      else x.setMonth(x.getMonth() + 1);
      return x;
    });
  }
  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  }

  const modalDetail = useMemo(() => {
    if (!openItem) return null;

    if (!openItem.isSys) {
      return {
        header: openItem.title,
        sub: `${formatDisplayDate(openItem.date)}${openItem.status ? ` • ${String(openItem.status).replace("_", " ")}` : ""}`,
        body: "",
      };
    }

    // SYS summary: find matching SYS:DETAIL text
    const phaseTitle = openItem.title;
    const key = `${openItem.date}__${phaseTitle.toLowerCase()}`;
    const parsed = sysDetailByDayPhase.get(key);

    return {
      header: phaseTitle,
      sub: `${formatDisplayDate(openItem.date)} • grouped`,
      body: parsed?.detailText ?? "No detail found for this task yet.",
    };
  }, [openItem, sysDetailByDayPhase]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Calendar</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Calendar</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Calendar</h1>

      <div style={styles.toolbar}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={prev} style={styles.btn}>
            ←
          </button>
          <button onClick={goToday} style={styles.btn}>
            Today
          </button>
          <button onClick={next} style={styles.btn}>
            →
          </button>

          <div style={{ fontWeight: 900, color: "#0f172a", marginLeft: 6 }}>{headerLabel}</div>

          <button onClick={resyncAndReload} style={{ ...styles.btn, marginLeft: 8 }} title="Rebuild SYS tasks for next 30 days">
            Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setView("week")}
            style={{
              ...styles.btn,
              background: view === "week" ? "#0f172a" : "#fff",
              color: view === "week" ? "#fff" : "#0f172a",
            }}
          >
            Week
          </button>
          <button
            onClick={() => setView("month")}
            style={{
              ...styles.btn,
              background: view === "month" ? "#0f172a" : "#fff",
              color: view === "month" ? "#fff" : "#0f172a",
            }}
          >
            Month
          </button>
        </div>
      </div>

      {view === "week" ? (
        <div style={styles.weekGrid}>
          {weekDays.map((d) => {
            const ymd = toYMD(d);
            const list = byDate.get(ymd) ?? [];
            const isToday = ymd === todayYMD;

            return (
              <div key={ymd} style={{ ...styles.dayCol, borderColor: isToday ? "#93c5fd" : "#e2e8f0" }}>
                <div style={styles.dayHeader}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{formatDisplayDate(ymd)}</div>
                </div>

                {list.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#94a3b8", padding: 10 }}>No tasks</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
                    {list.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => setOpenItem(it)}
                        style={styles.itemBtn}
                        title="Click for details"
                      >
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>{it.title}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {it.isSys ? "SYS" : it.taskType ? it.taskType : "task"}
                          {it.status ? ` • ${String(it.status).replace("_", " ")}` : ""}
                          {it.isSys ? " • Click for details" : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={styles.monthGrid}>
          {monthGrid.map((d, idx) => {
            const ymd = toYMD(d);
            const list = byDate.get(ymd) ?? [];
            const isToday = ymd === todayYMD;
            const isThisMonth = d.getMonth() === anchor.getMonth();

            return (
              <div
                key={`${ymd}_${idx}`}
                style={{
                  ...styles.monthCell,
                  opacity: isThisMonth ? 1 : 0.45,
                  borderColor: isToday ? "#93c5fd" : "#e2e8f0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>{d.getDate()}</div>
                  {list.length ? <div style={{ fontSize: 12, color: "#64748b" }}>{list.length}</div> : null}
                </div>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.slice(0, 3).map((it) => (
                    <button
                      key={it.id}
                      style={styles.monthPillBtn}
                      title="Click for details"
                      onClick={() => setOpenItem(it)}
                    >
                      {it.title}
                    </button>
                  ))}
                  {list.length > 3 ? <div style={{ fontSize: 12, color: "#64748b" }}>+{list.length - 3} more</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 12, color: "#64748b" }}>
        Calendar is built from Tasks (SYS tasks + manual tasks). If you just created an order, click <strong>Refresh</strong>.
      </div>

      {/* ----------------- Modal ----------------- */}
      {openItem && modalDetail ? (
        <div
          onClick={() => setOpenItem(null)}
          style={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={styles.modalCard}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>
                  {modalDetail.header}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  {modalDetail.sub}
                </div>
              </div>

              <button onClick={() => setOpenItem(null)} style={styles.closeBtn} aria-label="Close">
                ✕
              </button>
            </div>

            {openItem.isSys ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, marginBottom: 6 }}>
                  Details
                </div>
                <div style={styles.detailBox}>
                  {modalDetail.body || "No details."}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, marginBottom: 6 }}>
                  Task
                </div>
                <div style={styles.detailBox}>
                  {openItem.title}
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setOpenItem(null)} style={styles.btn}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------- Styles ----------------- */
const styles: Record<string, CSSProperties> = {
  toolbar: {
    marginTop: "0.75rem",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 12,
    background: "#fff",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  btn: {
    padding: "0.55rem 0.9rem",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },

  weekGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 10,
  },
  dayCol: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fff",
    overflow: "hidden",
    minHeight: 220,
  },
  dayHeader: {
    padding: 10,
    borderBottom: "1px solid #eef2ff",
    background: "#f8fafc",
  },
  itemBtn: {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "8px 10px",
    background: "#fff",
    textAlign: "left",
    cursor: "pointer",
  },

  monthGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 10,
  },
  monthCell: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fff",
    padding: 10,
    minHeight: 120,
  },
  monthPillBtn: {
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    background: "#f8fafc",
    color: "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "left",
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    zIndex: 1000,
  },
  modalCard: {
    width: "min(720px, 100%)",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: 14,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  closeBtn: {
    border: "1px solid #e2e8f0",
    background: "#fff",
    borderRadius: 12,
    cursor: "pointer",
    padding: "8px 10px",
    fontWeight: 900,
  },
  detailBox: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    color: "#0f172a",
    fontSize: 14,
    lineHeight: "20px",
    whiteSpace: "pre-wrap",
  },
};
