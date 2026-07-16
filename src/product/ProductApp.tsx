import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthProvider";
import LoginPage from "./LoginPage";
import ProductHome from "./ProductHome";
import NewEventWizard from "./NewEventWizard";
import EventDashboard from "./EventDashboard";
import { Page, colors } from "./ui";

// The product surface (organizer accounts) — its own router, rendered outside
// the v1 golf-club shell. Everything under /app requires a signed-in organizer;
// /login is the way in. AuthProvider wraps the whole thing so the session is
// shared across these routes.

function Loading() {
  return (
    <Page center>
      <p style={{ color: colors.muted, textAlign: "center" }}>Loading…</p>
    </Page>
  );
}

/** Gate: send unauthenticated visitors to /login, preserving where they were
 *  headed so a future post-login redirect can return them. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { configured, loading, user } = useAuth();
  const location = useLocation();
  // Unconfigured → /login, which shows the "Connect Supabase" instructions
  // rather than spinning here forever.
  if (!configured) return <Navigate to="/login" replace />;
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function ProductApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <ProductHome />
            </RequireAuth>
          }
        />
        <Route
          path="/app/new"
          element={
            <RequireAuth>
              <NewEventWizard />
            </RequireAuth>
          }
        />
        <Route
          path="/app/event/:eventId"
          element={
            <RequireAuth>
              <EventDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  );
}
