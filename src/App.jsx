import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useApplicationsData } from './hooks/useApplicationsData';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import CandidatesPage from './pages/CandidatesPage';
import FormationPage from './pages/FormationPage';
import RetirosPage from './pages/RetirosPage';
import EventsPage from './pages/EventsPage';

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
  const { applications, enrollments, project, cohort, metrics, formationProgress, attendanceByCandidate, groupAttendance, retiros, loading, error, updateApplication, updateEnrollment, refetch } = useApplicationsData();

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
