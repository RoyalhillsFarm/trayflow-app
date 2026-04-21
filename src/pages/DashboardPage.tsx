// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatDisplayDate } from "../utils/formatDate";
import { supabase } from "../utils/supabaseClient";
import { syncPhaseTasksRange, type Task } from "../lib/supabaseStorage";

/* ----------------- Mobile detector ----------------- */
function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setIsMobile(mq.matches);
    update();

    if ("addEventListener" in mq) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // @ts-ignore
    mq.addListener(update);
    // @ts-ignore
    return () => mq.removeListener(update);
  }, [breakpointPx]);

  return isMobile;
}

/* ----------------- Dashboard ----------------- */

export default function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const todayYMD = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  async function loadTasksForAccount() {
    // 🔑 STEP 1: get logged-in user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) throw userErr;
    if (!user) throw new Error("No user found");

    // 🔑 STEP 2: get account_id
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", user.id)
      .single();

    if (profileErr) throw profileErr;

    const accountId = profile.account_id;

    // 🔑 STEP 3: load ONLY this account’s tasks
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("account_id", accountId);

    if (error) throw error;

    setTasks((data as Task[]) || []);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        await syncPhaseTasksRange(todayYMD, 30);

        await loadTasksForAccount();

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
  }, [location.key, todayYMD]);

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

      <p className="page-text">
        You are now viewing ONLY your farm’s data 🌱
      </p>

      <div style={{ marginTop: 12 }}>
        <strong>Total Tasks:</strong> {tasks.length}
      </div>

      {/* Keep your existing UI below this if needed */}
    </div>
  );
}