import { useState, useMemo } from 'react';

const CAT_COLORS = {
  'Metodología / contenido': '#7c3aed',
  'Sin contacto': '#64748b',
  'Situación laboral': '#3b82f6',
  'Tiempo / disponibilidad': '#f59e0b',
  'Salud': '#ef4444',
  'Voluntario / personal': '#0d9488',
};
const nivelColor = (n) => /senior/i.test(n) ? '#0d9488' : /activ/i.test(n) ? '#f59e0b' : '#7c3aed';

function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return f;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RetirosPage({ retiros, metrics }) {
  const [selected, setSelected] = useState(null);
  if (!retiros) return null;

  const { casos, enRiesgo, porCategoria, porNivel, total, totalRiesgo } = retiros;
  const totalSeleccionados = metrics?.seleccionados?.totalElegidos || (metrics?.seleccionados?.totalActivos + total) || total;
  const tasa = totalSeleccionados > 0 ? ((total / totalSeleccionados) * 100).toFixed(1) : 0;

  const catOrdenadas = useMemo(
    () => Object.entries(porCategoria).sort((a, b) => b[1] - a[1]),
    [porCategoria]
  );
  const maxCat = catOrdenadas.length ? catOrdenadas[0][1] : 1;

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header-left">
          <h1>Retención y Retiros</h1>
          <p>Motivos de retiro categorizados y alerta temprana de deserción.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">🚪</span>Total Retirados</div><div className="kpi-value">{total}</div><div className="kpi-change neutral">con motivo registrado</div></div>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">📉</span>Tasa de Retiro</div><div className="kpi-value">{tasa}%</div><div className="kpi-change neutral">de los seleccionados</div></div>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">⚠️</span>En Riesgo</div><div className="kpi-value" style={{ color: '#f59e0b' }}>{totalRiesgo}</div><div className="kpi-change neutral">deserción potencial</div></div>
        <div className="kpi-card"><div className="kpi-label"><span className="kpi-label-icon">🌱</span>Retiros Junior</div><div className="kpi-value">{porNivel.Junior || 0}<span style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 400 }}> · {porNivel.Senior || 0} Senior</span></div><div className="kpi-change neutral">por nivel</div></div>
      </div>

      {/* Distribución de motivos + por nivel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><div><div className="card-title">Motivos de Retiro</div><div className="card-subtitle">Distribución por categoría</div></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {catOrdenadas.map(([cat, n]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 190, flexShrink: 0 }}>{cat}</span>
                <div style={{ flex: 1, background: '#1e293b', borderRadius: 99, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${(n / maxCat) * 100}%`, height: '100%', background: CAT_COLORS[cat] || '#64748b', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{n}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div><div className="card-title">Retiros por Nivel</div><div className="card-subtitle">Junior vs Senior</div></div></div>
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
        <div className="card-header"><div><div className="card-title">Casos de Retiro</div><div className="card-subtitle">{total} personas · click para ver el motivo completo</div></div></div>
        <div className="table-container" style={{ marginTop: 8, overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderSpacing: '10px 6px', minWidth: 760 }}>
            <thead><tr>{['Persona', 'Nivel', 'Motivo', 'Fecha'].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? 'left' : 'left', padding: '12px 14px', background: 'rgba(148,163,184,0.08)', fontSize: 12 }}>{h}</th>)}</tr></thead>
            <tbody>
              {casos.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}</div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <span className="badge" style={{ background: `${nivelColor(c.nivel)}22`, color: nivelColor(c.nivel), fontWeight: 700 }}>{/senior/i.test(c.nivel) ? 'Senior' : 'Junior'}</span>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                    <span className="badge" style={{ background: `${CAT_COLORS[c.categoria] || '#64748b'}22`, color: CAT_COLORS[c.categoria] || '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.categoria}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.motivo}</div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{fmtFecha(c.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* En riesgo */}
      <div className="card">
        <div className="card-header"><div><div className="card-title">⚠️ En Riesgo de Deserción</div><div className="card-subtitle">{totalRiesgo} casos que expresaron intención de retirarse — alerta temprana</div></div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {enRiesgo.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', background: r.yaRetirado ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${r.yaRetirado ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 10 }}>
              <span style={{ fontSize: 18 }}>{r.yaRetirado ? '🔴' : '🟡'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.nombre}</span>
                  {r.ruta && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {r.ruta}</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.yaRetirado ? '#ef4444' : '#f59e0b' }}>{r.yaRetirado ? 'Ya retirado' : 'Activo · en riesgo'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{r.situacion}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal detalle motivo */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,6,23,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{selected.nombre}</div><div style={{ fontSize: 13, color: '#64748b' }}>{selected.email}</div></div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: `${CAT_COLORS[selected.categoria] || '#64748b'}22`, color: CAT_COLORS[selected.categoria] || '#94a3b8', fontWeight: 700 }}>{selected.categoria}</span>
                <span className="badge" style={{ background: `${nivelColor(selected.nivel)}22`, color: nivelColor(selected.nivel), fontWeight: 700 }}>{/senior/i.test(selected.nivel) ? 'Senior' : 'Junior'}</span>
                <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>{fmtFecha(selected.fecha)}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Motivo de retiro</div>
                <div style={{ background: '#1a2035', borderRadius: 10, padding: '14px 16px', fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.motivo}</div>
              </div>
              {selected.evidencia && (
                <a href={selected.evidencia} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#0d9488' }}>📎 Ver evidencia</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
