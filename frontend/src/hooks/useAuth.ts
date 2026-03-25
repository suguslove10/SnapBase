import { useState, useEffect } from "react";

interface AuthState {
  isLoggedIn: boolean;
  token: string | null;
  email: string | null;
}

function isTokenValid(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function useAuth(): AuthState {
  const [auth, setAuth] = useState<AuthState>({
    isLoggedIn: false,
    token: null,
    email: null,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && isTokenValid(token)) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setAuth({ isLoggedIn: true, token, email: payload.email ?? null });
      } catch {
        localStorage.removeItem("token");
      }
    } else if (token) {
      // Expired — clean up
      localStorage.removeItem("token");
    }
  }, []);

  return auth;
}
