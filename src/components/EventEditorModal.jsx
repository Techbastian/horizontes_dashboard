import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  isoToBogotaDate,
  isoToBogotaTime,
  bogotaDateTimeToIso,
  bogotaPlusDays,
} from '../lib/bogotaTime';
import { gruposDe, TIPO_OPCIONES } from '../lib/eventos';

export default function EventEditorModal({
  cohortId,
  programa,
  selectedDateKey,
  event,
  onClose,
  onSaved,
  onDeleted,
}) {
  const isEdit = Boolean(event?.id);
  const grupos = gruposDe(programa);
  // En Horizontes Senior lo más común es crear un evento que aplica a todas las
  // rutas; en Círculos, que es grupo único, el único valor posible es ese grupo.
  const grupoPorDefecto = grupos.includes('Compartido') ? 'Compartido' : grupos[0];
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [evidenciaUrl, setEvidenciaUrl] = useState('');
  const [grupo, setGrupo] = useState(grupoPorDefecto);
  const [codigo, setCodigo] = useState('');
  const [tipos, setTipos] = useState([]);
  const [fechaDia, setFechaDia] = useState(selectedDateKey);
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setNombre(event.nombre || '');
      setDescripcion(event.descripcion || '');
      setEvidenciaUrl(event.evidencia_url || '');
      setGrupo(event.grupo || grupoPorDefecto);
      setCodigo(event.codigo || '');
      setTipos(Array.isArray(event.tipo) ? event.tipo : []);
      setFechaDia(isoToBogotaDate(event.fecha_hora_inicio));
      setHoraInicio(isoToBogotaTime(event.fecha_hora_inicio));
      setHoraFin(isoToBogotaTime(event.fecha_hora_fin));
    } else {
      setNombre('');
      setDescripcion('');
      setEvidenciaUrl('');
      setGrupo(grupoPorDefecto);
      setCodigo('');
      setTipos([]);
      setFechaDia(selectedDateKey);
      setHoraInicio('09:00');
      setHoraFin('10:00');
    }
  }, [event, selectedDateKey, grupoPorDefecto]);

  const toggleTipo = (value) =>
    setTipos((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));

  const computeInicioFinIso = () => {
    let inicio;
    try {
      inicio = bogotaDateTimeToIso(fechaDia, horaInicio);
    } catch {
      return null;
    }
    let finDate = fechaDia;
    let finIso = bogotaDateTimeToIso(finDate, horaFin);
    if (new Date(finIso) < new Date(inicio)) {
      finDate = bogotaPlusDays(fechaDia, 1);
      finIso = bogotaDateTimeToIso(finDate, horaFin);
    }
    return { inicio, fin: finIso };
  };

  const submit = async () => {
    const n = nombre.trim();
    if (!n) {
      alert('El nombre es obligatorio.');
      return;
    }
    const times = computeInicioFinIso();
    if (!times) {
      alert('Fecha u hora no válidas.');
      return;
    }

    setSaving(true);
    try {
      const row = {
        cohort_id: cohortId,
        nombre: n,
        descripcion: descripcion.trim() || null,
        evidencia_url: evidenciaUrl.trim() || null,
        grupo: grupo || null,
        codigo: codigo.trim() || null,
        tipo: tipos.length ? tipos : null,
        fecha_hora_inicio: times.inicio,
        fecha_hora_fin: times.fin,
      };

      let err;
      if (isEdit) {
        ({ error: err } = await supabase.from('eventos').update(row).eq('id', event.id));
      } else {
        ({ error: err } = await supabase.from('eventos').insert([row]));
      }
      if (err) throw err;
      await onSaved();
      onClose();
    } catch (e) {
      alert(e.message || 'Error al guardar el evento.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    if (!window.confirm('¿Eliminar este evento? Esta acción no se puede deshacer.')) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('eventos').delete().eq('id', event.id);
      if (err) throw err;
      await onDeleted();
      onClose();
    } catch (e) {
      alert(e.message || 'Error al eliminar.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-avatar">{isEdit ? '✏️' : '➕'}</div>
            <div>
              <div className="modal-name">{isEdit ? 'Editar evento' : 'Nuevo evento'}</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Horario en America/Bogota
              </span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Datos del evento</div>
            <div className="event-form-stack">
              <label className="event-form-label">
                Nombre *
                <input
                  type="text"
                  className="modal-action-input"
                  style={{ width: '100%' }}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Sesión de seguimiento cohorte"
                />
              </label>
              <label className="event-form-label">
                Descripción
                <textarea
                  className="event-form-textarea"
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Detalle u observaciones"
                />
              </label>
              <label className="event-form-label">
                Enlace de evidencias
                <input
                  type="url"
                  className="modal-action-input"
                  style={{ width: '100%' }}
                  value={evidenciaUrl}
                  onChange={(e) => setEvidenciaUrl(e.target.value)}
                  placeholder="Carpeta de Drive o documentos en Supabase (https://...)"
                />
              </label>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Clasificación</div>
            <div className="event-form-stack">
              <div className="event-form-row">
                <label className="event-form-label">
                  Grupo
                  <select
                    className="modal-action-input"
                    value={grupo}
                    onChange={(e) => setGrupo(e.target.value)}
                  >
                    {grupos.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="event-form-label">
                  Código
                  <input
                    type="text"
                    className="modal-action-input"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Opcional · ej. V-J03"
                  />
                </label>
              </div>
              <div className="event-form-label" style={{ textTransform: 'none' }}>
                Tipo de actividad (uno o más)
                <div className="event-tipo-chips">
                  {TIPO_OPCIONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`event-tipo-chip${tipos.includes(t.value) ? ' is-selected' : ''}`}
                      onClick={() => toggleTipo(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Fecha y duración</div>
            <div className="event-form-row">
              <label className="event-form-label">
                Día
                <input
                  type="date"
                  className="modal-action-input"
                  value={fechaDia}
                  onChange={(e) => setFechaDia(e.target.value)}
                />
              </label>
              <label className="event-form-label">
                Inicio
                <input
                  type="time"
                  className="modal-action-input"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </label>
              <label className="event-form-label">
                Fin
                <input
                  type="time"
                  className="modal-action-input"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                />
              </label>
            </div>
            <p className="event-form-hint">
              Si la hora de fin es anterior a la de inicio, se interpreta como el día siguiente
              en Bogotá.
            </p>
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            {isEdit && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}
                disabled={deleting || saving}
                onClick={() => remove()}
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || deleting}
              onClick={() => submit()}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
