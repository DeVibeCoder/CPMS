import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth, RequireCapability } from "@/components/auth/Guards";
import {
  SettingsLayout,
  SettingsIndex,
} from "@/components/layout/SettingsLayout";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { Logo } from "@/components/common/Logo";
import { BACKEND_NOT_CONFIGURED, isBackendConfigured } from "@/data";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CreateReportPage from "@/pages/CreateReportPage";
import ReportHistoryPage from "@/pages/ReportHistoryPage";
import ViewReportPage from "@/pages/ViewReportPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import CementPage from "@/pages/inventory/CementPage";
import AttendancePage from "@/pages/AttendancePage";
import NotFoundPage from "@/pages/NotFoundPage";
import { ReportsScope } from "@/components/report/ReportsScope";

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

/**
 * Shown when the build carries no Appwrite configuration. Vite inlines env
 * vars at build time, so a missing variable cannot be fixed at run time — it
 * needs new values and a rebuild. Saying so plainly beats an empty dashboard
 * that looks like a database with no data in it.
 */
function NotConfiguredScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <Logo size={56} className="mx-auto" />
        <h1 className="text-lg font-semibold">Backend not configured</h1>
        <p className="text-sm text-muted-foreground">{BACKEND_NOT_CONFIGURED}</p>
        <p className="text-xs text-muted-foreground">
          See <code>appwrite/README.md</code> for the full setup.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const restore = useAuth((s) => s.restore);
  const loadSettings = useSettings((s) => s.load);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isBackendConfigured) return;
    // Settings are only readable once signed in, so restore the session first
    // and only then fetch them. `load()` is a no-op if already cached.
    restore()
      .then(() => (useAuth.getState().user ? loadSettings() : null))
      .finally(() => setReady(true));
  }, [restore, loadSettings]);

  if (!isBackendConfigured) return <NotConfiguredScreen />;
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

          {/* Every report screen shares one scope, so the Report History month
              survives opening or editing a day but resets on the way out. */}
          <Route element={<ReportsScope />}>
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
          </Route>

          <Route path="/analytics" element={<AnalyticsPage />} />

          {/* Inventory — the cement bin card. A single page, so it renders
              directly with no wrapper or tab bar. Everyone may look; only an
              administrator can set the manual opening balance. */}
          <Route path="/inventory" element={<CementPage />} />
          <Route
            path="/inventory/cement"
            element={<Navigate to="/inventory" replace />}
          />

          {/* Attendance — under development, running on mock data and gated to
              administrators. Nothing here touches the reports backend. */}
          <Route
            path="/attendance"
            element={
              <RequireCapability capability="attendance">
                <AttendancePage />
              </RequireCapability>
            }
          />

          {/* Users, general settings & profile now live as tabs under /settings */}
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsIndex />} />
            <Route
              path="general"
              element={
                <RequireCapability capability="settings">
                  <SettingsPage />
                </RequireCapability>
              }
            />
            <Route
              path="users"
              element={
                <RequireCapability capability="manageUsers">
                  <UsersPage />
                </RequireCapability>
              }
            />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Back-compat redirects for the old top-level routes */}
          <Route
            path="/users"
            element={<Navigate to="/settings/users" replace />}
          />
          <Route
            path="/profile"
            element={<Navigate to="/settings/profile" replace />}
          />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}
