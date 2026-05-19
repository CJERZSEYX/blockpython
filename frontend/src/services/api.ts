import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.PROD ? "/api" : "http://localhost:3002/api",
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
    if (error.response?.status === 401) {
      sessionStorage.removeItem("icap_user");
      sessionStorage.removeItem("icap_session");
      sessionStorage.removeItem("icap_task");
    }
    return Promise.reject(error);
  }
);

export default api;
