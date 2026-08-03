import { useState, useMemo } from 'react';
import InformeModal from '../components/InformeModal';
import InformeRetiros from '../components/InformeRetiros';
import { CATEGORIAS_RETIRO, SIN_CLASIFICAR, colorCategoria } from '../lib/retiros';

const nivelColor = (n) => /senior/i.test(n) ? '#0d9488' : /activ/i.test(n) ? '#f59e0b' : '#7c3aed';

function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return f;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

const hoyBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

// Resumen de asistencia de una persona, para leer un retiro sin motivo escrito.
function ResumenAsistencia({ a }) {
  if (!a || !a.medidas) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin seguimiento</span>;
  return (
    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
      {a.asistio}/{a.medidas}
      {a.faltasSeguidas >= 2 && (
        <span style={{ color: '#ef4444', fontWeight: 700 }}> · {a.faltasSeguidas} faltas seguidas</span>
      )}
    </span>
  );
}

export default function RetirosPage({ retiros, metrics, updateEnrollment }) {
  const [selected, setSelected] = useState(null);
  // Antes del early return: si el estado se declarara después, el número de
  // hooks cambiaría entre renders y React rompería al llegar los datos.
  const [informeOpen, setInformeOpen] = useState(false);
  const [soloSinClasificar, setSoloSinClasificar] = useState(false);

  const { casos = [], enRiesgo = [], porCategoria = {}, porNivel = {}, total = 0, totalRiesgo = 0, sinClasificar = 0 } = retiros || {};

  const catOrdenadas = useMemo(
    // "Sin clasificar" siempre al final: no es una categoría del vocabulario,
    // es lo que falta por clasificar.
    () => Object.entries(porCategoria).sort((a, b) => {
      if ((a[0] === SIN_CLASIFICAR) !== (b[0] === SIN_CLASIFICAR)) return a[0] === SIN_CLASIFICAR ? 1 : -1;
      return b[1] - a[1];
    }),
    [porCategoria]
  );

  const visibles = useMemo(
    () => (soloSinClasificar ? casos.filter((c) => c.sinClasificar) : casos),
    [casos, soloSinClasificar]
  );

  if (!retiros) return null;

  const totalSeleccionados = metrics?.seleccionados?.totalElegidos || (metrics?.seleccionados?.totalActivos + total) || total;
  const tasa = totalSeleccionados > 0 ? ((total / totalSeleccionados) * 100).toFixed(1) : 0;
  const maxCat = catOrdenadas.length ? Math.max(...catOrdenadas.map(([, n]) => n)) : 1;

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header-left">
          <h1>Retención y Deserción</h1>
          <p>Toda persona que salió del programa aparece aquí, con o sin motivo registrado, junto a las alertas de deserción.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setInformeOpen(true)}>📄 Informe PDF</button>
        </div>
      </div>

      {informeOpen && (
        <InformeModal
          titulo="Informe de retención y deserción"
          subtitulo="Horizontes Senior · motivos categorizados y alerta temprana"
          onClose={() => setInformeOpen(false)}
        >
          <InformeRetiros retiros={retiros} metrics={metrics} />
        </InformeModal>
      )}

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">🚪</span>Total Deserciones</div><div className="kpi-value">{total}</div><div className="kpi-change neutral">{total - sinClasificar} con motivo registrado</div></div>
        <div className="kpi-card" onClick={() => setSoloSinClasificar(v => !v)} style={{ cursor: sinClasificar ? 'pointer' : 'default', borderTop: soloSinClasificar ? '2px solid #f59e0b' : '2px solid transparent' }}>
          <div className="kpi-label"><span className="kpi-label-icon">❓</span>Sin Clasificar</div>
          <div className="kpi-value" style={{ color: sinClasificar ? '#f59e0b' : '#10b981' }}>{sinClasificar}</div>
          <div className="kpi-change neutral">{sinClasificar ? 'clic para filtrar' : 'todo clasificado'}</div>
        </div>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">📉</span>Tasa de Deserción</div><div className="kpi-value">{tasa}%</div><div className="kpi-change neutral">de los seleccionados</div></div>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">⚠️</span>En Riesgo</div><div className="kpi-value" style={{ color: '#f59e0b' }}>{totalRiesgo}</div><div className="kpi-change neutral">deserción potencial</div></div>
      </div>

      {/* Distribución de motivos + por nivel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><div><div className="card-title">Motivos de Deserción</div><div className="card-subtitle">Distribución por categoría</div></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {catOrdenadas.map(([cat, n]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: cat === SIN_CLASIFICAR ? '#f59e0b' : 'var(--text-secondary)', width: 190, flexShrink: 0, fontWeight: cat === SIN_CLASIFICAR ? 700 : 400 }}>{cat}</span>
                <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${(n / maxCat) * 100}%`, height: '100%', background: colorCategoria(cat), borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{n}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div><div className="card-title">Deserción por Nivel</div><div className="card-subtitle">Junior vs Senior</div></div></div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {['Junior', 'Senior'].map(n => (
              <div key={n} style={{ flex: 1, textAlign: 'center', background: `${nivelColor(n)}14`, border: `1px solid ${nivelColor(n)}33`, borderRadius: 12, padding: '20px 12px' }}>
                <div style={{ fontSize: 44, fontWeight: 900, color: nivelColor(n) }}>{porNivel[n] || 0}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ruta {n}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de casos */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Personas que Desertaron</div>
            <div className="card-subtitle">
              {visibles.length} {soloSinClasificar ? 'sin clasificar' : 'personas'} · clic para ver el detalle
              {updateEnrollment ? ' y registrar el motivo' : ''}
            </div>
          </div>
          {soloSinClasificar && (
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => setSoloSinClasificar(false)}>
              Ver todos
            </button>
          )}
        </div>
        <div className="table-container" style={{ marginTop: 8, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderSpacing: '10px 6px', minWidth: 860 }}>
            <thead><tr>{['Persona', 'Nivel', 'Motivo', 'Asistencia', 'Fecha'].map(h => <th key={h} style={{ textAlign: 'left', padding: '12px 14px', background: 'rgba(148,163,184,0.08)', fontSize: 12 }}>{h}</th>)}</tr></thead>
            <tbody>
              {visibles.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}</div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <span className="badge" style={{ background: `${nivelColor(c.nivel)}22`, color: nivelColor(c.nivel), fontWeight: 700 }}>{/senior/i.test(c.nivel) ? 'Senior' : 'Junior'}</span>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <span className="badge" style={{ background: `${colorCategoria(c.categoria)}22`, color: colorCategoria(c.categoria), fontWeight: 600, whiteSpace: 'nowrap' }}>{c.categoria}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.motivo || (c.asistencia?.ultimaExcusa
                        ? `Última excusa: ${c.asistencia.ultimaExcusa.texto}`
                        : 'Sin motivo registrado')}
                    </div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <ResumenAsistencia a={c.asistencia} />
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{fmtFecha(c.fecha)}</td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No hay deserciones registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* En riesgo */}
      <div className="card">
        <div className="card-header"><div><div className="card-title">⚠️ En Riesgo de Deserción</div><div className="card-subtitle">{totalRiesgo} casos con una novedad registrada — alerta temprana. Se marcan desde el perfil en Formación.</div></div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {enRiesgo.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', background: r.yaRetirado ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${r.yaRetirado ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 10 }}>
              <span style={{ fontSize: 18 }}>{r.yaRetirado ? '🔴' : '🟡'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.nombre}</span>
                  {r.ruta && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {r.ruta}</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.yaRetirado ? '#ef4444' : '#f59e0b' }}>{r.yaRetirado ? 'Ya retirado' : 'Activo · en riesgo'}</span>
                  {r.canal && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· por {r.canal}</span>}
                  {r.fecha && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {fmtFecha(r.fecha)}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{r.situacion}</div>
              </div>
              <ResumenAsistencia a={r.asistencia} />
            </div>
          ))}
          {enRiesgo.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 2px' }}>
              Nadie marcado en riesgo. Se registra desde el perfil de cada participante en Formación.
            </div>
          )}
        </div>
      </div>

      {selected && (
        <DetalleRetiro
          caso={selected}
          onClose={() => setSelected(null)}
          onGuardar={updateEnrollment}
        />
      )}
    </div>
  );
}

// Detalle de un caso: el motivo tal como está, las excusas que dejó en las
// actividades a las que no fue, y —si la página recibió `updateEnrollment`— el
// formulario para clasificar a quien todavía no tiene motivo.
function DetalleRetiro({ caso, onClose, onGuardar }) {
  const [categoria, setCategoria] = useState(
    CATEGORIAS_RETIRO.includes(caso.categoria) ? caso.categoria : 'Voluntario / personal'
  );
  const [motivo, setMotivo] = useState(caso.motivo || '');
  const [fecha, setFecha] = useState(caso.fecha || hoyBogota());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const editable = !!onGuardar;
  const motivoLimpio = motivo.trim();

  const guardar = async () => {
    if (!motivoLimpio) { setError('Escribe el motivo para poder guardar.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(caso.id, {
        custom_form_data: {
          retiro: {
            categoria,
            motivo: motivoLimpio,
            fecha: fecha || hoyBogota(),
            nivel: caso.nivel,
            // Deja rastro de que se clasificó desde el dashboard y no desde la
            // plantilla de PQRS, por si hay que reconciliar las dos fuentes.
            origen: 'dashboard',
          },
          estado_activo: false,
        },
        status: 'inactive',
      });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-info">
            <div>
              <div className="modal-name">{caso.nombre}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{caso.email} · {caso.doc}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className="badge" style={{ background: `${colorCategoria(caso.categoria)}22`, color: colorCategoria(caso.categoria), fontWeight: 700 }}>{caso.categoria}</span>
            <span className="badge" style={{ background: `${nivelColor(caso.nivel)}22`, color: nivelColor(caso.nivel), fontWeight: 700 }}>{/senior/i.test(caso.nivel) ? 'Senior' : 'Junior'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{fmtFecha(caso.fecha)}</span>
          </div>

          {/* Cómo venía asistiendo: es el contexto que explica la salida. */}
          {caso.asistencia?.medidas > 0 && (
            <div className="modal-section">
              <div className="modal-section-title">Asistencia antes de salir</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Asistió a {caso.asistencia.asistio} de {caso.asistencia.medidas} actividades medidas
                {caso.asistencia.faltasSeguidas >= 2 && (
                  <strong style={{ color: '#ef4444' }}> · {caso.asistencia.faltasSeguidas} faltas seguidas al final</strong>
                )}.
              </div>
            </div>
          )}

          {caso.motivo && (
            <div className="modal-section">
              <div className="modal-section-title">Motivo de la deserción</div>
              <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '14px 16px', fontSize: 14, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {caso.motivo}
              </div>
            </div>
          )}

          {/* Excusas dejadas actividad por actividad. Estaban en la base desde el
              ETL pero no se veían en ninguna pantalla. */}
          {caso.excusas?.length > 0 && (
            <div className="modal-section">
              <div className="modal-section-title">Excusas registradas ({caso.excusas.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {caso.excusas.map((e, i) => (
                  <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                      {e.actividad}{e.fecha ? ` · ${fmtFecha(e.fecha)}` : ''} · {e.grupo}
                      {e.asistio === false ? ' · no asistió' : e.asistio === true ? ' · asistió' : ''}
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{e.texto}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {caso.evidencia && (
            <a href={caso.evidencia} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--accent-teal)' }}>📎 Ver evidencia</a>
          )}

          {editable && (
            <div className="modal-section">
              <div className="modal-section-title">
                {caso.sinClasificar ? 'Registrar el motivo' : 'Corregir la clasificación'}
              </div>
              {caso.sinClasificar && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                  Esta persona salió del programa sin motivo registrado (viene marcada INACTIVO en la matriz).
                  Clasificarla la hace contar en los gráficos y en el informe.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Categoría</label>
                  <select className="filter-select" style={{ width: '100%' }} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                    {CATEGORIAS_RETIRO.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Fecha</label>
                  <input
                    type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' }}
                  />
                </div>
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Comentario</label>
              <textarea
                value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
                placeholder="Qué pasó, cómo se supo, con quién se habló…"
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
              />
              {caso.asistencia?.ultimaExcusa && !motivoLimpio && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'auto', padding: '6px 12px', marginTop: 8 }}
                  onClick={() => setMotivo(caso.asistencia.ultimaExcusa.texto)}
                >
                  Usar su última excusa
                </button>
              )}
              {error && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginTop: 8 }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardar} disabled={guardando || !motivoLimpio}>
                  {guardando ? 'Guardando…' : 'Guardar motivo'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
