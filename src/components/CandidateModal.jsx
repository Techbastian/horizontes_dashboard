import { useState } from 'react';

function getGrupoBadgeClass(grupo) {
  const g = (grupo || '').toLowerCase();
  if (g === 'senior') return 'badge-senior';
  if (g.includes('entrevista') || g === 'pasan a entrevistas') return 'badge-entrevista';
  if (g.includes('no') || g === 'no elegido' || g === 'no seleccionado') return 'badge-no-seleccionado';
  return 'badge-sin-asignar';
}

function getPipelineStatus(fases) {
  const steps = [
    { key: 'elegibilidad', label: 'Elegibilidad' },
    { key: 'seccion_actitudinal', label: 'Evaluación Técnica' },
    { key: 'seccion_entrevista', label: 'Entrevista' },
  ];

  return steps.map(step => {
    const value = fases[step.key];
    let status = 'pending';
    if (value === 'rejected') status = 'rejected';
    else if (value !== 'pending') status = 'completed';
    return { ...step, status, value };
  });
}

export default function CandidateModal({ application, onClose, onUpdate }) {
  const ca = application.custom_answers || {};
  const fases = ca.seguimiento_fases || {};
  const candidate = application.candidate || {};

  let computedAge = candidate.age;
  if (!computedAge || computedAge === 0) {
    if (candidate.birth_date) {
      const birthDate = new Date(candidate.birth_date);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      computedAge = age > 0 ? age : 0;
    }
  }

  const [newGrupo, setNewGrupo] = useState(fases.grupo_asignado || '');
  const [descarteMotivo, setDescarteMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const pipelineSteps = getPipelineStatus(fases);
  const puntajeTecnico = typeof fases.puntaje_tecnico === 'number' ? fases.puntaje_tecnico : null;
  const puntajeEntrevista = typeof fases.puntaje_entrevista === 'number' ? fases.puntaje_entrevista : null;
  const puntajeTotal = typeof fases.puntaje_total === 'number' ? fases.puntaje_total : null;

  const initials = `${(candidate.first_name || '?')[0]}${(candidate.last_name || '?')[0]}`.toUpperCase();

  const handleSave = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      const updatedCA = {
        ...ca,
        seguimiento_fases: {
          ...fases,
          grupo_asignado: newGrupo,
          ...(descarteMotivo ? { motivo_descarte: descarteMotivo } : {}),
        },
        ...(descarteMotivo ? { motivo_descarte: descarteMotivo } : {}),
      };
      await onUpdate(application.id, updatedCA);
      onClose();
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-avatar">{initials}</div>
            <div>
              <div className="modal-name">{candidate.first_name} {candidate.last_name}</div>
              <span className={`badge ${getGrupoBadgeClass(fases.grupo_asignado)}`}>
                {fases.grupo_asignado || 'Sin asignar'}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Personal Info */}
          <div className="modal-section">
            <div className="modal-section-title">Información Personal</div>
            <div className="modal-info-grid">
              <div className="modal-info-item">
                <span className="modal-info-label">Email</span>
                <span className="modal-info-value">{candidate.email || '—'}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Teléfono</span>
                <span className="modal-info-value">{candidate.phone || '—'}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Documento</span>
                <span className="modal-info-value">{candidate.document_type} {candidate.document_number}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Edad</span>
                <span className="modal-info-value">{computedAge > 0 ? `${computedAge} años` : '—'}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Municipio</span>
                <span className="modal-info-value">{candidate.city || '—'}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Nivel Educativo</span>
                <span className="modal-info-value">{candidate.education_level || '—'}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Género</span>
                <span className="modal-info-value">{candidate.gender || '—'}</span>
              </div>
              <div className="modal-info-item">
                <span className="modal-info-label">Canal de Adquisición</span>
                <span className="modal-info-value">{candidate.acquisition_channel || '—'}</span>
              </div>
            </div>
          </div>

          {/* Pipeline Status */}
          <div className="modal-section">
            <div className="modal-section-title">Estado en el Pipeline</div>
            <div className="pipeline-stepper">
              {pipelineSteps.map((step, i) => (
                <div key={step.key} className={`pipeline-step ${step.status}`}>
                  <div className="pipeline-dot">
                    {step.status === 'completed' ? '✓' :
                     step.status === 'rejected' ? '✗' :
                     i + 1}
                  </div>
                  <span className="pipeline-step-label">{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scores */}
          <div className="modal-section">
            <div className="modal-section-title">Puntajes</div>
            <div className="score-visual">
              <div className="score-row">
                <span className="score-row-label">Puntaje Técnico</span>
                <div className="score-row-bar">
                  <div
                    className="score-row-fill"
                    style={{
                      width: puntajeTecnico !== null ? `${(puntajeTecnico / 15) * 100}%` : '0%',
                      background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                    }}
                  />
                </div>
                <span className="score-row-value">{puntajeTecnico !== null ? `${puntajeTecnico}/15` : 'N/A'}</span>
              </div>
              <div className="score-row">
                <span className="score-row-label">Puntaje Entrevista</span>
                <div className="score-row-bar">
                  <div
                    className="score-row-fill"
                    style={{
                      width: puntajeEntrevista !== null ? `${(puntajeEntrevista / 17) * 100}%` : '0%',
                      background: 'linear-gradient(90deg, #0d9488, #14b8a6)',
                    }}
                  />
                </div>
                <span className="score-row-value">{puntajeEntrevista !== null ? `${puntajeEntrevista}/17` : 'N/A'}</span>
              </div>
              <div className="score-row">
                <span className="score-row-label">Puntaje Total</span>
                <div className="score-row-bar">
                  <div
                    className="score-row-fill"
                    style={{
                      width: puntajeTotal !== null ? `${(puntajeTotal / 32) * 100}%` : '0%',
                      background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    }}
                  />
                </div>
                <span className="score-row-value">{puntajeTotal !== null ? `${puntajeTotal}/32` : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Motivo de descarte */}
          {(ca.motivo_descarte && ca.motivo_descarte !== 'N/A') && (
            <div className="modal-section">
              <div className="modal-section-title">Motivo de Descarte</div>
              <p style={{ fontSize: '14px', color: 'var(--accent-rose)' }}>{ca.motivo_descarte}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="modal-actions">
          <select
            className="modal-action-select"
            value={newGrupo}
            onChange={e => setNewGrupo(e.target.value)}
          >
            <option value="">Cambiar grupo...</option>
            <option value="Senior">Senior</option>
            <option value="Pasan a entrevistas">Pasan a entrevistas</option>
            <option value="No seleccionado">No seleccionado</option>
          </select>
          <input
            className="modal-action-input"
            type="text"
            placeholder="Motivo de descarte (opcional)"
            value={descarteMotivo}
            onChange={e => setDescarteMotivo(e.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || (!newGrupo && !descarteMotivo)}
          >
            {saving ? 'Guardando...' : '💾 Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
