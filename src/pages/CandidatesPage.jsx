import { useState } from 'react';
import CandidateTable from '../components/CandidateTable';
import CandidateModal from '../components/CandidateModal';

export default function CandidatesPage({ applications, enrollments, updateApplication }) {
  const [selectedApp, setSelectedApp] = useState(null);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Gestión de Candidatos</h1>
          <p>Busca, filtra y gestiona los candidatos del programa Horizontes Senior.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">📥 Exportar CSV</button>
        </div>
      </div>

      <div className="card">
        <CandidateTable
          applications={applications}
          enrollments={enrollments}
          onSelectCandidate={setSelectedApp}
        />
      </div>

      {selectedApp && (
        <CandidateModal
          application={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={updateApplication}
        />
      )}
    </div>
  );
}
