import { NavLink } from 'react-router-dom';

export default function Sidebar({ isOpen, onClose }) {
  return (
    <>
      <button className="mobile-menu-btn" onClick={onClose} aria-label="Toggle menu">
        ☰
      </button>
      <aside className={`sidebar${isOpen ? ' open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-row">
            <div className="sidebar-logo">HS</div>
            <div className="sidebar-brand-text">
              <h2>Horizontes<br/>Senior</h2>
              <span>Executive Suite</span>
            </div>
          </div>
        </div>

        {/* Alliance info */}
        <div className="sidebar-alliance">
          <p>En alianza: Fundación Saldarriaga Concha</p>
          <p>Lidera: Ruta N Medellín</p>
          <p>Alcaldía de Medellín</p>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
          >
            <span className="nav-item-icon">📊</span>
            Dashboard
          </NavLink>

          <NavLink
            to="/candidatos"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
          >
            <span className="nav-item-icon">👥</span>
            Candidatos
          </NavLink>

          <div className="nav-item disabled">
            <span className="nav-item-icon">🎓</span>
            Cohorte
            <span className="nav-badge">Próximamente</span>
          </div>

          <div className="nav-item disabled">
            <span className="nav-item-icon">⚙️</span>
            Configuración
          </div>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="nav-item">
            <span className="nav-item-icon">❓</span>
            Help Center
          </div>
        </div>
      </aside>
    </>
  );
}
