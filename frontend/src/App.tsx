import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider } from "antd";
import ErrorBoundary from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import TaskSelectPage from "./pages/TaskSelectPage";
import TeachingPage from "./pages/TeachingPage";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import TeacherLoginPage from "./pages/teacher/TeacherLoginPage";
import TeacherStudents from "./pages/teacher/TeacherStudents";
import TeacherStudentDetail from "./pages/teacher/TeacherStudentDetail";
import TeacherTasks from "./pages/teacher/TeacherTasks";
import TeacherPrompts from "./pages/teacher/TeacherPrompts";
import TeacherSettings from "./pages/teacher/TeacherSettings";

export default function App() {
  return (
    <ErrorBoundary>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#4361ee", colorSuccess: "#2ec4b6", colorWarning: "#ff9f1c", colorError: "#e63946",
          colorInfo: "#4361ee", borderRadius: 10, colorBgLayout: "#f8f9fa", colorBgContainer: "#ffffff",
          fontFamily: "'Segoe UI','Helvetica Neue',Arial,sans-serif",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04)",
          colorBorder: "#e9ecef", lineHeight: 1.65,
        },
        components: {
          Card: { borderRadiusLG: 12, paddingLG: 20 },
          Button: { borderRadius: 8, controlHeight: 34, fontWeight: 500 },
          Tag: { borderRadiusSM: 6 },
          Input: { borderRadius: 8, controlHeight: 38 },
          Progress: { defaultColor: "#4361ee" },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/tasks" element={<TaskSelectPage />} />
          <Route path="/teach/:taskId" element={<TeachingPage />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/teacher/login" element={<TeacherLoginPage />} />
          <Route path="/teacher/students" element={<TeacherStudents />} />
          <Route path="/teacher/students/:id" element={<TeacherStudentDetail />} />
          <Route path="/teacher/tasks" element={<TeacherTasks />} />
          <Route path="/teacher/prompts" element={<TeacherPrompts />} />
          <Route path="/teacher/settings" element={<TeacherSettings />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
    </ErrorBoundary>
  );
}
