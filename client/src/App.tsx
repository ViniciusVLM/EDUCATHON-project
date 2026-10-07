import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import SetupActivity from './pages/SetupActivity';
import UploadResponses from './pages/UploadResponses';
import ReviewDashboard from './pages/ReviewDashboard';
import ExportResults from './pages/ExportResults';
import ActivitiesList from './pages/ActivitiesList';
import ClassesManagement from './pages/ClassesManagement';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

/**
 * Wrapper que combina ProtectedRoute + AppLayout.
 * Mantém a separação: Home, Login e Register ficam fora do layout.
 */
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* ── Rotas Públicas (sem AppLayout) ── */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ── Rotas Protegidas (com AppLayout) ── */}
            <Route
              path="/painel"
              element={
                <ProtectedLayout>
                  <Dashboard />
                </ProtectedLayout>
              }
            />
            <Route
              path="/activities"
              element={
                <ProtectedLayout>
                  <ActivitiesList />
                </ProtectedLayout>
              }
            />
            <Route
              path="/classes"
              element={
                <ProtectedLayout>
                  <ClassesManagement />
                </ProtectedLayout>
              }
            />
            <Route
              path="/setup"
              element={
                <ProtectedLayout>
                  <SetupActivity />
                </ProtectedLayout>
              }
            />
            <Route
              path="/upload/:activityId"
              element={
                <ProtectedLayout>
                  <UploadResponses />
                </ProtectedLayout>
              }
            />
            <Route
              path="/review/:activityId"
              element={
                <ProtectedLayout>
                  <ReviewDashboard />
                </ProtectedLayout>
              }
            />
            <Route
              path="/export/:activityId"
              element={
                <ProtectedLayout>
                  <ExportResults />
                </ProtectedLayout>
              }
            />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
