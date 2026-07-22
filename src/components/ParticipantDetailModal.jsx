import { useState } from 'react';

function progressColor(pct) {
  if (pct >= 75) return '#10b981';
  if (pct >= 40) return '#f97316';
  return '#ef4444';
}

function ProgressBar({ pct }) {
  return (
    <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 8, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height: '100%',
        background: progressColor(pct), borderRadius: 99,
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

const RUTAS = ['Senior', 'Junior', 'Activación'];

// Las mismas seis categorías que clasifica scripts/upload_retiros.mjs. RetirosPage
// agrupa por este campo: inventar una categoría nueva aquí la dejaría fuera de los
// gráficos, así que el vocabulario se mantiene idéntico al del ETL.
const CATEGORIAS_RETIRO = [
  'Situación laboral',
  'Salud',
  'Metodología / contenido',
  'Sin contacto',
  'Tiempo / disponibilidad',
  'Voluntario / personal',
];

const hoyBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

// Semáforo de asistencia por actividad
function AttendanceDots({ items, labelPrefix }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it, i) => {
        const isEntregable = it.tipo === 'entregable';
        const pending = it.occurred === false;             // aún no ocurre → neutro
        const attended = !pending && it.asistio === true;
        const missed = !pending && it.asistio === false;
        const bg = pending ? '#f1f5f9' : attended ? '#10b98122' : missed ? '#ef444422' : '#e2e8f0';
        const color = pending ? '#cbd5e1' : attended ? '#10b981' : missed ? '#ef4444' : '#475569';
        // Entregables no tienen fecha: "Entregado" / "Pendiente" (pendiente cuenta 0%, va en rojo).
        const estado = pending ? 'Pendiente'
          : attended ? (isEntregable ? 'Entregado' : 'Asistió')
          : missed ? (isEntregable ? 'Pendiente' : 'No asistió')
          : 'Sin registro';
        const short = it.actividad.replace(/Sesi[oó]n\s*/i, 'S').replace(/Caf[eé]\s*/i, 'C').replace(/Entregable\s*/i, 'E').replace(/\s+/g, ' ').trim();
        return (
          <div key={i} title={`${it.actividad}${it.fecha ? ' · ' + it.fecha : ''}: ${estado}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
              {pending ? '·' : attended ? '✓' : missed ? '✗' : '·'}
            </div>
            <span style={{ fontSize: 9, color: '#64748b' }}>{short || `${labelPrefix}${i + 1}`}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ParticipantDetailModal({ profile, courseProgress, attendance, onClose, onSave }) {
  const [ruta, setRuta] = useState(RUTAS.includes(profile.ruta) ? profile.ruta : 'Junior');
  const [isActive, setIsActive] = useState(profile.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Motivo del retiro. Si ya venía uno cargado (de la plantilla de PQRS) se
  // precarga para poder corregirlo en vez de escribirlo de cero.
  const [categoria, setCategoria] = useState(
    CATEGORIAS_RETIRO.includes(profile.retiro?.categoria) ? profile.retiro.categoria : 'Voluntario / personal'
  );
  const [motivo, setMotivo] = useState(profile.retiro?.motivo || '');
  const [fechaRetiro, setFechaRetiro] = useState(profile.retiro?.fecha || hoyBogota());

  const canSave = !!onSave;
  const seVaAInactivar = !isActive;
  const motivoLimpio = motivo.trim();

  const cambioMotivo =
    seVaAInactivar &&
    (motivoLimpio !== (profile.retiro?.motivo || '') ||
      categoria !== (profile.retiro?.categoria || '') ||
      fechaRetiro !== (profile.retiro?.fecha || ''));

  const hasChanges = ruta !== profile.ruta || isActive !== profile.isActive || cambioMotivo;

  // Al inactivar se exige el motivo: un retiro sin razón no sirve para nada en la
  // página de Retiros, y es el momento en que se sabe. Reactivar no lo pide.
  const faltaMotivo = seVaAInactivar && !motivoLimpio;

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    setError(null);
    try {
      const custom = { ruta_asignada: ruta, estado_activo: isActive };

      if (seVaAInactivar) {
        custom.retiro = {
          categoria,
          motivo: motivoLimpio,
          fecha: fechaRetiro || hoyBogota(),
          nivel: ruta,
          // Deja rastro de que se registró desde el dashboard y no desde la
          // plantilla de PQRS, por si después hay que reconciliar las dos fuentes.
          origen: 'dashboard',
        };
      } else if (profile.retiro) {
        // Reactivar y dejar el `retiro` puesto lo mantendría en la página de
        // Retiros contradiciendo su estado. Se archiva en vez de borrarse.
        custom.retiro = null;
        custom.retiro_anterior = profile.retiro;
      }

      await onSave(profile.id, {
        custom_form_data: custom,
        status: isActive ? 'active' : 'inactive',
      });
      onClose();
    } catch (e) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const routes = courseProgress?.routes || [];
  const avgProgress = courseProgress?.avgProgress ?? null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(2, 6, 23, 0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#f1f5f9', border: '1px solid #e2e8f0',
        borderRadius: 16, width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{profile.fullName}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{profile.email}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Info personal */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Información Personal
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Documento', profile.doc],
                ['Teléfono', profile.phone || 'Sin registro'],
                ['Municipio', profile.city],
                ['Ruta actual', profile.ruta],
              ].map(([label, value]) => (
                <div key={label} style={{ background: '#ffffff', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Historial / transición */}
          {(profile.historia || profile.cambioNivel || profile.rutaInicial) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Historial en el programa
              </div>
              <div style={{ background: '#ffffff', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {profile.rutaInicial && (
                    <>
                      <span style={{ fontSize: 12, color: '#475569' }}>Ruta inicial: <b style={{ color: '#0f172a' }}>{profile.rutaInicial}</b></span>
                      <span style={{ color: '#475569' }}>→</span>
                    </>
                  )}
                  <span style={{ fontSize: 12, color: '#475569' }}>Ruta actual: <b style={{ color: '#0f172a' }}>{profile.ruta}</b></span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                    background: profile.isActive ? '#10b98122' : '#ef444422', color: profile.isActive ? '#10b981' : '#ef4444',
                  }}>{profile.isActive ? 'Activo' : 'Inactivo'}</span>
                </div>
                {profile.historia && <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{profile.historia}</div>}
                {profile.motivoCambio && profile.motivoCambio !== 'Sin cambio de nivel' && (
                  <div style={{ fontSize: 12, color: '#64748b' }}>Motivo: {profile.motivoCambio}</div>
                )}
                {profile.completitud != null && (
                  <div style={{ fontSize: 12, color: '#64748b' }}>Completitud en nivelación: <b style={{ color: '#475569' }}>{profile.completitud}%</b></div>
                )}
              </div>
            </div>
          )}

          {/* Motivo de retiro, en solo lectura. Se oculta cuando abajo aparece el
              formulario editable con estos mismos datos, para no mostrarlo dos veces. */}
          {profile.retiro && !(canSave && seVaAInactivar) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                🚪 Motivo de retiro
              </div>
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#ef444422', color: '#f87171' }}>{profile.retiro.categoria}</span>
                  {profile.retiro.fecha && <span style={{ fontSize: 12, color: '#64748b' }}>{profile.retiro.fecha}</span>}
                </div>
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{profile.retiro.motivo}</div>
              </div>
            </div>
          )}

          {/* En riesgo (aún no retirado) */}
          {!profile.retiro && profile.enRiesgo && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                ⚠️ En riesgo de deserción
              </div>
              <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {profile.enRiesgo.situacion}
              </div>
            </div>
          )}

          {/* Asistencia sesión por sesión */}
          {attendance && (attendance.sesiones?.length || attendance.cafes?.length || attendance.entregables?.length) ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Asistencia detallada
                </div>
                {profile.totalPonderado != null && (
                  <div style={{ fontSize: 20, fontWeight: 800, color: progressColor(profile.totalPonderado) }}>
                    {profile.totalPonderado}% <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>total ponderado</span>
                  </div>
                )}
              </div>
              {/* Leyenda de colores */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                {[['#10b98122', '#10b981', '✓', 'Asistió'], ['#ef444422', '#ef4444', '✗', 'No asistió'], ['#f1f5f9', '#cbd5e1', '·', 'Pendiente · aún no ocurre']].map(([bg, color, ch, label]) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{ch}</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {attendance.sesiones?.length > 0 && (() => {
                  const obsList = attendance.sesiones.filter(s => s.observacion);
                  const realizadas = attendance.sesiones.filter(s => s.occurred).length;
                  return (
                    <div>
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Sesiones <span style={{ color: '#64748b' }}>({profile.pondSesiones == null ? '—' : `${profile.pondSesiones}%`} · {realizadas}/{attendance.sesiones.length} realizadas)</span></div>
                      <AttendanceDots items={attendance.sesiones} labelPrefix="S" />
                      {obsList.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {obsList.map((s, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 12px' }}>
                              📝 {s.actividad} — observación: <span style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{s.observacion}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {attendance.cafes?.length > 0 && (() => {
                  const motivos = attendance.cafes.filter(c => c.observacion);
                  return (
                    <div>
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Cafés de conocimiento <span style={{ color: '#64748b' }}>({profile.pondCafes == null ? '—' : `${profile.pondCafes}%`})</span></div>
                      <AttendanceDots items={attendance.cafes} labelPrefix="C" />
                      {motivos.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {motivos.map((c, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 12px' }}>
                              📝 {c.actividad} — motivo de inasistencia: <span style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{c.observacion}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {attendance.entregables?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Entregables <span style={{ color: '#64748b' }}>({profile.pondEntregables == null ? '—' : `${profile.pondEntregables}%`})</span></div>
                    <AttendanceDots items={attendance.entregables} labelPrefix="E" />
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Progreso de formación */}
          {routes.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Progreso por Módulo
                </div>
                {avgProgress !== null && (
                  <div style={{ fontSize: 22, fontWeight: 800, color: progressColor(avgProgress) }}>
                    {avgProgress}% <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>promedio</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {routes.map((r, i) => {
                  const shortName = r.name.replace(/ Jr$| Sr$/, '');
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: '#475569',
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#475569', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {shortName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar pct={r.pct} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(r.pct), width: 38, textAlign: 'right', flexShrink: 0 }}>
                            {r.pct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {routes.length === 0 && (
            <div style={{ background: '#ffffff', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
              Sin datos de progreso disponibles
            </div>
          )}

          {/* Edición */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Editar Participante
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Ruta */}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Ruta Asignada</label>
                <select
                  value={ruta}
                  onChange={e => setRuta(e.target.value)}
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid #cbd5e1',
                    borderRadius: 8, padding: '9px 12px', color: '#0f172a', fontSize: 14,
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  {RUTAS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Estado en el Programa</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[true, false].map(val => (
                    <button
                      key={String(val)}
                      onClick={() => setIsActive(val)}
                      style={{
                        flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        background: isActive === val
                          ? (val ? '#10b98133' : '#ef444433')
                          : '#ffffff',
                        color: isActive === val
                          ? (val ? '#10b981' : '#ef4444')
                          : '#64748b',
                        outline: isActive === val ? `1px solid ${val ? '#10b981' : '#ef4444'}` : '1px solid #cbd5e1',
                      }}
                    >
                      {val ? 'Activo' : 'Inactivo'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Motivo del retiro: solo al inactivar. Alimenta la página de Retiros. */}
            {seVaAInactivar && (
              <div style={{
                marginTop: 16, padding: '16px 18px', borderRadius: 10,
                background: '#ffffff', border: '1px solid #fecaca',
                borderLeft: '3px solid #ef4444',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                  Motivo del retiro
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                  Queda registrado en la página de Retiros y en el histórico de la persona.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Categoría</label>
                    <select
                      value={categoria}
                      onChange={e => setCategoria(e.target.value)}
                      style={{
                        width: '100%', background: '#ffffff', border: '1px solid #cbd5e1',
                        borderRadius: 8, padding: '9px 12px', color: '#0f172a', fontSize: 14,
                        outline: 'none', cursor: 'pointer',
                      }}
                    >
                      {CATEGORIAS_RETIRO.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Fecha</label>
                    <input
                      type="date"
                      value={fechaRetiro}
                      onChange={e => setFechaRetiro(e.target.value)}
                      style={{
                        width: '100%', background: '#ffffff', border: '1px solid #cbd5e1',
                        borderRadius: 8, padding: '8px 10px', color: '#0f172a', fontSize: 14,
                        outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </div>

                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
                  Comentario
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Qué pasó, cómo se supo, con quién se habló…"
                  style={{
                    width: '100%', background: '#ffffff', border: `1px solid ${faltaMotivo ? '#ef4444' : '#cbd5e1'}`,
                    borderRadius: 8, padding: '9px 12px', color: '#0f172a', fontSize: 13.5,
                    outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                  }}
                />
                {faltaMotivo && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>
                    Escribe el motivo para poder guardar el retiro.
                  </div>
                )}
              </div>
            )}

            {/* Reactivar a alguien que estaba retirado: se avisa qué pasa con el motivo. */}
            {!seVaAInactivar && profile.retiro && (
              <div style={{
                marginTop: 16, padding: '12px 16px', borderRadius: 10,
                background: '#ffffff', border: '1px solid #e2e8f0', borderLeft: '3px solid #10b981',
                fontSize: 12.5, color: '#475569', lineHeight: 1.55,
              }}>
                Al reactivar, el motivo de retiro deja de contar en la página de Retiros,
                pero se conserva en el histórico de la persona.
              </div>
            )}
          </div>

          {error && (
            <div style={{ background: '#ef444420', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving || !canSave || faltaMotivo}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: hasChanges && !saving && canSave && !faltaMotivo ? '#0d9488' : '#e2e8f0',
                color: hasChanges && !saving && canSave && !faltaMotivo ? '#fff' : '#475569',
                fontSize: 13, fontWeight: 600,
                cursor: hasChanges && !saving && canSave && !faltaMotivo ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
