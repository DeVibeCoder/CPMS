import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth, RequireCapability } from "@/components/auth/Guards";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { Logo } from "@/components/common/Logo";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CreateReportPage from "@/pages/CreateReportPage";
import ReportHistoryPage from "@/pages/ReportHistoryPage";
import ViewReportPage from "@/pages/ViewReportPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import NotFoundPage from "@/pages/NotFoundPage";

function BootScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Logo size={56} className="animate-pulse" />
        <div className="text-sm text-muted-foreground">Loading CPSM…</div>
      </div>
    </div>
  );
}

export default function App() {
  const restore = useAuth((s) => s.restore);
  const loadSettings = useSettings((s) => s.load);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([restore(), loadSettings()]).finally(() => setReady(true));
  }, [restore, loadSettings]);

  if (!ready) return <BootScreen />;

  return (
    <TooltipProvider delayDuration={200}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportHistoryPage />} />
          <Route
            path="/reports/new"
            element={
              <RequireCapability capability="createReports">
                <CreateReportPage />
              </RequireCapability>
            }
          />
          <Route path="/reports/:id" element={<ViewReportPage />} />
          <Route
            path="/reports/:id/edit"
            element={
              <RequireCapability capability="editReports">
                <CreateReportPage />
              </RequireCapability>
            }
          />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route
            path="/users"
            element={
              <RequireCapability capability="manageUsers">
                <UsersPage />
              </RequireCapability>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireCapability capability="settings">
                <SettingsPage />
              </RequireCapability>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}
