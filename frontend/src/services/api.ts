import axios from "axios";

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:3001/api");

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("icap_session");
  if (token) {
    config.headers["x-session-token"] = token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = String(error.config?.url || "").includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      sessionStorage.removeItem("icap_user");
      sessionStorage.removeItem("icap_session");
      sessionStorage.removeItem("icap_task");
      const isTeacherPage = window.location.pathname.startsWith("/teacher");
      const target = isTeacherPage
        ? "/teacher/login?reason=session-expired"
        : "/?reason=session-expired";
      if (window.location.pathname + window.location.search !== target) {
        window.location.replace(target);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
