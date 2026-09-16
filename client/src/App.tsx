import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import SetupActivity from './pages/SetupActivity';
import UploadResponses from './pages/UploadResponses';
import ReviewDashboard from './pages/ReviewDashboard';
import ExportResults from './pages/ExportResults';
import ActivitiesList from './pages/ActivitiesList';
import ClassesManagement from './pages/ClassesManagement';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function Header() {
  const location = useLocation();
  const { teacher, isAuthenticated, logout } = useAuth();
  const isHome = location.pathname === '/';

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="header-logo" style={{ textDecoration: 'none' }}>
          <div className="header-logo-icon">🎓</div>
          <span className="header-logo-text">Educathon</span>
          <span className="header-logo-badge">Copiloto IA</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {!isHome && (
            <>
              <Link to="/" className="btn btn-ghost btn-sm">Início</Link>
              {isAuthenticated && (
                <>
                  <Link to="/activities" className="btn btn-ghost btn-sm">📋 Atividades</Link>
                  <Link to="/classes" className="btn btn-ghost btn-sm">🏫 Turmas</Link>
                  <Link to="/setup" className="btn btn-ghost btn-sm">Nova Correção</Link>
                </>
              )}
            </>
          )}

          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.85rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: 'var(--color-primary-light, #a5b4fc)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>👨‍🏫</span>
                <strong>{teacher?.name.split(' ')[0]}</strong>
              </span>
              <button
                type="button"
                onClick={logout}
                className="btn btn-ghost btn-sm"
                title="Encerrar sessão"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Sair
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.5rem' }}>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Entrar
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Cadastrar
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <Routes>
          {/* Rotas Públicas */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Rotas Protegidas (Fase 5.1 e 5.2) */}
          <Route
            path="/activities"
            element={
              <ProtectedRoute>
                <ActivitiesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classes"
            element={
              <ProtectedRoute>
                <ClassesManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup"
            element={
              <ProtectedRoute>
                <SetupActivity />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload/:activityId"
            element={
              <ProtectedRoute>
                <UploadResponses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review/:activityId"
            element={
              <ProtectedRoute>
                <ReviewDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/export/:activityId"
            element={
              <ProtectedRoute>
                <ExportResults />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
