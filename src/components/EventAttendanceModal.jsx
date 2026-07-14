import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isoToBogotaDate } from '../lib/bogotaTime';
import { GRUPO_CLASS, attendanceTipo, gruposDeAsistencia, tipoLabel } from '../lib/eventos';

// Clave estable para el mapa de marcas.
const keyOf = (grupo, candidateId) => `${grupo}:${candidateId}`;

export default function EventAttendanceModal({ cohortId, event, onClose, onSaved }) {
  const attTipo = attendanceTipo(event); // 'cafe' | 'sesion' | null
  const grupos = useMemo(() => gruposDeAsistencia(event), [event]);
  const fecha = isoToBogotaDate(event.fecha_hora_inicio);
  const actividadFallback = event.codigo || `EVT-${String(event.id).slice(0, 8)}`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeGrupo, setActiveGrupo] = useState(grupos[0] || null);

  // participantes: { [grupo]: [{ candidate_id, nombre }] }
  const [participantes, setParticipantes] = useState({});
  // marcas: Map keyOf → { asistio, observacion }
  const [marks, setMarks] = useState({});
  // actividad existente por (grupo,candidate) para editar la fila correcta
  const [actividadPrev, setActividadPrev] = useState({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) Participantes por grupo (elegidos).
        const { data: enrs, error: eErr } = await supabase
          .from('program_enrollments')
          .select('candidate_id, custom_form_data')
          .eq('cohort_id', cohortId);
        if (eErr) throw eErr;

        const porGrupo = {};
        for (const g of grupos) porGrupo[g] = [];
        for (const e of enrs || []) {
          const d = e.custom_form_data || {};
          if (d.elegido === false) continue;
          const g = d.ruta_asignada;
          if (!porGrupo[g]) continue;
          porGrupo[g].push({ candidate_id: e.candidate_id, nombre: d.nombre_completo || '(sin nombre)' });
        }
        for (const g of grupos) porGrupo[g].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        // 2) Asistencia existente para esta actividad (por grupo + tipo + fecha).
        const { data: rows, error: aErr } = await supabase
          .from('session_attendance')
          .select('candidate_id, grupo, asistio, observacion, actividad')
          .eq('cohort_id', cohortId)
          .eq('tipo', attTipo)
          .eq('fecha', fecha)
          .in('grupo', grupos);
        if (aErr) throw aErr;

        const nextMarks = {};
        const prevAct = {};
        for (const g of grupos) {
          for (const p of porGrupo[g]) {
            nextMarks[keyOf(g, p.candidate_id)] = { asistio: false, observacion: '' };
          }
        }
        for (const r of rows || []) {
          const k = keyOf(r.grupo, r.candidate_id);
          nextMarks[k] = { asistio: Boolean(r.asistio), observacion: r.observacion || '' };
          prevAct[k] = r.actividad;
        }

        if (!cancel) {
          setParticipantes(porGrupo);
          setMarks(nextMarks);
          setActividadPrev(prevAct);
        }
      } catch (err) {
        if (!cancel) setError(err.message || 'No se pudo cargar la asistencia.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [cohortId, attTipo, fecha, grupos]);

  const lista = participantes[activeGrupo] || [];
  const asistieron = lista.filter((p) => marks[keyOf(activeGrupo, p.candidate_id)]?.asistio).length;

  const setMark = (grupo, candidateId, patch) =>
    setMarks((prev) => {
      const k = keyOf(grupo, candidateId);
      return { ...prev, [k]: { ...prev[k], ...patch } };
    });

  const marcarTodos = (valor) =>
    setMarks((prev) => {
      const next = { ...prev };
      for (const p of lista) {
        const k = keyOf(activeGrupo, p.candidate_id);
        next[k] = { ...next[k], asistio: valor };
      }
      return next;
    });

  const guardar = async () => {
    setSaving(true);
    setError(null);
    try {
      const rows = [];
      for (const g of grupos) {
        for (const p of participantes[g] || []) {
          const k = keyOf(g, p.candidate_id);
          const m = marks[k] || { asistio: false, observacion: '' };
          rows.push({
            cohort_id: cohortId,
            candidate_id: p.candidate_id,
            grupo: g,
            tipo: attTipo,
            actividad: actividadPrev[k] || actividadFallback,
            fecha,
            asistio: m.asistio,
            observacion: (m.observacion || '').trim() || null,
            evento_id: event.id,
          });
        }
      }
      // Upsert por lotes por la clave única (no toca `orden`).
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error: uErr } = await supabase
          .from('session_attendance')
          .upsert(batch, { onConflict: 'cohort_id,candidate_id,grupo,tipo,actividad' });
        if (uErr) throw uErr;
      }
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar la asistencia.');
    } finally {
      setSaving(false);
    }
  };

  if (!attTipo) {
    return (
      <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
        <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-name">Asistencia no disponible</div>
            <button type="button" className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)' }}>
              Este evento ({event.nombre}) no es una sesión ni un café, así que no lleva registro de
              asistencia.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
      <div
        className="modal-content event-attendance-modal"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-avatar">✅</div>
            <div>
              <div className="modal-name">Asistencia · {event.nombre}</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'America/Bogota',
                })}{' '}
                · {tipoLabel(attTipo)}
                {event.codigo ? ` · ${event.codigo}` : ''}
              </span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {grupos.length > 1 && (
            <div className="attendance-tabs">
              {grupos.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`attendance-tab ${GRUPO_CLASS[g]}${activeGrupo === g ? ' is-active' : ''}`}
                  onClick={() => setActiveGrupo(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}

          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Cargando participantes…</p>
          ) : lista.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No hay participantes en este grupo.</p>
          ) : (
            <>
              <div className="attendance-summary">
                <span>
                  <strong>{asistieron}</strong> / {lista.length} asistió
                </span>
                <div className="attendance-bulk">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcarTodos(true)}>
                    Marcar todos
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcarTodos(false)}>
                    Ninguno
                  </button>
                </div>
              </div>

              <ul className="attendance-list">
                {lista.map((p) => {
                  const k = keyOf(activeGrupo, p.candidate_id);
                  const m = marks[k] || { asistio: false, observacion: '' };
                  return (
                    <li key={p.candidate_id} className="attendance-row">
                      <label className="attendance-check">
                        <input
                          type="checkbox"
                          checked={m.asistio}
                          onChange={(e) => setMark(activeGrupo, p.candidate_id, { asistio: e.target.checked })}
                        />
                        <span className="attendance-name">{p.nombre}</span>
                      </label>
                      <input
                        type="text"
                        className="attendance-obs"
                        placeholder="Observación (opcional)"
                        value={m.observacion}
                        onChange={(e) => setMark(activeGrupo, p.candidate_id, { observacion: e.target.value })}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving || loading}>
            {saving ? 'Guardando…' : 'Guardar asistencia'}
          </button>
        </div>
      </div>
    </div>
  );
}
