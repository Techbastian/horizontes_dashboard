import { useNavigate } from 'react-router-dom';
import KPICard from '../components/KPICard';
import FunnelChart from '../components/FunnelChart';
import DonutChartWidget from '../components/DonutChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
import FormationProgressSection from '../components/FormationProgressSection';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <div className="label">{label}</div>
        {payload.map((p, i) => (
          <div className="value" key={i}>{p.name}: {p.value}</div>
        ))}
      </div>
    );
  }
  return null;
}

function buildTrendData(applications) {
  const dateMap = {};
  applications.forEach(app => {
    if (app.updated_at) {
      const d = new Date(app.updated_at);
      const key = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
      dateMap[key] = (dateMap[key] || 0) + 1;
    }
  });

  return Object.entries(dateMap)
    .map(([date, count]) => ({ date, postulaciones: count }))
    .slice(-14);
}

export default function DashboardPage({ metrics, applications, formationProgress }) {
  const navigate = useNavigate();

  if (!metrics) return null;

  const trendData = buildTrendData(applications);

  // Top candidates list
  const topCandidates = metrics.withFases
    .filter(a => a.puntajeTotal !== null && a.puntajeTotal > 0)
    .sort((a, b) => (b.puntajeTotal || 0) - (a.puntajeTotal || 0))
    .slice(0, 6);

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Resumen Ejecutivo</h1>
          <p>Métricas en tiempo real e insights operacionales para Horizontes Senior.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">📥 Exportar Reporte</button>
          <button className="btn btn-primary" onClick={() => navigate('/candidatos')}>👥 Ver Candidatos</button>
        </div>
      </div>

      {/* Meta del proyecto — 100 formados */}
      {metrics.seleccionados && (
        <MetaCard seleccionados={metrics.seleccionados} onNavigate={() => navigate('/formacion')} />
      )}

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <KPICard
          label="Total Postulados"
          value={metrics.total.toLocaleString()}
          icon="📋"
          change={12.5}
          changeLabel="vs sem. pasada"
          index={0}
          onClick={() => navigate('/candidatos')}
        />
        <KPICard
          label="Elegibles"
          value={metrics.elegibles.toLocaleString()}
          icon="✅"
          change={parseFloat(metrics.tasaElegibilidad)}
          changeLabel={`% del total`}
          index={1}
          onClick={() => navigate('/candidatos', { state: { filterElegibilidad: 'Elegible' } })}
        />
        <KPICard
          label="Seleccionados"
          value={(metrics.seleccionados?.totalActivos ?? 0).toLocaleString()}
          icon="⭐"
          change={metrics.elegibles > 0 ? parseFloat(((metrics.seleccionados.totalActivos / metrics.elegibles) * 100).toFixed(1)) : 0}
          changeLabel="de elegibles · activos"
          index={2}
          onClick={() => navigate('/formacion')}
        />
      </div>

      {/* Distribución de Seleccionados */}
      {metrics.seleccionados && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Distribución de Seleccionados</div>
              <div className="card-subtitle">
                {metrics.seleccionados.totalActivos} activos de {metrics.seleccionados.totalElegidos} seleccionados
                {metrics.seleccionados.totalInactivos > 0 ? ` · ${metrics.seleccionados.totalInactivos} inactivos` : ''}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => navigate('/formacion')}>
              Ver formación →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 12 }}>
            {[
              { key: 'Senior', label: 'Ruta Senior', icon: '⭐', color: '#0d9488', bg: 'rgba(13,148,136,0.08)', bd: 'rgba(13,148,136,0.2)' },
              { key: 'Junior', label: 'Ruta Junior', icon: '🌱', color: '#a78bfa', bg: 'rgba(124,58,237,0.08)', bd: 'rgba(124,58,237,0.2)' },
              { key: 'Activación', label: 'Estrategia de Activación', icon: '⚡', color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.2)' },
            ].map(g => {
              const activos = metrics.seleccionados.activos[g.key] || 0;
              const inactivos = metrics.seleccionados.inactivos[g.key] || 0;
              return (
                <div key={g.key} onClick={() => navigate('/formacion')}
                  style={{ background: g.bg, border: `1px solid ${g.bd}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.label}</div>
                    <span style={{ fontSize: 20, opacity: 0.5 }}>{g.icon}</span>
                  </div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: g.color, lineHeight: 1.1, marginTop: 6 }}>{activos}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    activos{inactivos > 0 ? ` · ${inactivos} inactivos` : ''}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
            ⚡ La Estrategia de Activación es nivel Junior · Junior + Activación = <strong style={{ color: 'var(--text-secondary)' }}>{metrics.seleccionados.juniorMasActivacion}</strong> personas
          </div>
        </div>
      )}

      {/* Movimientos en el proceso formativo */}
      {metrics.transiciones && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Movimientos en el Proceso Formativo</div>
              <div className="card-subtitle">Cambios de nivel e inactivaciones a lo largo de la nivelación</div>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => navigate('/formacion')}>
              Ver detalle →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 12 }}>
            {[
              { icon: '🔼', label: 'Ascendieron a Senior', sub: 'Junior → Senior', value: metrics.transiciones.ascensos, color: '#a78bfa', bg: 'rgba(124,58,237,0.08)', bd: 'rgba(124,58,237,0.2)' },
              { icon: '🔽', label: 'Descendieron a Junior', sub: 'Senior → Junior', value: metrics.transiciones.descensos, color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.2)' },
              { icon: '⚡', label: 'Estrategia de Activación', sub: 'Ingresaron por activación', value: metrics.transiciones.activacion, color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', bd: 'rgba(245,158,11,0.18)' },
              { icon: '✖', label: 'Pasaron a Inactivos', sub: inactivosSubtitle(metrics.transiciones.inactivosPorGrupo), value: metrics.transiciones.inactivos, color: '#f87171', bg: 'rgba(244,63,94,0.07)', bd: 'rgba(244,63,94,0.2)' },
            ].map((c, i) => (
              <div key={i} onClick={() => navigate('/formacion')}
                style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                  <span style={{ fontSize: 20, opacity: 0.5 }}>{c.icon}</span>
                </div>
                <div style={{ fontSize: 42, fontWeight: 900, color: c.color, lineHeight: 1.1, marginTop: 6 }}>{c.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Middle Row: Funnel (replaces Donut) + Top Candidates */}
      <div className="dashboard-grid">
        {/* Funnel + Trend chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Funnel de Selección</div>
              <div className="card-subtitle">Postulados, elegibles y distribución de seleccionados por ruta</div>
            </div>
          </div>
          <FunnelChart data={metrics.funnelData} />
          
          {trendData.length > 2 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="card-title" style={{ fontSize: '14px' }}>Tendencia de Postulaciones</div>
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="gradientViolet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="postulaciones" stroke="#7c3aed" fill="url(#gradientViolet)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Candidates */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Top Candidatos</div>
              <div className="card-subtitle">Mayor puntaje total acumulado</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {topCandidates.length > 0 ? (
              <>
                {topCandidates.map((app, i) => {
                  const colors = ['#7c3aed', '#0d9488', '#3b82f6', '#f97316', '#f43f5e', '#06b6d4'];
                  return (
                    <div className="list-item" key={app.id}>
                      <div className="list-item-avatar" style={{ background: colors[i % colors.length] }}>
                        {(app.candidate?.first_name?.[0] || '?')}{(app.candidate?.last_name?.[0] || '')}
                      </div>
                      <div className="list-item-info">
                        <div className="list-item-name">{app.candidate?.first_name} {app.candidate?.last_name}</div>
                        <div className="list-item-sub">Doc: {app.candidate?.document_number || 'S/N'}</div>
                      </div>
                      <div className="list-item-right">
                        <div className="list-item-value">{app.puntajeTotal}/32</div>
                        <div className="list-item-meta">P. Total</div>
                      </div>
                    </div>
                  );
                })}
                <button className="view-all-btn" onClick={() => navigate('/candidatos')} style={{ marginTop: '16px' }}>
                  Ver listado completo →
                </button>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-text">Aún no hay puntajes asignados</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Demographics and Geography */}
      <div className="dashboard-grid-full">
        {/* City Distribution */}
        <div className="card">
          <HorizontalBarChart
            data={metrics.cityDistribution}
            title="Distribución por Municipio"
            subtitle="Origen geográfico de los candidatos"
            maxItems={8}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Distribución por Género</div>
              <div className="card-subtitle">Identidad de género declarada</div>
            </div>
          </div>
          <div className="donut-grid" style={{ justifyContent: 'flex-start', gap: 32 }}>
            <DonutChartWidget
              data={metrics.genderDistribution}
              colors={['#7c3aed', '#0d9488', '#f97316', '#3b82f6', '#f43f5e']}
              centerValue={metrics.total}
              centerLabel="Total"
              size={180}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
              {Object.entries(metrics.genderDistribution)
                .sort((a, b) => b[1] - a[1])
                .map(([g, v], i) => {
                  const colors = ['#7c3aed', '#0d9488', '#f97316', '#3b82f6', '#f43f5e'];
                  const pct = ((v / metrics.total) * 100).toFixed(1);
                  return (
                    <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }}></div>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {g}: <strong style={{ color: 'var(--text-primary)' }}>{v}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* Cuidadores section — full width */}
      {metrics.cuidadores && (
        <div style={{ marginTop: '24px' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Personas Cuidadoras</div>
                <div className="card-subtitle">Perfil cuidador desagregado por género y selección final</div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ width: 'auto', padding: '6px 14px' }}
                onClick={() => navigate('/candidatos', { state: { filterCuidador: true } })}
              >
                Ver todos →
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: '16px', marginTop: '12px' }}>

              {/* Column 1 — Total resumen */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px', padding: '20px', background: 'rgba(124,58,237,0.06)', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.15)' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total cuidadores</div>
                  <div
                    style={{ fontSize: '48px', fontWeight: '900', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1 }}
                    onClick={() => navigate('/candidatos', { state: { filterCuidador: true } })}
                    title="Ver todos los cuidadores"
                  >
                    {metrics.cuidadores.total}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span>En selección final</span>
                    <span style={{ color: '#0d9488', fontWeight: '700' }}>
                      {metrics.cuidadores.total > 0 ? Math.round((metrics.cuidadores.elegidos / metrics.cuidadores.total) * 100) : 0}%
                    </span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(148,163,184,0.1)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${metrics.cuidadores.total > 0 ? (metrics.cuidadores.elegidos / metrics.cuidadores.total) * 100 : 0}%`,
                      background: 'linear-gradient(90deg, #7c3aed, #0d9488)',
                      borderRadius: '4px',
                    }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Hombres</div>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>{metrics.cuidadores.hombres}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>Mujeres</div>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: '#ec4899' }}>{metrics.cuidadores.mujeres}</div>
                  </div>
                </div>
              </div>

              {/* Column 2 — Elegidos */}
              <div style={{ background: 'rgba(13,148,136,0.07)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(13,148,136,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>En Selección Final</div>
                    <div
                      style={{ fontSize: '48px', fontWeight: '900', color: '#0d9488', cursor: 'pointer', lineHeight: 1 }}
                      onClick={() => navigate('/candidatos', { state: { filterCuidador: true, filterEnrolled: 'yes' } })}
                      title="Ver lista filtrada"
                    >
                      {metrics.cuidadores.elegidos}
                    </div>
                  </div>
                  <div style={{ fontSize: '32px', opacity: 0.4 }}>⭐</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div
                    style={{ background: 'rgba(59,130,246,0.1)', borderRadius: '10px', padding: '16px', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(59,130,246,0.15)' }}
                    onClick={() => navigate('/candidatos', { state: { filterCuidador: true, filterEnrolled: 'yes' } })}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Hombres</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#3b82f6' }}>{metrics.cuidadores.hombresElegidos}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {metrics.cuidadores.elegidos > 0 ? Math.round((metrics.cuidadores.hombresElegidos / metrics.cuidadores.elegidos) * 100) : 0}%
                    </div>
                  </div>
                  <div
                    style={{ background: 'rgba(236,72,153,0.1)', borderRadius: '10px', padding: '16px', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(236,72,153,0.15)' }}
                    onClick={() => navigate('/candidatos', { state: { filterCuidador: true, filterEnrolled: 'yes' } })}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Mujeres</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#ec4899' }}>{metrics.cuidadores.mujeresElegidas}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {metrics.cuidadores.elegidos > 0 ? Math.round((metrics.cuidadores.mujeresElegidas / metrics.cuidadores.elegidos) * 100) : 0}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 3 — No elegidos */}
              <div style={{ background: 'rgba(148,163,184,0.05)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148,163,184,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>No Seleccionados</div>
                    <div
                      style={{ fontSize: '48px', fontWeight: '900', color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1 }}
                      onClick={() => navigate('/candidatos', { state: { filterCuidador: true, filterEnrolled: 'no' } })}
                      title="Ver lista filtrada"
                    >
                      {metrics.cuidadores.noElegidos}
                    </div>
                  </div>
                  <div style={{ fontSize: '32px', opacity: 0.35 }}>🤲</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div
                    style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)' }}
                    onClick={() => navigate('/candidatos', { state: { filterCuidador: true, filterEnrolled: 'no' } })}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Hombres</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-secondary)' }}>{metrics.cuidadores.hombresNoElegidos}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {metrics.cuidadores.noElegidos > 0 ? Math.round((metrics.cuidadores.hombresNoElegidos / metrics.cuidadores.noElegidos) * 100) : 0}%
                    </div>
                  </div>
                  <div
                    style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)' }}
                    onClick={() => navigate('/candidatos', { state: { filterCuidador: true, filterEnrolled: 'no' } })}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Mujeres</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-secondary)' }}>{metrics.cuidadores.mujeresNoElegidas}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {metrics.cuidadores.noElegidos > 0 ? Math.round((metrics.cuidadores.mujeresNoElegidas / metrics.cuidadores.noElegidos) * 100) : 0}%
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Progreso de Nivelación */}
      <FormationProgressSection formationProgress={formationProgress} />

      {/* Razones de No Elegibilidad + Donas: fila de 4 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '24px', marginTop: '24px' }}>
        <div className="card">
          <HorizontalBarChart
            data={metrics.motivosDescarteDistribution || {}}
            title="Razones de No Elegibilidad"
            subtitle="Distribución de motivos de descarte"
            maxItems={10}
          />
        </div>
        <AgeDonutCard
          title="Rango de Edad – Hombres"
          subtitle="Inscritos activos masculinos"
          data={metrics.enrolledAgeDistribMen || {}}
          colors={['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1e40af']}
        />
        <AgeDonutCard
          title="Rango de Edad – Mujeres"
          subtitle="Inscritas activas femeninas"
          data={metrics.enrolledAgeDistribWomen || {}}
          colors={['#be185d', '#ec4899', '#f9a8d4', '#db2777', '#f472b6', '#9d174d']}
        />
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Distribución por Género</div>
              <div className="card-subtitle">
                {metrics.totalEnrolledActive || 0} personas seleccionadas
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <DonutChartWidget
              data={filterNonZero(metrics.enrolledGenderDistribution || {})}
              colors={['#7c3aed', '#0d9488', '#f97316', '#3b82f6', '#f43f5e']}
              centerValue={metrics.totalEnrolledActive || 0}
              centerLabel="Seleccionados"
              size={180}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', paddingLeft: 8 }}>
              {Object.entries(metrics.enrolledGenderDistribution || {})
                .sort((a, b) => b[1] - a[1])
                .map(([g, v], i) => {
                  const colors = ['#7c3aed', '#0d9488', '#f97316', '#3b82f6', '#f43f5e'];
                  const total = metrics.totalEnrolledActive || 1;
                  const pct = ((v / total) * 100).toFixed(1);
                  return (
                    <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {g}: <strong style={{ color: 'var(--text-primary)' }}>{v}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Card estratégica de la meta del proyecto: 100 personas formadas.
// Se basa SOLO en personas activas hoy (Senior + Junior, incluida Activación
// que es nivel Junior). Los inactivos no cuentan hacia la meta.
function MetaCard({ seleccionados, onNavigate }) {
  const META = 100;
  const activos = seleccionados.totalActivos || 0;
  const margen = activos - META;
  const cubierta = activos >= META;

  // Escala del velocímetro con un poco de aire a la derecha del extremo mayor.
  const scaleMax = Math.max(activos, META) + 8;
  const clampPct = (n) => Math.max(0, Math.min(100, (n / scaleMax) * 100));
  const pctMeta = `${clampPct(META)}%`;
  const pctGoalSeg = `${clampPct(Math.min(activos, META))}%`;
  const pctMargin = `${Math.max(0, ((activos - META) / scaleMax) * 100)}%`;

  const rutas = [
    { key: 'Senior', label: 'Senior', color: 'var(--accent-teal)' },
    { key: 'Junior', label: 'Junior', color: 'var(--accent-violet)' },
    { key: 'Activación', label: 'Activación', color: 'var(--accent-amber)' },
  ];

  return (
    <div
      className="card"
      onClick={onNavigate}
      style={{
        cursor: 'pointer',
        background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(13,148,136,0.06))',
        borderColor: cubierta ? 'rgba(16,185,129,0.28)' : 'rgba(245,158,11,0.30)',
      }}
    >
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-violet)', fontWeight: 700 }}>
            🎯 Meta del proyecto
          </div>
          <div className="card-title" style={{ marginTop: 4 }}>Formación exitosa de 100 personas</div>
          <div className="card-subtitle">Personas activas hoy en rutas Senior y Junior (incluye Activación). Los inactivos no cuentan.</div>
        </div>
        <div style={{
          alignSelf: 'center',
          padding: '8px 16px', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          background: cubierta ? 'var(--accent-emerald-dim)' : 'var(--accent-amber-dim)',
          color: cubierta ? 'var(--accent-emerald)' : 'var(--accent-amber)',
          border: `1px solid ${cubierta ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
        }}>
          {cubierta ? `✓ Meta cubierta · +${margen} de margen` : `⚠ Faltan ${META - activos} para asegurar la meta`}
        </div>
      </div>

      {/* Número protagonista */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: cubierta ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{activos}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-muted)' }}>/ {META} meta</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>{Math.round((activos / META) * 100)}% de la meta</span>
      </div>

      {/* Barra: tramo hasta la meta + tramo de margen, con marcador en 100 */}
      <div style={{ position: 'relative', height: 18, marginTop: 22, marginBottom: 4 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.06)', borderRadius: 'var(--radius-full)' }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: pctGoalSeg,
          background: cubierta ? 'linear-gradient(90deg, var(--accent-teal), var(--accent-emerald))' : 'linear-gradient(90deg, var(--accent-amber), #fbbf24)',
          borderRadius: 'var(--radius-full)',
        }} />
        {cubierta && margen > 0 && (
          <div style={{
            position: 'absolute', left: pctMeta, top: 0, bottom: 0, width: pctMargin,
            background: 'repeating-linear-gradient(45deg, rgba(16,185,129,0.45), rgba(16,185,129,0.45) 6px, rgba(16,185,129,0.22) 6px, rgba(16,185,129,0.22) 12px)',
            borderTopRightRadius: 'var(--radius-full)', borderBottomRightRadius: 'var(--radius-full)',
          }} />
        )}
        <div style={{ position: 'absolute', left: pctMeta, top: -6, bottom: -6, width: 2, background: 'var(--text-primary)', opacity: 0.55 }} />
      </div>
      <div style={{ position: 'relative', height: 16 }}>
        <div style={{ position: 'absolute', left: pctMeta, transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Meta {META}
        </div>
      </div>

      {/* Desglose por ruta + regla de lectura */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-light)' }}>
        {rutas.map(r => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 'var(--radius-full)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.label}</span>
            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{seleccionados.activos[r.key] || 0}</strong>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
          Mientras se mantengan ≥ {META} activos, la meta es alcanzable →
        </div>
      </div>
    </div>
  );
}

function filterNonZero(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v > 0));
}

function inactivosSubtitle(porGrupo = {}) {
  const parts = Object.entries(porGrupo)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([g, v]) => `${v} ${g}`);
  return parts.length ? parts.join(' · ') : 'Se retiraron del programa';
}

function AgeDonutCard({ title, subtitle, data, colors }) {
  const filtered = filterNonZero(data);
  const total = Object.values(filtered).reduce((a, b) => a + b, 0);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-subtitle">{subtitle}</div>
        </div>
      </div>
      {total === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-text">Sin datos disponibles</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <DonutChartWidget
            data={filtered}
            colors={colors}
            centerValue={total}
            centerLabel="personas"
            size={180}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', paddingLeft: 8 }}>
            {Object.entries(data).map(([range, v], i) => {
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
              return (
                <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {range}: <strong style={{ color: 'var(--text-primary)' }}>{v}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
