"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  History,
  AlertTriangle,
  LogOut,
  Package,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Adresy", href: "/dashboard/recipients", icon: Users },
  { name: "Cennik", href: "/dashboard/pricelist", icon: FileText },
  { name: "Sprawdź ceny", href: "/dashboard/check-prices", icon: Truck },
  { name: "Historia", href: "/dashboard/history", icon: History },
  { name: "Alerty", href: "/dashboard/alerts", icon: AlertTriangle },
  { name: "Ustawienia", href: "/dashboard/settings", icon: Settings },
];

interface SidebarProps {
  userName?: string | null;
  userEmail?: string | null;
}

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="flex items-center gap-3 p-6 border-b border-slate-700">
        <div className="p-2 bg-blue-600 rounded-lg">
          <Package className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Cargoson</h1>
          <p className="text-xs text-slate-400">Monitor</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
            {userName?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {userName || "User"}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {userEmail || ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full mt-3 flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
        >
          <LogOut className="h-5 w-5" />
          <span>Wyloguj</span>
        </button>
      </div>
    </div>
  );
}
