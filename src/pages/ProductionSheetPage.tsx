// src/pages/ProductionSheetPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { getCustomers, getOrders, type Customer, type Order, type OrderStatus } from "../lib/supabaseStorage";

type Mode = "sow" | "harvest" | "delivery";
type ShowRange = "week1" | "week2" | "weeks1_2";
type StatusFilter = "active_not_delivered" | "confirmed_packed" | "confirmed_only" | "packed_only" | "all";

type Variety = {
  id: string;
  variety: string; // <-- important: your schema uses "variety" (NOT "name")
  harvest_days: number | null;
};

type Cell = {
  trays: number;
  orders: { orderId: string; customerName: string; trays: number }[];
};

function toUtcYMD(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromMDYToYMD(mdy: string) {
  // "MM/DD/YYYY" -> "YYYY-MM-DD"
  const [mm, dd, yyyy] = mdy.split("/").map((x) => x.trim());
  if (!mm || !dd || !yyyy) return "";
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function fromYMDToMDY(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toUtcYMD(dt);
}

function startOfWeekMondayYMD(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (day + 6) % 7; // Mon => 0, Tue=>1,... Sun=>6
  dt.setUTCDate(dt.getUTCDate() - diffToMon);
  return toUtcYMD(dt);
}

function listDates(startYMD: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDaysYMD(startYMD, i));
}

function fmtDowShort(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

function fmtHeaderDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // keep compact for print
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function statusPasses(order: Order, filter: StatusFilter) {
  const s = order.status;
  if (filter === "all") return true;
  if (filter === "active_not_delivered") return s !== "delivered";
  if (filter === "confirmed_packed") return s === "confirmed" || s === "packed";
  if (filter === "confirmed_only") return s === "confirmed";
  if (filter === "packed_only") return s === "packed";
  return true;
}

function computeDateForMode(mode: Mode, deliveryYMD: string, harvestDays: number) {
  if (mode === "delivery") return deliveryYMD;
  if (mode === "harvest") return addDaysYMD(deliveryYMD, -1);
  // sow
  return addDaysYMD(deliveryYMD, -(harvestDays || 0));
}

export default function ProductionSheetPage() {
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("sow");
  const [show, setShow] = useState<ShowRange>("weeks1_2");

  const [startWeekYMD, setStartWeekYMD] = useState(() => {
    // default to current week Monday (UTC)
    const today = toUtcYMD(new Date());
    return startOfWeekMondayYMD(today);
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [varieties, setVarieties] = useState<Variety[]>([]);

  const [customerId, setCustomerId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active_not_delivered");

  const [printing, setPrinting] = useState(false);
  const prevTitleRef = useRef<string>("");

  // --- load data
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const [cs, os, vs] = await Promise.all([
          getCustomers(),
          getOrders(),
          supabase
            .from("varieties")
            // IMPORTANT: your column is "variety" (not "name")
            .select("id,variety,harvest_days")
            .order("variety", { ascending: true }),
        ]);

        if (!alive) return;
        setCustomers(cs);
        setOrders(os);

        const vrows = (vs.data ?? []) as any[];
        setVarieties(
          vrows.map((r) => ({
            id: r.id,
            variety: r.variety ?? "Variety",
            harvest_days: r.harvest_days ?? null,
          }))
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // --- printing behavior: DO NOT open a new tab; only use browser print dialog
  useEffect(() => {
    const onBefore = () => {
      document.documentElement.classList.add("tf-printing-production-sheet");
      setPrinting(true);
    };
    const onAfter = () => {
      document.documentElement.classList.remove("tf-printing-production-sheet");
      setPrinting(false);
      if (prevTitleRef.current) document.title = prevTitleRef.current;
    };

    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  const customerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) m.set(c.id, c.name);
    return m;
  }, [customers]);

  const varietyById = useMemo(() => {
    const m = new Map<string, Variety>();
    for (const v of varieties) m.set(v.id, v);
    return m;
  }, [varieties]);

  // date windows
  const week1Start = startWeekYMD;
  const week2Start = addDaysYMD(startWeekYMD, 7);

  const week1Dates = useMemo(() => listDates(week1Start, 7), [week1Start]);
  const week2Dates = useMemo(() => listDates(week2Start, 7), [week2Start]);
  const allDates = useMemo(() => [...week1Dates, ...week2Dates], [week1Dates, week2Dates]);

  const rangeDates = useMemo(() => {
    if (show === "week1") return week1Dates;
    if (show === "week2") return week2Dates;
    return allDates;
  }, [show, week1Dates, week2Dates, allDates]);

  // filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!statusPasses(o, statusFilter)) return false;
      if (customerId !== "all" && o.customerId !== customerId) return false;
      // keep only orders that might land in our visible 1-2 week window
      const v = varietyById.get(o.varietyId);
      const harvestDays = Number(v?.harvest_days ?? 0);
      const day = computeDateForMode(mode, o.deliveryDate, harvestDays);
      return day >= allDates[0] && day <= allDates[allDates.length - 1];
    });
  }, [orders, statusFilter, customerId, mode, varietyById, allDates]);

  // build grid: variety -> date -> Cell
  const grid = useMemo(() => {
    // only show varieties that have trays in the currently-selected range (week1 / week2 / both)
    const datesSet = new Set(rangeDates);

    const mapVarietyDate = new Map<string, Map<string, Cell>>();

    function ensure(varietyId: string, ymd: string) {
      let byDate = mapVarietyDate.get(varietyId);
      if (!byDate) {
        byDate = new Map();
        mapVarietyDate.set(varietyId, byDate);
      }
      let cell = byDate.get(ymd);
      if (!cell) {
        cell = { trays: 0, orders: [] };
        byDate.set(ymd, cell);
      }
      return cell;
    }

    for (const o of filteredOrders) {
      const v = varietyById.get(o.varietyId);
      const harvestDays = Number(v?.harvest_days ?? 0);
      const day = computeDateForMode(mode, o.deliveryDate, harvestDays);
      if (!datesSet.has(day)) continue;

      const cname = customerNameById.get(o.customerId) ?? "Customer";
      const cell = ensure(o.varietyId, day);
      cell.trays += Number(o.quantity || 0);
      cell.orders.push({ orderId: o.id, customerName: cname, trays: Number(o.quantity || 0) });
    }

    // list visible varieties (only those with any trays)
    const visibleVarietyIds = Array.from(mapVarietyDate.keys()).sort((a, b) => {
      const av = varietyById.get(a)?.variety ?? "";
      const bv = varietyById.get(b)?.variety ?? "";
      return av.localeCompare(bv);
    });

    // daily totals
    const totalsByDate = new Map<string, number>();
    for (const d of rangeDates) totalsByDate.set(d, 0);

    for (const vid of visibleVarietyIds) {
      const byDate = mapVarietyDate.get(vid)!;
      for (const d of rangeDates) {
        const trays = byDate.get(d)?.trays ?? 0;
        totalsByDate.set(d, (totalsByDate.get(d) ?? 0) + trays);
      }
    }

    const sowPlanTotal = rangeDates.reduce((sum, d) => sum + (totalsByDate.get(d) ?? 0), 0);

    return {
      mapVarietyDate,
      visibleVarietyIds,
      totalsByDate,
      sowPlanTotal,
    };
  }, [filteredOrders, rangeDates, mode, varietyById, customerNameById]);

  // summary cards
  const rangeLabel = useMemo(() => {
    const start = rangeDates[0];
    const end = rangeDates[rangeDates.length - 1];
    return `${start} → ${end}`;
  }, [rangeDates]);

  const rowsShown = grid.visibleVarietyIds.length;

  function snapStartWeek(mdy: string) {
    const ymd = fromMDYToYMD(mdy);
    if (!ymd) return;
    setStartWeekYMD(startOfWeekMondayYMD(ymd));
  }

  function onPrintClick() {
    // Only print styling changes; do not change the app layout.
    prevTitleRef.current = document.title;
    document.title = "Production Sheet";
    window.print();
  }

  // which sections to show on screen
  const showWeek1Section = show === "week1" || show === "weeks1_2";
  const showWeek2Section = show === "week2" || show === "weeks1_2";

  // helper render for a week table
  function renderWeekTable(weekTitle: string, dates: string[]) {
    const anyRows = grid.visibleVarietyIds.length > 0;

    return (
      <section className="tf-week" key={weekTitle}>
        <div className="tf-weekHeader">
          <div className="tf-weekTitle">{weekTitle}</div>
          <div className="tf-weekHint">Click a cell to open Tasks for that day + phase.</div>
        </div>

        <div className="tf-tableCard">
          <table className="tf-table">
            <thead>
              <tr>
                <th className="tf-colVariety">Variety</th>
                {dates.map((d) => (
                  <th key={d} className="tf-colDay">
                    <div className="tf-dow">{fmtDowShort(d)}</div>
                    <div className="tf-date">{fmtHeaderDate(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {!anyRows ? (
                <tr>
                  <td className="tf-noRows" colSpan={1 + dates.length}>
                    <div className="tf-noRowsTitle">No rows</div>
                    <div className="tf-noRowsSub">No trays for this week (based on current filters).</div>
                  </td>
                </tr>
              ) : (
                grid.visibleVarietyIds.map((vid) => {
                  const v = varietyById.get(vid);
                  return (
                    <tr key={vid} className="tf-row">
                      <td className="tf-varCell">
                        <div className="tf-varName">{v?.variety ?? "Variety"}</div>
                        <div className="tf-varSub">
                          {(v?.harvest_days ?? 0) ? `${v?.harvest_days} day grow` : "—"}
                        </div>
                      </td>

                      {dates.map((d) => {
                        const cell = grid.mapVarietyDate.get(vid)?.get(d);
                        const trays = cell?.trays ?? 0;

                        if (!trays) {
                          return (
                            <td key={d} className="tf-dayCell tf-empty">
                              <div className="tf-dash">—</div>
                            </td>
                          );
                        }

                        // keep the pill compact (professional + fits big numbers)
                        return (
                          <td key={d} className="tf-dayCell">
                            <button
                              className="tf-pill"
                              type="button"
                              onClick={() => {
                                // keep behavior simple; you can wire this into your Tasks modal if you have one
                                // For now we do nothing to avoid breaking existing app flows.
                              }}
                              title={cell?.orders.map((x) => `${x.customerName}: ${x.trays}`).join("\n")}
                            >
                              <div className="tf-pillNum">{trays}</div>
                              <div className="tf-pillLbl">Tasks →</div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}

              <tr className="tf-totalRow">
                <td className="tf-totalLabel">Daily total</td>
                {dates.map((d) => (
                  <td key={d} className="tf-totalVal">
                    {grid.totalsByDate.get(d) ?? 0}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <div className="tf-psRoot">
      <style>{`
        /* =========================
           Screen layout (professional, compact)
           ========================= */
        .tf-psRoot{
          padding: 18px 20px 32px;
          max-width: 1400px;
        }

        .tf-pageHeader{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:12px;
          margin-bottom:14px;
        }
        .tf-title{
          font-size: 48px;
          line-height: 1.05;
          letter-spacing: -0.02em;
          margin: 0;
          font-weight: 800;
          color:#0f172a;
        }
        .tf-refreshBtn{
          border:1px solid #c7d2fe;
          background:#fff;
          border-radius:999px;
          padding:10px 16px;
          font-weight:700;
          font-size:16px;
          color:#0f172a;
          cursor:pointer;
        }

        .tf-card{
          background:#fff;
          border:1px solid #e2e8f0;
          border-radius:18px;
          padding:16px;
        }

        /* top controls: NO horizontal scrolling */
        .tf-controlsGrid{
          display:grid;
          grid-template-columns: 260px 1fr;
          gap:14px;
          align-items:start;
        }

        .tf-modeCol .tf-label{
          font-size:12px;
          font-weight:700;
          color:#64748b;
          letter-spacing:0.02em;
          margin:0 0 10px 0;
        }
        .tf-modeBtns{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        }
        .tf-modeBtn{
          border:1px solid #c7d2fe;
          background:#fff;
          color:#0f172a;
          border-radius:999px;
          padding:10px 16px;
          font-weight:800;
          font-size:16px;
          cursor:pointer;
          white-space:nowrap;
        }
        .tf-modeBtn.active{
          background:#0f172a;
          color:#fff;
          border-color:#0f172a;
        }

        .tf-fields{
          display:grid;
          grid-template-columns: repeat(12, 1fr);
          gap:12px;
          align-items:end;
        }
        .tf-field{
          display:flex;
          flex-direction:column;
          gap:6px;
          min-width:0;
        }
        .tf-field label{
          font-size:12px;
          font-weight:700;
          color:#64748b;
          letter-spacing:0.02em;
        }
        .tf-input, .tf-select{
          height:44px;
          border-radius:14px;
          border:1px solid #c7d2fe;
          padding:0 12px;
          font-size:16px;
          font-weight:700;
          outline:none;
          min-width:0;
          background:#fff;
          color:#0f172a;
        }

        /* columns (fit without scroll) */
        .tf-colStart{ grid-column: span 3; }
        .tf-colShow { grid-column: span 3; }
        .tf-colCustomer{ grid-column: span 3; }
        .tf-colStatus{ grid-column: span 3; }

        .tf-colPrint{
          grid-column: span 12;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:10px;
          margin-top:2px;
        }

        .tf-printHint{
          font-size:13px;
          color:#64748b;
          font-weight:700;
          margin-right:auto;
        }
        .tf-printBtn{
          height:40px;
          border-radius:999px;
          padding:0 16px;
          border:1px solid #0f172a;
          background:#0f172a;
          color:#fff;
          font-weight:800;
          font-size:15px;
          cursor:pointer;
          white-space:nowrap;
        }

        .tf-subcopy{
          margin-top:10px;
          color:#64748b;
          font-size:14px;
          line-height:1.35;
          font-weight:600;
        }

        .tf-kpis{
          display:grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap:12px;
          margin-top:14px;
        }
        .tf-kpi{
          border:1px solid #e2e8f0;
          border-radius:16px;
          padding:14px;
        }
        .tf-kpiLabel{
          font-size:13px;
          font-weight:800;
          color:#64748b;
          margin-bottom:6px;
        }
        .tf-kpiVal{
          font-size:26px;
          font-weight:900;
          color:#0f172a;
        }

        .tf-week{
          margin-top:18px;
        }
        .tf-weekHeader{
          display:flex;
          justify-content:space-between;
          align-items:flex-end;
          gap:10px;
          margin: 6px 2px 10px;
        }
        .tf-weekTitle{
          font-size:22px;
          font-weight:900;
          color:#0f172a;
        }
        .tf-weekHint{
          font-size:13px;
          font-weight:700;
          color:#64748b;
        }

        .tf-tableCard{
          border:1px solid #e2e8f0;
          border-radius:18px;
          overflow:hidden;
          background:#fff;
        }
        .tf-table{
          width:100%;
          border-collapse:separate;
          border-spacing:0;
        }
        .tf-table thead th{
          background:#f8fafc;
          border-bottom:1px solid #e2e8f0;
          padding:12px 10px;
          vertical-align:bottom;
        }
        .tf-colVariety{
          text-align:left;
          width: 360px;
        }
        .tf-colDay{
          text-align:center;
          width: calc((100% - 360px) / 7);
        }
        .tf-dow{
          font-size:14px;
          font-weight:900;
          color:#0f172a;
          line-height:1.1;
        }
        .tf-date{
          font-size:13px;
          font-weight:800;
          color:#64748b;
          margin-top:4px;
        }

        .tf-row td{
          border-bottom:1px solid #eef2ff;
          padding:12px 10px;
        }
        .tf-varCell{
          text-align:left;
        }
        .tf-varName{
          font-size:20px;
          font-weight:900;
          color:#0f172a;
          line-height:1.1;
        }
        .tf-varSub{
          font-size:13px;
          font-weight:700;
          color:#64748b;
          margin-top:6px;
        }

        .tf-dayCell{
          text-align:center;
        }
        .tf-dayCell.tf-empty{
          color:#cbd5e1;
        }
        .tf-dash{
          font-weight:900;
          color:#cbd5e1;
        }

        .tf-pill{
          display:inline-flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:2px;
          width: 74px;
          height: 54px;
          border-radius:16px;
          background:#fff;
          border:1px solid #c7d2fe;
          cursor:pointer;
        }
        .tf-pillNum{
          font-size:18px;
          font-weight:900;
          color:#0f172a;
          line-height:1;
        }
        .tf-pillLbl{
          font-size:13px;
          font-weight:800;
          color:#64748b;
          line-height:1;
        }

        .tf-totalRow td{
          background:#f8fafc;
          border-top:1px solid #e2e8f0;
          border-bottom:none;
          padding:12px 10px;
        }
        .tf-totalLabel{
          font-size:18px;
          font-weight:900;
          color:#0f172a;
          text-align:left;
        }
        .tf-totalVal{
          font-size:18px;
          font-weight:900;
          color:#0f172a;
          text-align:center;
        }

        .tf-noRows{
          padding:16px;
        }
        .tf-noRowsTitle{
          font-size:18px;
          font-weight:900;
          color:#0f172a;
          margin-bottom:6px;
        }
        .tf-noRowsSub{
          font-size:14px;
          font-weight:700;
          color:#64748b;
        }

        /* responsive: stack fields before they overflow */
        @media (max-width: 1100px){
          .tf-controlsGrid{ grid-template-columns: 1fr; }
          .tf-colStart, .tf-colShow, .tf-colCustomer, .tf-colStatus{ grid-column: span 12; }
          .tf-colVariety{ width: 280px; }
          .tf-title{ font-size: 40px; }
        }

        /* =========================
           PRINT ONLY (DO NOT affect screen)
           - Hide app chrome (top/side bars) aggressively
           - Force clean pages + proper page breaks
           ========================= */
        @media print {
          @page { size: landscape; margin: 10mm; }

          /* Hide common app chrome selectors without touching screen UI */
          header, nav, aside, footer,
          [role="navigation"],
          .sidebar, .SideBar, .app-sidebar, .AppSidebar,
          .topbar, .TopBar, .app-topbar, .AppTopbar,
          .layout-sidebar, .layout-topbar,
          .shell-sidebar, .shell-topbar,
          .tf-refreshBtn {
            display: none !important;
          }

          /* Remove any padding/margins that come from the shell */
          body{
            background:#fff !important;
          }
          .tf-psRoot{
            padding: 0 !important;
            max-width: none !important;
          }

          /* Make tables deterministic + multi-page safe */
          .tf-card{
            border: none !important;
            padding: 0 !important;
          }

          /* Print should NOT show interactive controls (keep summary, weeks) */
          .tf-controlsGrid,
          .tf-subcopy{
            display: none !important;
          }

          /* keep title compact for print */
          .tf-title{
            font-size: 22px !important;
            margin: 0 0 8px 0 !important;
          }

          /* KPI cards: tighten */
          .tf-kpis{ gap: 8px !important; margin-top: 8px !important; }
          .tf-kpi{ padding: 10px !important; border-radius: 10px !important; }
          .tf-kpiVal{ font-size: 18px !important; }

          /* avoid cutting rows across pages */
          tr, .tf-row, .tf-tableCard { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }

          /* Week 2 starts on new page when printing both */
          .tf-week{
            break-before: auto;
          }
          .tf-week + .tf-week{
            break-before: page;
          }

          /* compact table for print */
          .tf-varName{ font-size: 14px !important; }
          .tf-varSub{ font-size: 10px !important; }
          .tf-dow{ font-size: 11px !important; }
          .tf-date{ font-size: 10px !important; }
          .tf-pill{
            width: 54px !important;
            height: 40px !important;
            border-radius: 12px !important;
          }
          .tf-pillNum{ font-size: 14px !important; }
          .tf-pillLbl{ font-size: 9px !important; }
          .tf-totalLabel, .tf-totalVal{ font-size: 12px !important; }
        }
      `}</style>

      <div className="tf-pageHeader">
        <h1 className="tf-title">Production Sheet</h1>
        <button
          className="tf-refreshBtn"
          type="button"
          onClick={async () => {
            setLoading(true);
            try {
              const [cs, os, vs] = await Promise.all([
                getCustomers(),
                getOrders(),
                supabase.from("varieties").select("id,variety,harvest_days").order("variety", { ascending: true }),
              ]);
              setCustomers(cs);
              setOrders(os);
              const vrows = (vs.data ?? []) as any[];
              setVarieties(
                vrows.map((r) => ({
                  id: r.id,
                  variety: r.variety ?? "Variety",
                  harvest_days: r.harvest_days ?? null,
                }))
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          Refresh
        </button>
      </div>

      <div className="tf-card">
        {/* Controls */}
        <div className="tf-controlsGrid">
          <div className="tf-modeCol">
            <div className="tf-label">Mode</div>
            <div className="tf-modeBtns">
              <button className={`tf-modeBtn ${mode === "sow" ? "active" : ""}`} onClick={() => setMode("sow")} type="button">
                Sow
              </button>
              <button
                className={`tf-modeBtn ${mode === "harvest" ? "active" : ""}`}
                onClick={() => setMode("harvest")}
                type="button"
              >
                Harvest
              </button>
              <button
                className={`tf-modeBtn ${mode === "delivery" ? "active" : ""}`}
                onClick={() => setMode("delivery")}
                type="button"
              >
                Delivery
              </button>
            </div>
          </div>

          <div className="tf-fields">
            <div className="tf-field tf-colStart">
              <label>Start week</label>
              <input
                className="tf-input"
                value={fromYMDToMDY(startWeekYMD)}
                onChange={(e) => snapStartWeek(e.target.value)}
                inputMode="numeric"
                placeholder="MM/DD/YYYY"
              />
              <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>Auto-snaps to Monday.</div>
            </div>

            <div className="tf-field tf-colShow">
              <label>Show</label>
              <select className="tf-select" value={show} onChange={(e) => setShow(e.target.value as ShowRange)}>
                <option value="week1">Week 1</option>
                <option value="week2">Week 2</option>
                <option value="weeks1_2">Weeks 1–2</option>
              </select>
              <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>Print follows this.</div>
            </div>

            <div className="tf-field tf-colCustomer">
              <label>Customer</label>
              <select className="tf-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="all">All customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="tf-field tf-colStatus">
              <label>Order status</label>
              <select className="tf-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="active_not_delivered">Active (not delivered)</option>
                <option value="confirmed_packed">Confirmed + Packed</option>
                <option value="confirmed_only">Confirmed only</option>
                <option value="packed_only">Packed only</option>
                <option value="all">All</option>
              </select>
            </div>

            <div className="tf-colPrint">
              <div className="tf-printHint">Print: {show === "week1" ? "Week 1 only" : show === "week2" ? "Week 2 only" : "Weeks 1–2"}</div>
              <button className="tf-printBtn" type="button" onClick={onPrintClick} disabled={loading}>
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>

        <div className="tf-subcopy">
          Built from <b>Orders</b>. Dates: <b>Sow</b> = delivery − harvest_days, <b>Harvest</b> = delivery − 1 (harvest + pack),{" "}
          <b>Delivery</b> = delivery date.
        </div>

        {/* KPIs */}
        <div className="tf-kpis">
          <div className="tf-kpi">
            <div className="tf-kpiLabel">{mode === "sow" ? "Sow plan" : mode === "harvest" ? "Harvest plan" : "Delivery plan"}</div>
            <div className="tf-kpiVal">{loading ? "…" : `${grid.sowPlanTotal} trays`}</div>
          </div>
          <div className="tf-kpi">
            <div className="tf-kpiLabel">Range</div>
            <div className="tf-kpiVal">{rangeLabel}</div>
          </div>
          <div className="tf-kpi">
            <div className="tf-kpiLabel">Rows shown</div>
            <div className="tf-kpiVal">{loading ? "…" : `${rowsShown} varieties`}</div>
          </div>
        </div>
      </div>

      {/* Weeks */}
      {loading ? (
        <div style={{ marginTop: 18, color: "#64748b", fontWeight: 700 }}>Loading…</div>
      ) : (
        <>
          {showWeek1Section &&
            renderWeekTable(`Week 1 • ${week1Dates[0]} → ${week1Dates[6]}`, week1Dates)}
          {showWeek2Section &&
            renderWeekTable(`Week 2 • ${week2Dates[0]} → ${week2Dates[6]}`, week2Dates)}
        </>
      )}

      {/* Small footer tip (screen only; print hides it) */}
      <div style={{ marginTop: 16, color: "#94a3b8", fontWeight: 700 }}>
        Master grower tip: keep this sheet for <b>big moves</b> (sow / harvest+pack / delivery). Use Tasks for step-by-step (spray,
        water, lights, etc.).
      </div>
    </div>
  );
}
