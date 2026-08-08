import api from "./api";

export interface LoginResponse {
  user: { id: string; name: string };
  session_id: string;
}

export const login = async (student_id: string, password: string, role?: string) => {
  const { data } = await api.post<LoginResponse>("/auth/login", {
    student_id,
    password,
    role: role || "student",
  });
  return data;
};

export const logout = async () => {
  await api.post("/auth/logout");
};
