import { useState } from 'react';

function progressColor(pct) {
  if (pct >= 75) return '#10b981';
  if (pct >= 40) return '#f97316';
  return '#ef4444';
}

function ProgressBar({ pct }) {
  return (
    <div style={{ flex: 1, background: '#1e293b', borderRadius: 99, height: 8, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`, height: '100%',
        background: progressColor(pct), borderRadius: 99,
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

const RUTAS = ['Senior', 'Junior', 'Reemplazo'];

export default function ParticipantDetailModal({ profile, courseProgress, onClose, onSave }) {
  const [ruta, setRuta] = useState(profile.ruta === 'Reemplazo' ? 'Reemplazo' : profile.ruta);
  const [isActive, setIsActive] = useState(profile.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSave = !!onSave;
  const hasChanges = ruta !== profile.ruta || isActive !== profile.isActive;

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(profile.id, {
        custom_form_data: { ruta_asignada: ruta, estado_activo: isActive },
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
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: 16, width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{profile.fullName}</div>
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
                <div key={label} style={{ background: '#1a2035', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

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
                        background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: '#94a3b8',
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            <div style={{ background: '#1a2035', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
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
                    width: '100%', background: '#1a2035', border: '1px solid #334155',
                    borderRadius: 8, padding: '9px 12px', color: '#f1f5f9', fontSize: 14,
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
                          : '#1a2035',
                        color: isActive === val
                          ? (val ? '#10b981' : '#ef4444')
                          : '#64748b',
                        outline: isActive === val ? `1px solid ${val ? '#10b981' : '#ef4444'}` : '1px solid #334155',
                      }}
                    >
                      {val ? 'Activo' : 'Inactivo'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
              style={{ padding: '9px 20px', borderRadius: 8, background: 'transparent', border: '1px solid #334155', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving || !canSave}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: hasChanges && !saving && canSave ? '#0d9488' : '#1e293b',
                color: hasChanges && !saving && canSave ? '#fff' : '#475569',
                fontSize: 13, fontWeight: 600, cursor: hasChanges && !saving && canSave ? 'pointer' : 'not-allowed',
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
