import { useState } from 'react';
import { tiposEvento, tipoLabel } from '../lib/eventos';
import { crearTipoEvento, actualizarTipoEvento, valorDesdeEtiqueta } from '../lib/tiposEvento';

// Nombre de la clave de asistencia en pantalla: 'sesion' → "Sesión".
const claveLabel = (clave) => (clave ? tipoLabel(clave) : '—');

// El peso se guarda como fracción (0.35) y se edita como porcentaje (35): es
// como está escrito en la matriz y como lo dice el programa ("sesiones 35%").
const aPorcentaje = (peso) => (peso == null ? '' : String(Math.round(peso * 1000) / 10));
const aFraccion = (txt) => {
  const t = String(txt).trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n / 100 : null;
};

export default function TiposEventoModal({ onClose, onSaved }) {
  const tipos = tiposEvento();
  const conAsistencia = tipos.filter((t) => t.tipoAsistencia);
  // Solo las claves canónicas pueden recibir tipos nuevos: son las que definen
  // un peso. 'nivelacion' no aparece porque ella misma cuenta como 'sesion'.
  const claves = conAsistencia.filter((t) => t.tipoAsistencia === t.value);

  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Alta
  const [etiqueta, setEtiqueta] = useState('');
  const [tomaAsistencia, setTomaAsistencia] = useState(true);
  const [cuentaComo, setCuentaComo] = useState('propio');
  const [pesoNuevo, setPesoNuevo] = useState('');

  // Edición de pesos: { [valor]: texto }
  const [pesos, setPesos] = useState(() =>
    Object.fromEntries(tipos.map((t) => [t.value, aPorcentaje(t.peso)]))
  );

  const refrescar = async () => {
    if (onSaved) await onSaved();
  };

  const crear = async () => {
    setError(null);
    if (!etiqueta.trim()) {
      setError('Ponle un nombre al tipo.');
      return;
    }
    setGuardando(true);
    try {
      await crearTipoEvento({
        etiqueta,
        tomaAsistencia,
        cuentaComo,
        peso: cuentaComo === 'propio' ? aFraccion(pesoNuevo) : null,
      });
      setEtiqueta('');
      setPesoNuevo('');
      setCuentaComo('propio');
      await refrescar();
    } catch (e) {
      setError(e.message || 'No se pudo crear el tipo.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarPeso = async (t) => {
    setError(null);
    setGuardando(true);
    try {
      await actualizarTipoEvento(t.value, { peso: aFraccion(pesos[t.value]) });
      await refrescar();
    } catch (e) {
      setError(e.message || 'No se pudo guardar el peso.');
    } finally {
      setGuardando(false);
    }
  };

  const valorPreview = valorDesdeEtiqueta(etiqueta);

  return (
    <div className="modal-overlay" style={{ zIndex: 1150 }} onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-avatar">🏷️</div>
            <div>
              <div className="modal-name">Tipos de evento</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Qué actividades existen, a cuáles se les toma asistencia y cuánto pesan
              </span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="modal-section">
            <div className="modal-section-title">Tipos actuales</div>
            <table className="tipos-evento-tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Asistencia</th>
                  <th style={{ textAlign: 'right' }}>Peso en el %</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => {
                  // Solo la fila canónica de cada clave define el peso; las que se
                  // suman a otra (Formación en Platzi → Sesión) lo heredan.
                  const defineElPeso = t.tipoAsistencia === t.value;
                  const cambiado = aPorcentaje(t.peso) !== (pesos[t.value] ?? '');
                  return (
                    <tr key={t.value}>
                      <td>
                        <strong>{t.label}</strong>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t.value}</div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {t.tipoAsistencia
                          ? defineElPeso
                            ? 'Sí'
                            : `Sí · cuenta como ${claveLabel(t.tipoAsistencia)}`
                          : 'No'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {defineElPeso ? (
                          <>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              className="modal-action-input"
                              style={{ width: 68, textAlign: 'right' }}
                              value={pesos[t.value] ?? ''}
                              placeholder="—"
                              onChange={(e) =>
                                setPesos((p) => ({ ...p, [t.value]: e.target.value }))
                              }
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> %</span>
                            {cambiado && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ marginLeft: 8 }}
                                disabled={guardando}
                                onClick={() => guardarPeso(t)}
                              >
                                Guardar
                              </button>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="event-form-hint">
              Vacío = se registra pero no pesa, como las mentorías. Los pesos se reparten entre los
              componentes que ya tienen actividades ocurridas, así que no tienen que sumar 100.
            </p>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Nuevo tipo</div>
            <div className="event-form-stack">
              <div className="event-form-row">
                <label className="event-form-label">
                  Nombre
                  <input
                    type="text"
                    className="modal-action-input"
                    value={etiqueta}
                    onChange={(e) => setEtiqueta(e.target.value)}
                    placeholder="Ej. Taller práctico"
                  />
                </label>
                <label className="event-form-label" style={{ justifyContent: 'flex-end' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textTransform: 'none', fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={tomaAsistencia}
                      onChange={(e) => setTomaAsistencia(e.target.checked)}
                    />
                    Se le toma asistencia
                  </span>
                </label>
              </div>

              {tomaAsistencia && (
                <div className="event-form-row">
                  <label className="event-form-label">
                    Cuenta como
                    <select
                      className="modal-action-input"
                      value={cuentaComo}
                      onChange={(e) => setCuentaComo(e.target.value)}
                    >
                      <option value="propio">Actividad aparte</option>
                      {claves.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {cuentaComo === 'propio' && (
                    <label className="event-form-label">
                      Peso en el % (opcional)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        className="modal-action-input"
                        value={pesoNuevo}
                        onChange={(e) => setPesoNuevo(e.target.value)}
                        placeholder="Vacío = no pesa"
                      />
                    </label>
                  )}
                </div>
              )}

              <p className="event-form-hint">
                {etiqueta.trim()
                  ? `Se guardará como "${valorPreview}". `
                  : ''}
                {tomaAsistencia
                  ? cuentaComo === 'propio'
                    ? 'Tendrá su propia lista de actividades y su propio porcentaje.'
                    : `Sus actividades se sumarán a las de ${claveLabel(cuentaComo)} y pesarán igual que ellas.`
                  : 'No llevará registro de asistencia: solo aparecerá en el calendario.'}
              </p>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando || !etiqueta.trim()}
            onClick={() => crear()}
          >
            {guardando ? 'Guardando…' : 'Crear tipo'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
