import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type Task = {
  id: string;
  title: string;
  dueDate: string;
};

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  async function getAccountId() {
    const { data: userData } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", userData.user?.id)
      .single();

    return profile?.account_id;
  }

  async function loadTasks() {
    setLoading(true);

    const accountId = await getAccountId();

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("account_id", accountId);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setTasks(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const todaysTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate === today);
  }, [tasks]);

  if (loading) {
    return <div style={{ padding: 20 }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard</h1>

      <h2>Today’s Tasks</h2>

      {todaysTasks.length === 0 ? (
        <p>No tasks today</p>
      ) : (
        todaysTasks.map((t) => (
          <div
            key={t.id}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            {t.title}
          </div>
        ))
      )}
    </div>
  );
}