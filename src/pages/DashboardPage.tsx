// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatDisplayDate } from "../utils/formatDate";
import {
  getTasks as getTasksSB,
  syncPhaseTasksRange,
  type Task,
} from "../lib/supabaseStorage";

/* ----------------- Types / Helpers ----------------- */
type Phase =
  | "soak"
  | "sow"
  | "spray"
  | "lights_on"
  | "water"
  | "harvest"
  | "deliver"
  | "other";

const PHASES: Array<{ phase: Phase; label: string; color: string; order: number }> = [
  { phase: "soak", label: "Soak", color: "#60a5fa", order: 0 },
  { phase: "sow", label: "Sow", color: "#10b981", order: 1 },
  { phase: "spray", label: "Spray", color: "#f59e0b", order: 2 },
  { phase: "lights_on", label: "Lights On", color: "#8b5cf6", order: 3 },
  { phase: "water", label: "Water", color: "#06b6d4", order: 4 },
  { phase: "harvest", label: "Harvest", color: "#ef4444", order: 5 },
  { phase: "deliver", label: "Deliver", color: "#111827", order: 6 },
  { phase: "other", label: "Other", color: "#94a3b8", order: 99 },
];

function toYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYMD(d);
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

function detectPhaseFromSysTitle(title: string): Phase {
  // We store SYS titles like: "SYS:Sow trays" and SYS:DETAIL:... versions.
  const s = cleanTitle(title).toLowerCase();
  if (s.startsWith("soak")) return "soak";
  if (s.startsWith("sow")) return "sow";
  if (s.startsWith("spray")) return "spray";
  if (s.startsWith("lights on")) return "lights_on";
  if (s.startsWith("water")) return "water";
  if (s.startsWith("harvest")) return "harvest";
  if (s.startsWith("deliver")) return "deliver";
  return "other";
}

function phaseLabel(p: Phase) {
  return PHASES.find((x) => x.phase === p)?.label ?? "Other";
}

function phaseColor(p: Phase) {
  return PHASES.find((x) => x.phase === p)?.color ?? "#94a3b8";
}

function phaseOrder(p: Phase) {
  return PHASES.find((x) => x.phase === p)?.order ?? 99;
}

function sumXQuantities(text: string): number {
  // For non-deliver SYS detail rows we generate items like "... x3, ... x12"
  // Sum all "xN" occurrences.
  const matches = Array.from((text ?? "").matchAll(/\bx(\d+)\b/gi));
  return matches.reduce((sum, m) => sum + (Number(m[1]) || 0), 0);
}

function sumDeliverTrays(text: string): number {
  // Deliver detail rows look like:
  // "Customer — 5 trays (Variety x1, ... ) • Other — 2 trays (...)"
  const matches = Array.from((text ?? "").matchAll(/—\s*(\d+)\s*trays\b/gi));
  if (matches.length) return matches.reduce((sum, m) => sum + (Number(m[1]) || 0), 0);

  // Fallback (if formatting changes): sum xN
  return sumXQuantities(text);
}

function parseDeliverTopCustomers(detailText: string, max = 2): Array<{ name: string; trays: number }> {
  // Split by bullet dot " • " then parse "Name — N trays"
  const parts = (detailText ?? "").split("•").map((x) => x.trim()).filter(Boolean);
  const out: Array<{ name: string; trays: number }> = [];
  for (const p of parts) {
    const m = p.match(/^(.+?)\s+—\s+(\d+)\s*trays\b/i);
    if (m?.[1] && m?.[2]) out.push({ name: m[1].trim(), trays: Number(m[2]) || 0 });
  }
  out.sort((a, b) => b.trays - a.trays || a.name.localeCompare(b.name));
  return out.slice(0, max);
}

/* ----------------- Dashboard ----------------- */
type DayCounts = Record<Phase, number>;

export default function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const todayYMD = useMemo(() => toYMD(new Date()), []);

  async function reload() {
    const loaded = await getTasksSB();
    setTasks(loaded);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Keep SYS tasks fresh for dashboard lookahead
        await syncPhaseTasksRange(todayYMD, 30);
        await reload();

        if (!alive) return;
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load dashboard.");
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

  function openTasks(date: string, phase?: Phase) {
    const qs = new URLSearchParams();
    qs.set("date", date);
    if (phase && phase !== "other") qs.set("phase", phase);
    navigate(`/tasks?${qs.toString()}`);
  }

  /**
   * We compute counts from SYS:DETAIL rows (because SYS summary rows don’t store quantities).
   * - For deliver: parse "— N trays"
   * - For others: sum all "xN"
   */
  const detailCountsByDay: Map<string, DayCounts> = useMemo(() => {
    const m = new Map<string, DayCounts>();

    const ensure = (d: string) => {
      const existing = m.get(d);
      if (existing) return existing;
      const blank: DayCounts = {
        soak: 0,
        sow: 0,
        spray: 0,
        lights_on: 0,
        water: 0,
        harvest: 0,
        deliver: 0,
        other: 0,
      };
      m.set(d, blank);
      return blank;
    };

    for (const t of tasks) {
      if (!isSys(t.title)) continue;
      if (!isDetailRow(t.title)) continue;

      const due = t.dueDate;
      const phase = detectPhaseFromSysTitle(t.title);

      const cleaned = cleanTitle(t.title);
      // Detail rows include "… — {detailText}"
      const detailText = cleaned.includes("—") ? cleaned.split("—").slice(1).join("—").trim() : cleaned;

      const count =
        phase === "deliver" ? sumDeliverTrays(detailText) : sumXQuantities(detailText);

      const bucket = ensure(due);
      bucket[phase] = Math.max(bucket[phase] || 0, count || 0);
    }

    return m;
  }, [tasks]);

  const next14Days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDaysYMD(todayYMD, i));
  }, [todayYMD]);

  const next7Days = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => addDaysYMD(todayYMD, i)); // ✅ “Next 3 days” (more grower-realistic)
  }, [todayYMD]);

  const chartData = useMemo(() => {
    // For each day, get counts by phase and total
    return next14Days.map((d) => {
      const counts = detailCountsByDay.get(d) ?? {
        soak: 0,
        sow: 0,
        spray: 0,
        lights_on: 0,
        water: 0,
        harvest: 0,
        deliver: 0,
        other: 0,
      };
      const total =
        counts.soak +
        counts.sow +
        counts.spray +
        counts.lights_on +
        counts.water +
        counts.harvest +
        counts.deliver +
        counts.other;

      return { date: d, counts, total };
    });
  }, [next14Days, detailCountsByDay]);

  const maxTotal = useMemo(() => {
    return Math.max(1, ...chartData.map((x) => x.total));
  }, [chartData]);

  const todayCounts = useMemo(() => {
    return (
      detailCountsByDay.get(todayYMD) ?? {
        soak: 0,
        sow: 0,
        spray: 0,
        lights_on: 0,
        water: 0,
        harvest: 0,
        deliver: 0,
        other: 0,
      }
    );
  }, [detailCountsByDay, todayYMD]);

  const upcomingDeliveries = useMemo(() => {
    // Pull deliver SYS:DETAIL rows for the next 14 days
    const rows = tasks
      .filter((t) => isSys(t.title) && isDetailRow(t.title) && detectPhaseFromSysTitle(t.title) === "deliver")
      .map((t) => {
        const cleaned = cleanTitle(t.title);
        const detailText = cleaned.includes("—") ? cleaned.split("—").slice(1).join("—").trim() : cleaned;
        const trays = sumDeliverTrays(detailText);
        const top = parseDeliverTopCustomers(detailText, 2);
        return { date: t.dueDate, trays, top };
      })
      .filter((x) => x.date >= todayYMD)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate per date (take max trays)
    const byDate = new Map<string, { date: string; trays: number; top: Array<{ name: string; trays: number }> }>();
    for (const r of rows) {
      const prev = byDate.get(r.date);
      if (!prev || r.trays > prev.trays) byDate.set(r.date, r);
    }
    return Array.from(byDate.values()).slice(0, 5);
  }, [tasks, todayYMD]);

  const loadChecks = useMemo(() => {
    // Simple grower-style flags based on the next 7 days (tweak thresholds anytime)
    const days = Array.from({ length: 7 }, (_, i) => addDaysYMD(todayYMD, i));
    const totals = {
      water: 0,
      sow: 0,
      harvest: 0,
      deliver: 0,
    };

    for (const d of days) {
      const c = detailCountsByDay.get(d);
      if (!c) continue;
      totals.water += c.water || 0;
      totals.sow += c.sow || 0;
      totals.harvest += c.harvest || 0;
      totals.deliver += c.deliver || 0;
    }

    const flags: Array<{ tone: "danger" | "warn" | "ok"; title: string; note: string }> = [];

    // Heuristics (safe defaults)
    if (totals.deliver >= 40) {
      flags.push({ tone: "danger", title: "Delivery crunch", note: "Heavy delivery load in the next 7 days." });
    } else if (totals.deliver >= 20) {
      flags.push({ tone: "warn", title: "Delivery busy", note: "Keep packing time protected." });
    } else {
      flags.push({ tone: "ok", title: "Deliveries ok", note: "No major delivery crunch detected." });
    }

    if (totals.harvest >= 60) {
      flags.push({ tone: "danger", title: "Harvest heavy", note: "Schedule harvest labor / packing flow." });
    } else if (totals.harvest >= 30) {
      flags.push({ tone: "warn", title: "Harvest moderate", note: "Watch harvest day spacing." });
    }

    if (totals.water >= 200) {
      flags.push({ tone: "warn", title: "Watering load", note: "Consider irrigation batching / staging." });
    }

    if (totals.sow >= 40) {
      flags.push({ tone: "warn", title: "Sow days heavy", note: "Confirm media + seed inventory." });
    }

    return flags.slice(0, 5);
  }, [detailCountsByDay, todayYMD]);

  const next3Cards = useMemo(() => {
    return next7Days.map((d) => {
      const counts =
        detailCountsByDay.get(d) ?? {
          soak: 0,
          sow: 0,
          spray: 0,
          lights_on: 0,
          water: 0,
          harvest: 0,
          deliver: 0,
          other: 0,
        };

      const phases = (Object.keys(counts) as Phase[])
        .filter((p) => p !== "other" && (counts[p] ?? 0) > 0)
        .sort((a, b) => phaseOrder(a) - phaseOrder(b))
        .map((p) => ({ phase: p, label: phaseLabel(p), count: counts[p] ?? 0 }));

      return { date: d, phases };
    });
  }, [next7Days, detailCountsByDay]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-text">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      {/* -------- Row 1: Today + Deliveries + Flags -------- */}
      <div style={styles.topGrid}>
        {/* Today’s Do Now */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Today’s Do Now</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {(["soak", "sow", "spray", "lights_on", "water", "harvest", "deliver"] as Phase[]).map((p) => {
              const v = todayCounts[p] ?? 0;
              const toneBg = v > 0 ? "#f8fafc" : "#ffffff";
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => openTasks(todayYMD, p)}
                  style={{
                    ...styles.kpiBtn,
                    background: toneBg,
                    borderColor: v > 0 ? "#e2e8f0" : "#f1f5f9",
                    opacity: v > 0 ? 1 : 0.55,
                  }}
                  title={`Open Tasks: ${phaseLabel(p)} for today`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: phaseColor(p), display: "inline-block" }} />
                    <span style={{ fontWeight: 900, color: "#0f172a" }}>{phaseLabel(p)}</span>
                  </div>
                  <span style={styles.kpiValue}>{v}</span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={styles.primaryBtn} onClick={() => openTasks(todayYMD)}>
              Open today’s Tasks
            </button>
            <button type="button" style={styles.secondaryBtn} onClick={() => navigate("/tasks")}>
              All Tasks
            </button>
          </div>
        </div>

        {/* Upcoming deliveries */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Upcoming deliveries</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {upcomingDeliveries.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>No upcoming deliveries detected.</div>
            ) : (
              upcomingDeliveries.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => openTasks(d.date, "deliver")}
                  style={styles.deliveryRowBtn}
                  title="Open Deliver tasks for this date"
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{formatDisplayDate(d.date)}</div>
                    {d.top.length ? (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {d.top
                          .map((x) => `${x.name} (${x.trays})`)
                          .join(" • ")}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Delivery breakdown available in Tasks</div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ ...styles.pill, background: "#111827", color: "#fff" }}>
                      {d.trays} trays
                    </span>
                    <span style={{ color: "#64748b", fontWeight: 900 }}>→</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Load checks */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Load checks</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {loadChecks.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>No flags.</div>
            ) : (
              loadChecks.map((f, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.flagRow,
                    borderColor:
                      f.tone === "danger" ? "#fecaca" : f.tone === "warn" ? "#fde68a" : "#e2e8f0",
                    background:
                      f.tone === "danger" ? "#fff1f2" : f.tone === "warn" ? "#fffbeb" : "#f8fafc",
                  }}
                >
                  <div style={{ fontWeight: 900, color: f.tone === "danger" ? "#b91c1c" : "#0f172a" }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{f.note}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* -------- Row 2: 14-day workload chart -------- */}
      <div style={{ ...styles.card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={styles.cardTitle}>At-a-glance workload (next 14 days)</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Bars are stacked by phase (trays). Click a day to open Tasks.
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PHASES.filter((x) => x.phase !== "other").map((p) => (
            <div key={p.phase} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: p.color, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "#0f172a", fontWeight: 800 }}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={styles.chartWrap}>
          {chartData.map((d) => {
            const heightPct = (d.total / maxTotal) * 100;
            const isToday = d.date === todayYMD;

            // Build stacked segments (each segment height within the bar proportional to its count)
            const segments = (["soak", "sow", "spray", "lights_on", "water", "harvest", "deliver"] as Phase[])
              .map((p) => ({ phase: p, count: d.counts[p] ?? 0 }))
              .filter((x) => x.count > 0)
              .sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase));

            return (
              <button
                key={d.date}
                type="button"
                onClick={() => openTasks(d.date)}
                style={{
                  ...styles.barColBtn,
                  borderColor: isToday ? "#93c5fd" : "#e2e8f0",
                  background: isToday ? "#eff6ff" : "#fff",
                }}
                title={`Open Tasks for ${formatDisplayDate(d.date)} (total ${d.total})`}
              >
                <div style={styles.barArea}>
                  <div style={{ ...styles.bar, height: `${heightPct}%` }}>
                    {segments.length === 0 ? (
                      <div style={{ height: "100%", borderRadius: 10, border: "1px dashed #e2e8f0" }} />
                    ) : (
                      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                        {segments.map((s) => {
                          const segPct = (s.count / d.total) * 100;
                          return (
                            <div
                              key={s.phase}
                              style={{
                                height: `${segPct}%`,
                                background: phaseColor(s.phase),
                                borderRadius: 0,
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div style={styles.barLabel}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{new Date(d.date + "T00:00:00").getDate()}</div>
                  <div style={{ ...styles.pill, marginTop: 6 }}>{d.total}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* -------- Row 3: Next few days (clickable) -------- */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>Next 3 days</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {next3Cards.map((day) => {
            const isToday = day.date === todayYMD;
            return (
              <div
                key={day.date}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => openTasks(day.date)}
                  style={{
                    ...styles.dayHeaderBtn,
                    borderBottom: "1px solid #eef2ff",
                    background: isToday ? "#eff6ff" : "#f8fafc",
                  }}
                  title="Open Tasks for this date"
                >
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>{formatDisplayDate(day.date)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{isToday ? "Today" : ""}</div>
                </button>

                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {day.phases.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>No tasks</div>
                  ) : (
                    day.phases.map((p) => (
                      <button
                        key={p.phase}
                        type="button"
                        onClick={() => openTasks(day.date, p.phase)}
                        style={styles.phaseRowBtn}
                        title={`Open Tasks: ${p.label} (${p.count})`}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: phaseColor(p.phase), display: "inline-block" }} />
                          <span style={{ fontWeight: 900, color: "#0f172a" }}>{p.label}</span>
                        </span>
                        <span style={styles.countPill}>{p.count}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
          Tip: click a day or phase to jump straight into Tasks filtered for that date/phase.
        </div>
      </div>
    </div>
  );
}

/* ----------------- Styles ----------------- */
const styles: Record<string, CSSProperties> = {
  topGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr 0.9fr",
    gap: 12,
    alignItems: "start",
  },
  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fff",
    padding: 12,
  },
  cardTitle: {
    fontWeight: 900,
    color: "#0f172a",
    fontSize: 14,
  },

  primaryBtn: {
    padding: "0.55rem 0.9rem",
    borderRadius: 12,
    border: "none",
    background: "#047857",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
  },
  secondaryBtn: {
    padding: "0.55rem 0.9rem",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    background: "#fff",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 900,
  },

  pill: {
    fontSize: 12,
    fontWeight: 900,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#0f172a",
    whiteSpace: "nowrap",
  },

  kpiBtn: {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "10px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    cursor: "pointer",
    textAlign: "left",
  },
  kpiValue: {
    fontWeight: 900,
    color: "#0f172a",
    fontSize: 16,
  },

  deliveryRowBtn: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "10px 10px",
    background: "#fff",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },

  flagRow: {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "10px 10px",
  },

  chartWrap: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(14, minmax(0, 1fr))",
    gap: 8,
    alignItems: "end",
  },
  barColBtn: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fff",
    cursor: "pointer",
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 220,
  },
  barArea: {
    flex: 1,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  bar: {
    width: "100%",
    maxWidth: 26,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #e2e8f0",
    background: "#fff",
  },
  barLabel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },

  dayHeaderBtn: {
    width: "100%",
    textAlign: "left",
    border: "none",
    cursor: "pointer",
    padding: 10,
  },
  phaseRowBtn: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
  },
  countPill: {
    fontSize: 12,
    fontWeight: 900,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#0f172a",
    whiteSpace: "nowrap",
  },
};
