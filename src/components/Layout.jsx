import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(!sidebarOpen)} />
      <main className="main-content">
        {/* El boundary envuelve solo la página, no el sidebar: si una sección
            falla, el resto del dashboard sigue navegable en vez de quedar todo
            en blanco. La `key` por ruta lo reinicia al cambiar de página —si no,
            una vez roto se quedaría mostrando el error para siempre. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
