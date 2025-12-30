// src/components/tasks/TaskCard.tsx
// Shows a single task card with the date formatted as MM-DD-YYYY (e.g., 12-10-2025)

import React from "react";
import { formatDisplayDate } from "@/utils/formatDate";

type Task = {
  id: string;
  title: string;
  dueDate: string | Date; // ISO string or Date object are both OK
  status?: "Planned" | "In Progress" | "Done";
};

export default function TaskCard({ task }: { task: Task }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="text-lg font-semibold leading-tight">{task.title}</div>

        {task.status && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {task.status}
          </span>
        )}
      </div>

      <div className="mt-1 text-sm text-slate-500">
        Due: {formatDisplayDate(task.dueDate)}
      </div>
    </div>
  );
}
