// src/components/layout/Topbar.tsx
// Updated Topbar: centers the logo perfectly and keeps actions aligned right.

import React from "react";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      {/* This centers everything and keeps the layout consistent across pages */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center">
          
          {/* Left side spacer (keeps logo centered) */}
          <div />

          {/* Center logo */}
          <div className="flex items-center gap-2 justify-self-center">
            <img
              src="/logo.svg"
              alt="TrayFlow"
              className="h-7 w-7"
            />
            <span className="text-base font-semibold tracking-wide">
              TRAYFLOW
            </span>
          </div>

          {/* Right side buttons or actions */}
          <div className="flex items-center justify-self-end gap-2">
            <button className="rounded-2xl bg-emerald-800 px-4 py-2 text-white shadow-sm hover:bg-emerald-700">
              New Task
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
