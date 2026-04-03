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
  CreditCard,
  Users,
  LogOut,
  Webhook,
  ArrowLeftRight,
} from "lucide-react";

const navItems = [
  { href: "/dashboard",   label: "Dashboard",      icon: LayoutDashboard },
  { href: "/connections", label: "Connections",    icon: Database },
  { href: "/schedules",   label: "Schedules",      icon: CalendarClock },
  { href: "/backups",     label: "Backup History", icon: History },
  { href: "/webhooks",   label: "Webhooks",       icon: Webhook },
  { href: "/sync",       label: "DB Sync",         icon: ArrowLeftRight },
  { href: "/anomalies",   label: "Anomalies",      icon: AlertTriangle },
  { href: "/storage",     label: "Storage",        icon: HardDrive },
  { href: "/billing",     label: "Billing",        icon: CreditCard },
  { href: "/settings",    label: "Settings",       icon: Settings },
];

const roleBadgeStyle: Record<string, string> = {
  owner:    "bg-[#00b4ff]/10 text-[#00b4ff]",
  admin:    "bg-purple-500/10 text-purple-400",
  engineer: "bg-emerald-500/10 text-emerald-400",
  viewer:   "bg-slate-500/10 text-slate-400",
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { logout, role, orgName } = useAuth();

  const showTeam = role === "owner" || role === "admin";

  const handleNavClick = () => {
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-56 flex-col border-r border-white/[0.06] transition-transform duration-200 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: "#080d1a" }}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-5">
          <img src="/logo-icon.png" alt="SnapBase" style={{height:"40px",width:"auto"}} />
          <span className="font-grotesk text-[15px] font-semibold text-white">SnapBase</span>
        </div>

        {/* Org name */}
        {orgName && (
          <div className="border-b border-white/[0.04] px-5 py-2.5">
            <p className="truncate font-jetbrains text-[10px] text-slate-600">{orgName}</p>
          </div>
        )}

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
                onClick={handleNavClick}
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
                    active ? "text-[#00b4ff]" : "text-slate-600 group-hover:text-slate-300"
                  }`}
                />
                <span className={`transition-colors ${active ? "text-[#00b4ff]" : "text-slate-500 group-hover:text-slate-300"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {showTeam && (
            <>
              <p className="mb-2 mt-4 px-3 font-jetbrains text-[9px] uppercase tracking-widest text-slate-700">
                Team
              </p>
              {(() => {
                const active = pathname === "/team" || pathname.startsWith("/team/");
                return (
                  <Link
                    href="/team"
                    onClick={handleNavClick}
                    className="group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150"
                    style={active ? { background: "rgba(0,180,255,0.10)" } : undefined}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full"
                        style={{ background: "linear-gradient(180deg, #00b4ff, #00f5d4)" }}
                      />
                    )}
                    <Users className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-[#00b4ff]" : "text-slate-600 group-hover:text-slate-300"}`} />
                    <span className={`transition-colors ${active ? "text-[#00b4ff]" : "text-slate-500 group-hover:text-slate-300"}`}>
                      Team
                    </span>
                  </Link>
                );
              })()}
            </>
          )}
        </nav>

        {/* Role badge + Logout */}
        <div className="border-t border-white/[0.06] p-3 space-y-1">
          {role && (
            <div className="px-3 py-1">
              <span className={`rounded-full px-2 py-0.5 font-jetbrains text-[10px] font-semibold uppercase tracking-wider ${roleBadgeStyle[role] ?? roleBadgeStyle.viewer}`}>
                {role}
              </span>
            </div>
          )}
          <button
            onClick={logout}
            className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-red-400" />
            <span className="text-slate-600 transition-colors group-hover:text-red-400">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
