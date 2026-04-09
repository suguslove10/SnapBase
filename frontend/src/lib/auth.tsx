"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import api from "./api";

const rolePermissions: Record<string, string[]> = {
  owner: ["manage_members", "invite_members", "view_members", "manage_connections", "view_connections", "trigger_backup", "view_backups", "manage_schedules", "view_schedules"],
  admin: ["invite_members", "view_members", "manage_connections", "view_connections", "trigger_backup", "view_backups", "manage_schedules", "view_schedules"],
  engineer: ["view_members", "manage_connections", "view_connections", "trigger_backup", "view_backups", "manage_schedules", "view_schedules"],
  viewer: ["view_members", "view_connections", "view_backups", "view_schedules"],
};

interface AuthContextType {
  token: string | null;
  email: string | null;
  orgId: number | null;
  orgName: string | null;
  role: string | null;
  plan: string;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  email: null,
  orgId: null,
  orgName: null,
  role: null,
  plan: "free",
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
    setMounted(true);
    if (storedToken) {
      api.get("/auth/me").then((res) => {
        setEmail(res.data.email ?? null);
        setOrgId(res.data.org_id ?? null);
        setOrgName(res.data.org_name ?? null);
        setRole(res.data.role ?? null);
      }).catch(() => {});
      api.get("/billing/usage").then((res) => {
        setPlan(res.data.plan ?? "free");
      }).catch(() => {});
    }
  }, []);

  const login = (newToken: string) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    api.get("/auth/me").then((res) => {
      setEmail(res.data.email ?? null);
      setOrgId(res.data.org_id ?? null);
      setOrgName(res.data.org_name ?? null);
      setRole(res.data.role ?? null);
    }).catch(() => {});
    api.get("/billing/usage").then((res) => {
      setPlan(res.data.plan ?? "free");
    }).catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setEmail(null);
    setOrgId(null);
    setOrgName(null);
    setRole(null);
    setPlan("free");
    router.push("/login");
  };

  const hasPermission = (perm: string): boolean => {
    if (!role) return false;
    return (rolePermissions[role] ?? []).includes(perm);
  };

  if (!mounted) return null;

  return (
    <AuthContext.Provider value={{ token, email, orgId, orgName, role, plan, login, logout, isAuthenticated: !!token, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
