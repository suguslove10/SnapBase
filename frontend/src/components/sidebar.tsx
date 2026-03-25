"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Database,
  CalendarClock,
  History,
  AlertTriangle,
  HardDrive,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard",   label: "Dashboard",      icon: LayoutDashboard },
  { href: "/connections", label: "Connections",    icon: Database },
  { href: "/schedules",   label: "Schedules",      icon: CalendarClock },
  { href: "/backups",     label: "Backup History", icon: History },
  { href: "/anomalies",   label: "Anomalies",      icon: AlertTriangle },
  { href: "/storage",     label: "Storage",        icon: HardDrive },
  { href: "/settings",    label: "Settings",       icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-white/[0.06]"
      style={{ background: "#080d1a" }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black text-[#0a0f1e]" style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}>SB</div>
        <span className="font-grotesk text-[15px] font-semibold text-white">SnapBase</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <p className="mb-2 px-3 font-jetbrains text-[9px] uppercase tracking-widest text-slate-700">
          Menu
        </p>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150"
              style={active ? { background: "rgba(0,180,255,0.10)" } : undefined}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full"
                  style={{ background: "linear-gradient(180deg, #00b4ff, #00f5d4)" }}
                />
              )}
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  active
                    ? "text-[#00b4ff]"
                    : "text-slate-600 group-hover:text-slate-300"
                }`}
              />
              <span
                className={`transition-colors ${
                  active
                    ? "text-[#00b4ff]"
                    : "text-slate-500 group-hover:text-slate-300"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/[0.06] p-3">
        <button
          onClick={logout}
          className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-red-400" />
          <span className="text-slate-600 transition-colors group-hover:text-red-400">Logout</span>
        </button>
      </div>
    </aside>
  );
}
