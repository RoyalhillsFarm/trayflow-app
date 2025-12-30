// src/app/layout.tsx
// Root layout for your app – keeps the Topbar and page content aligned consistently.

import React from "react";
import Topbar from "@/components/layout/Topbar"; // make sure this path matches your folder structure
import "@/styles/globals.css"; // keep this if your app already has global styles

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        {/* Header (logo + button) */}
        <Topbar />

        {/* Main content area */}
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
