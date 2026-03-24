"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import Sidebar from "@/components/sidebar";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen" style={{ background: "#0a0f1e" }}>
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,180,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      <Sidebar />
      <main className="relative z-10 ml-56 flex-1 p-8">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}
