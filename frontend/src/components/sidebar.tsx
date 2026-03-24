"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/connections", label: "Connections" },
  { href: "/schedules", label: "Schedules" },
  { href: "/backups", label: "Backup History" },
  { href: "/anomalies", label: "Anomalies" },
  { href: "/storage", label: "Storage" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-white/[0.06] bg-gradient-to-b from-[#1a2236] to-[#151f2e]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-white/[0.06] px-5">
        <div className="flex h-7 w-7 items-center justify-center bg-indigo-500 text-[11px] font-black tracking-tight text-white">
          SB
        </div>
        <span className="text-[15px] font-light tracking-wide text-slate-200">SnapBase</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center px-4 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-indigo-500" />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/[0.06] p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-slate-500 transition hover:text-slate-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </aside>
  );
}
