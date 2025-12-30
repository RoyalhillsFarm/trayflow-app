// src/components/varieties/VarietyDetails.tsx
// Reusable modal to show full growing info for any variety.

import React from "react";

export type Variety = {
  name: string;
  days: number | null;
  notes?: string;
  light?: string;
  density?: string;
  medium?: string;
  harvestTips?: string;
};

interface VarietyDetailsProps {
  variety: Variety;
  onClose: () => void;
  onEdit?: (updated: Partial<Variety>) => void;
}

export default function VarietyDetails({
  variety,
  onClose,
  onEdit,
}: VarietyDetailsProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {variety.name}
        </h2>

        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <strong>Days to Harvest:</strong> {variety.days ?? "—"}
          </p>
          {variety.density && (
            <p>
              <strong>Seed Density:</strong> {variety.density}
            </p>
          )}
          {variety.light && (
            <p>
              <strong>Light Requirement:</strong> {variety.light}
            </p>
          )}
          {variety.medium && (
            <p>
              <strong>Medium:</strong> {variety.medium}
            </p>
          )}
          {variety.harvestTips && (
            <p>
              <strong>Harvest Tips:</strong> {variety.harvestTips}
            </p>
          )}
          {variety.notes && (
            <p>
              <strong>Notes:</strong> {variety.notes}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Close
          </button>
          {onEdit && (
            <button
              onClick={() =>
                onEdit({ notes: "Example: adjust density to 30g for next tray" })
              }
              className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white hover:bg-emerald-700"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
