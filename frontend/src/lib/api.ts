import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api",
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Sliding-window token refresh: if the JWT is older than 24h but still valid,
// silently exchange it for a fresh 7-day token in the background.
if (typeof window !== "undefined") {
  const tryRefresh = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return;
      const payload = JSON.parse(atob(parts[1]));
      const issuedAt = payload.iat ?? 0;
      const ageHours = (Date.now() / 1000 - issuedAt) / 3600;
      // Refresh if token is over 24h old (sliding session).
      if (ageHours > 24 && issuedAt > 0) {
        const res = await api.post("/auth/refresh");
        if (res.data?.token) {
          localStorage.setItem("token", res.data.token);
        }
      }
    } catch { /* ignore — bad token will hit 401 path */ }
  };
  // Run on load and once per hour while the tab is open.
  tryRefresh();
  setInterval(tryRefresh, 60 * 60 * 1000);
}

export default api;
