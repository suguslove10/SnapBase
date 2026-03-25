"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function NavbarAuthButton() {
  const { isLoggedIn } = useAuth();

  if (isLoggedIn) {
    return (
      <Link
        href="/dashboard"
        className="rounded-lg px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
      >
        Go to Dashboard
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-lg px-5 py-2 text-sm font-semibold text-[#0a0f1e] transition hover:opacity-90"
      style={{ background: "linear-gradient(135deg, #00b4ff, #00f5d4)" }}
    >
      Sign In
    </Link>
  );
}
