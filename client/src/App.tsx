import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import SetupActivity from './pages/SetupActivity';
import UploadResponses from './pages/UploadResponses';
import ReviewDashboard from './pages/ReviewDashboard';
import ExportResults from './pages/ExportResults';

function Header() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="header-logo" style={{ textDecoration: 'none' }}>
          <div className="header-logo-icon">🎓</div>
          <span className="header-logo-text">Educathon</span>
          <span className="header-logo-badge">Copiloto IA</span>
        </Link>

        {!isHome && (
          <nav style={{ display: 'flex', gap: '0.5rem' }}>
            <Link to="/" className="btn btn-ghost btn-sm">Início</Link>
            <Link to="/setup" className="btn btn-ghost btn-sm">Nova Correção</Link>
          </nav>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<SetupActivity />} />
        <Route path="/upload/:activityId" element={<UploadResponses />} />
        <Route path="/review/:activityId" element={<ReviewDashboard />} />
        <Route path="/export/:activityId" element={<ExportResults />} />
      </Routes>
    </BrowserRouter>
  );
}
