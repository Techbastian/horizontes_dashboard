import { useMemo, useState } from 'react';
import CandidateTable from '../components/CandidateTable';
import CandidateModal from '../components/CandidateModal';
import ExportExcelModal from '../components/ExportExcelModal';
import { enriquecerPostulaciones } from '../lib/postulaciones';
import { exportarCandidatos, filtrarPostulaciones } from '../lib/exportar';

export default function CandidatesPage({ applications, enrollments, updateApplication, circulosIds }) {
  const [selectedApp, setSelectedApp] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Misma proyección que usa la tabla: lo exportado no puede diferir de lo que
  // se ve en pantalla (src/lib/postulaciones.js).
  const postulaciones = useMemo(
    () => enriquecerPostulaciones(applications, enrollments || []),
    [applications, enrollments]
  );

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Gestión de Candidatos</h1>
          <p>Busca, filtra y gestiona los candidatos del programa Horizontes Senior.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setExportOpen(true)}>📊 Exportar Excel</button>
        </div>
      </div>

      <div className="card">
        <CandidateTable
          applications={applications}
          enrollments={enrollments}
          onSelectCandidate={setSelectedApp}
        />
      </div>

      {exportOpen && (
        <ExportExcelModal
          titulo="Exportar candidatos"
          descripcion="Postulaciones de Horizontes Senior"
          campos={[
            {
              id: 'elegibilidad',
              label: 'Elegibilidad',
              tipo: 'radio',
              opciones: [
                { id: 'todos', label: 'Todas las postulaciones' },
                { id: 'elegibles', label: 'Solo elegibles' },
                { id: 'noElegibles', label: 'Solo no elegibles' },
              ],
            },
            {
              id: 'seleccion',
              label: 'Selección final',
              tipo: 'radio',
              opciones: [
                { id: 'todos', label: 'Todos' },
                { id: 'seleccionados', label: 'Solo seleccionados' },
                { id: 'noSeleccionados', label: 'Solo no seleccionados' },
              ],
            },
            {
              id: 'columnas',
              label: 'Columnas opcionales',
              ayuda: 'Nombre, documento, elegibilidad, grupo evaluado y resultado final van siempre.',
              tipo: 'checks',
              opciones: [
                { id: 'contacto', label: 'Contacto', hint: 'Correo y teléfono' },
                { id: 'demografico', label: 'Perfil', hint: 'Edad, género, escolaridad, ciudad, canal y cuidado' },
                { id: 'puntajes', label: 'Puntajes y descarte', hint: 'Técnico, entrevista, total y motivo' },
                { id: 'circulos', label: 'Continuidad en Círculos', hint: 'Si siguió en el programa hermano' },
              ],
            },
          ]}
          valoresIniciales={{
            elegibilidad: 'todos',
            seleccion: 'todos',
            columnas: ['contacto', 'demografico', 'puntajes', 'circulos'],
          }}
          resumen={(v) => {
            const n = filtrarPostulaciones(postulaciones, v).length;
            return `${n} postulación${n === 1 ? '' : 'es'} en una hoja`;
          }}
          onClose={() => setExportOpen(false)}
          onExportar={(opciones) => exportarCandidatos({ postulaciones, circulosIds, opciones })}
        />
      )}

      {selectedApp && (
        <CandidateModal
          application={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={updateApplication}
          enCirculos={!!circulosIds?.has(selectedApp.candidate?.id)}
        />
      )}
    </div>
  );
}
