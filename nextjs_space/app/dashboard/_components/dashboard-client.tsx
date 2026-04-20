"use client";

import { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";

interface DashboardClientProps {
  children: ReactNode;
  userName?: string | null;
  userEmail?: string | null;
}

export function DashboardClient({ children, userName, userEmail }: DashboardClientProps) {
  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar userName={userName} userEmail={userEmail} />
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
