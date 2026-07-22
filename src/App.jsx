import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useApplicationsData } from './hooks/useApplicationsData';
import { useCirculosData } from './hooks/useCirculosData';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import CandidatesPage from './pages/CandidatesPage';
import FormationPage from './pages/FormationPage';
import RetirosPage from './pages/RetirosPage';
import EventsPage from './pages/EventsPage';
import CirculosPage from './pages/CirculosPage';

function LoadingScreen() {
  return (
    <div className="loading-container" style={{ minHeight: '100vh' }}>
      <div className="loading-spinner"></div>
      <div className="loading-text">Cargando datos de Horizontes Senior...</div>
    </div>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div className="error-container" style={{ minHeight: '100vh' }}>
      <div className="error-icon">⚠️</div>
      <div className="error-title">Error de Conexión</div>
      <div className="error-message">{message}</div>
      <button className="btn btn-primary" onClick={onRetry} style={{ marginTop: 16 }}>
        🔄 Reintentar
      </button>
    </div>
  );
}

export default function App() {
  const { applications, enrollments, project, cohort, metrics, formationProgress, attendanceByCandidate, groupAttendance, retiros, continuidadCirculos, circulosIds, loading, error, updateApplication, updateEnrollment, refetch } = useApplicationsData();

  // Círculos se carga aquí arriba, no dentro de CirculosPage, porque ahora lo
  // consumen dos páginas (/circulos y /formacion): con el hook en cada una se
  // dispararían dos veces las mismas consultas.
  const circulos = useCirculosData();

  // Solo bloquea el hook de Horizontes Senior. Si Círculos falla o va más lento,
  // el resto del dashboard debe seguir funcionando.
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={refetch} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <DashboardPage
                metrics={metrics}
                applications={applications}
                project={project}
                cohort={cohort}
                formationProgress={formationProgress}
                continuidadCirculos={continuidadCirculos}
              />
            }
          />
          <Route
            path="/candidatos"
            element={
              <CandidatesPage
                applications={applications}
                enrollments={enrollments}
                updateApplication={updateApplication}
                circulosIds={circulosIds}
              />
            }
          />
          <Route
            path="/formacion"
            element={
              <FormationPage
                enrollments={enrollments}
                applications={applications}
                formationProgress={formationProgress}
                attendanceByCandidate={attendanceByCandidate}
                groupAttendance={groupAttendance}
                updateEnrollment={updateEnrollment}
                circulos={circulos}
              />
            }
          />
          <Route
            path="/retiros"
            element={<RetirosPage retiros={retiros} metrics={metrics} />}
          />
          <Route
            path="/eventos"
            element={<EventsPage cohort={cohort} />}
          />
          {/* Círculos de Conocimiento tiene su propio hook (useCirculosData): no
              cuelga del de Horizontes Senior. Se invoca arriba y baja por props
              porque /formacion también lo consume. */}
          <Route path="/circulos" element={<CirculosPage circulos={circulos} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
