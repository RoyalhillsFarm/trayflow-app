// src/App.tsx
import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
  Navigate,
} from "react-router-dom";

import "./App.css";

import trayflowLogo from "./assets/trayflow-logo.png";
import trayflowIcon from "./assets/trayflow-icon.png";

import { supabase } from "./utils/supabaseClient";

// Pages
import DashboardPage from "./pages/DashboardPage";
import OrdersPage from "./pages/OrdersPage";
import NewOrderPage from "./pages/NewOrderPage";
import OrderDetailPage from "./pages/OrderDetailPage";

import TasksPage from "./pages/TasksPage";
import NewTaskPage from "./pages/NewTaskPage";
import CalendarPage from "./pages/CalendarPage";
import Varieties from "./pages/Varieties";
import CustomersPage from "./pages/CustomersPage";
import ProductionSheetPage from "./pages/ProductionSheetPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

/* ----------------- MOBILE DETECTOR ----------------- */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();

    // Newer browsers
    if ("addEventListener" in mq) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    // Older Safari
    // @ts-ignore
    mq.addListener(update);
    // @ts-ignore
    return () => mq.removeListener(update);
  }, []);

  return isMobile;
}

/* ----------------- AUTH GUARD ----------------- */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setAuthed(Boolean(data.session));
      setChecking(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div style={{ opacity: 0.7, fontWeight: 700 }}>Loading…</div>
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/* ----------------- NAV LINKS ----------------- */
function AppNavLinks({ onClick }: { onClick?: () => void }) {
  return (
    <nav className="sidebar-nav">
      <SidebarLink to="/" label="Dashboard" onClick={onClick} />
      <SidebarLink to="/orders" label="Orders" onClick={onClick} />
      <SidebarLink to="/tasks" label="Tasks" onClick={onClick} />
      <SidebarLink to="/calendar" label="Calendar" onClick={onClick} />
      <SidebarLink to="/varieties" label="Varieties" onClick={onClick} />
      <SidebarLink to="/customers" label="Customers" onClick={onClick} />
      <SidebarLink to="/production-sheet" label="Production Sheet" onClick={onClick} />
      <SidebarLink to="/settings" label="Settings" onClick={onClick} />
    </nav>
  );
}

function SidebarLink({
  to,
  label,
  onClick,
}: {
  to: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        [
          "sidebar-link",
          isActive ? "sidebar-link-active" : "sidebar-link-inactive",
        ].join(" ")
      }
    >
      <span>{label}</span>
    </NavLink>
  );
}

/* ----------------- DESKTOP SIDEBAR ----------------- */
function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo-block">
        <img
          src={trayflowLogo}
          alt="TrayFlow Logo"
          className="sidebar-logo-image"
        />
        <div className="sidebar-logo-text">
          <div className="sidebar-subtitle">MICROGREENS PRODUCTION PLANNER</div>
        </div>
      </div>

      <AppNavLinks />

      <div className="sidebar-footer">
        <div>TrayFlow v1.0.0</div>
        <div>© {new Date().getFullYear()} TrayFlow</div>
      </div>
    </aside>
  );
}

/* ----------------- MOBILE DRAWER ----------------- */
function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 999,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100%",
          width: "85%",
          maxWidth: 320,
          background: "linear-gradient(180deg, #0b3b2c 0%, #0a2f34 100%)",
          color: "white",
          padding: 16,
          zIndex: 1000,
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img
            src={trayflowLogo}
            alt="TrayFlow Logo"
            style={{ width: 150, height: "auto" }}
          />
          <button
            onClick={onClose}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <AppNavLinks onClick={onClose} />
        </div>

        <div style={{ marginTop: 22, fontSize: 12, opacity: 0.85 }}>
          <div>TrayFlow v1.0.0</div>
          <div>© {new Date().getFullYear()} TrayFlow</div>
        </div>
      </div>
    </>
  );
}

/* ----------------- TOPBAR ----------------- */
function TopBar({
  onOpenMenu,
  isMobile,
}: {
  onOpenMenu: () => void;
  isMobile: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const showNewTaskButton = location.pathname === "/tasks";

  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <header
      className="topbar"
      style={
        isMobile
          ? {
              justifyContent: "space-between",
              padding: "12px 12px",
              height: "auto",
              minHeight: 56,
            }
          : undefined
      }
    >
      {isMobile ? (
        <button
          onClick={onOpenMenu}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontSize: 18,
            cursor: "pointer",
          }}
          aria-label="Open menu"
        >
          ☰
        </button>
      ) : (
        <div style={{ width: 44 }} />
      )}

      <div className="topbar-center" style={isMobile ? { gap: 8 } : undefined}>
        <img
          src={trayflowIcon}
          alt="TrayFlow Icon"
          className="topbar-logo-image"
        />
        <span className="topbar-title">{isMobile ? "" : "TRAYFLOW"}</span>
      </div>

      <div
        className="topbar-right"
        style={isMobile ? { position: "static", right: "auto", gap: 8 } : undefined}
      >
        {showNewTaskButton && (
          <button className="topbar-button" onClick={() => navigate("/tasks/new")}>
            New Task
          </button>
        )}

        {email ? (
          <>
            {!isMobile && (
              <span style={{ fontSize: 12, opacity: 0.6, marginRight: 8 }}>
                {email}
              </span>
            )}
            <button
              className="topbar-button"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/login", { replace: true });
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <button className="topbar-button" onClick={() => navigate("/login")}>
            Login
          </button>
        )}
      </div>
    </header>
  );
}

/* ----------------- SETTINGS PAGE ----------------- */
function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-text">Coming next.</p>
    </div>
  );
}

/* ----------------- APP SHELL ----------------- */
function AppShell() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // On /login we don't want to show the whole app chrome.
  const isAuthRoute =
  location.pathname === "/login" ||
  location.pathname === "/reset-password";

if (isAuthRoute) return <LoginGate />;

  return (
    <RequireAuth>
      <div className="app-shell">
        {!isMobile && <Sidebar />}
        {isMobile && (
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        )}

        <div className="app-main">
          <TopBar isMobile={isMobile} onOpenMenu={() => setDrawerOpen(true)} />
          <main className="app-main-content">
            <Routes>
              <Route path="/" element={<DashboardPage />} />

              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/new" element={<NewOrderPage />} />
              <Route path="/orders/:groupKey" element={<OrderDetailPage />} />

              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/new" element={<NewTaskPage />} />

              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/varieties" element={<Varieties />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/production-sheet" element={<ProductionSheetPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}

function LoginGate() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setAuthed(Boolean(data.session));
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ opacity: 0.7, fontWeight: 700 }}>Loading…</div>
      </div>
    );
  }

  const location = useLocation();

// If the user is coming from a recovery link, Supabase will create a session.
// We must allow /reset-password to render even if authed.
if (authed && location.pathname !== "/reset-password") {
  return <Navigate to="/" replace />;
}

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
