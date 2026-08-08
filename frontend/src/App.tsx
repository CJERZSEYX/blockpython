import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import ErrorBoundary from "./components/ErrorBoundary";
import AppMessageBridge from "./components/AppMessageBridge";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const TaskSelectPage = lazy(() => import("./pages/TaskSelectPage"));
const TeachingPage = lazy(() => import("./pages/TeachingPage"));
const TeacherLoginPage = lazy(() => import("./pages/teacher/TeacherLoginPage"));
const TeacherStudents = lazy(() => import("./pages/teacher/TeacherStudents"));
const TeacherStudentDetail = lazy(() => import("./pages/teacher/TeacherStudentDetail"));

export default function App() {
  return (
    <ErrorBoundary>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#4361ee",
          colorSuccess: "#2ec4b6",
          colorWarning: "#ff9f1c",
          colorError: "#e63946",
          colorInfo: "#4361ee",
          borderRadius: 8,
          colorBgLayout: "#f8f9fa",
          colorBgContainer: "#ffffff",
          fontFamily: "'PingFang SC','Microsoft YaHei','Helvetica Neue',sans-serif",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04)",
          colorBorder: "#e9ecef",
          lineHeight: 1.65,
        },
        components: {
          Card: { borderRadiusLG: 8, paddingLG: 20 },
          Button: { borderRadius: 8, controlHeight: 34, fontWeight: 500 },
          Tag: { borderRadiusSM: 6 },
          Input: { borderRadius: 8, controlHeight: 38 },
          Progress: { defaultColor: "#4361ee" },
        },
      }}
    >
      <AntdApp>
        <AppMessageBridge />
        <BrowserRouter>
          <Suspense fallback={<div className="app-route-loading">正在加载...</div>}>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/tasks" element={<TaskSelectPage />} />
              <Route path="/teach/:taskId" element={<TeachingPage />} />
              <Route path="/teacher" element={<TeacherStudents />} />
              <Route path="/teacher/login" element={<TeacherLoginPage />} />
              <Route path="/teacher/students" element={<TeacherStudents />} />
              <Route path="/teacher/students/:id" element={<TeacherStudentDetail />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
    </ErrorBoundary>
  );
}
