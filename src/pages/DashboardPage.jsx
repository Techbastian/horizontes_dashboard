import { useNavigate } from 'react-router-dom';
import KPICard from '../components/KPICard';
import FunnelChart from '../components/FunnelChart';
import DonutChartWidget from '../components/DonutChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
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

export default function DashboardPage({ metrics, applications }) {
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

      {/* KPI Cards (6 cards) */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
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
          label="Evaluados"
          value={metrics.evaluados.toLocaleString()}
          icon="📝"
          change={metrics.total > 0 ? parseFloat(((metrics.evaluados / metrics.total) * 100).toFixed(1)) : 0}
          changeLabel="% del total"
          index={2}
          onClick={() => navigate('/candidatos', { state: { requireFase2: true } })}
        />
        <KPICard
          label="Form. Actitudinal"
          value={metrics.entrevistados.toLocaleString()}
          icon="🎤"
          change={metrics.evaluados > 0 ? parseFloat(((metrics.entrevistados / metrics.evaluados) * 100).toFixed(1)) : 0}
          changeLabel="% de evaluados"
          index={3}
          onClick={() => navigate('/candidatos', { state: { requireFase3: true } })}
        />
        <KPICard
          label="No Elegibles"
          value={metrics.noElegibles.toLocaleString()}
          icon="⛔"
          change={metrics.total > 0 ? parseFloat(((metrics.noElegibles / metrics.total) * 100).toFixed(1)) : 0}
          changeLabel="% del total"
          index={4}
          onClick={() => navigate('/candidatos', { state: { filterElegibilidad: 'No elegible' } })}
        />
        <KPICard
          label="Prom. Técnico"
          value={metrics.avgPuntajeTecnico}
          icon="⭐"
          change={0}
          changeLabel="de 15 puntos"
          index={5}
          onClick={() => navigate('/candidatos')}
        />
      </div>

      {/* Middle Row: Funnel (replaces Donut) + Top Candidates */}
      <div className="dashboard-grid">
        {/* Funnel + Trend chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Funnel de Selección</div>
              <div className="card-subtitle">Progresión a través de las fases del pipeline</div>
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
    </div>
  );
}
