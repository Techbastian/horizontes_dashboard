import { useState } from 'react';

const TRACK_COLORS = { Jr: '#3b82f6', Sr: '#7c3aed' };

function progressColor(pct) {
  if (pct >= 75) return '#10b981';
  if (pct >= 40) return '#f97316';
  return '#ef4444';
}

function ProgressBar({ pct, height = 6 }) {
  return (
    <div style={{ background: '#e2e8f0', borderRadius: 99, height, overflow: 'hidden', flex: 1 }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`,
        height: '100%',
        background: progressColor(pct),
        borderRadius: 99,
        transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

function RouteTooltip({ routes }) {
  return (
    <div style={{
      position: 'absolute', zIndex: 100, bottom: '130%', left: '50%',
      transform: 'translateX(-50%)',
      background: '#f1f5f9', border: '1px solid #cbd5e1',
      borderRadius: 10, padding: '12px 14px', minWidth: 280,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      pointerEvents: 'none',
    }}>
      {routes.map((r, i) => {
        const short = r.name.replace(/ Jr$| Sr$/, '');
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < routes.length - 1 ? 8 : 0 }}>
            <span style={{ fontSize: 11, color: '#475569', width: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{short}</span>
            <ProgressBar pct={r.pct} height={5} />
            <span style={{ fontSize: 11, fontWeight: 700, color: progressColor(r.pct), width: 36, textAlign: 'right' }}>{r.pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function ParticipantRow({ p, index }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 48px 180px 64px 72px',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 8,
        background: hover ? '#ffffff' : 'transparent',
        transition: 'background 0.15s',
        opacity: p.isActive ? 1 : 0.5,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Rank */}
      <span style={{ fontSize: 12, color: '#475569', textAlign: 'right' }}>{index + 1}</span>

      {/* Name */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {p.name}
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{p.email}</div>
      </div>

      {/* Track badge */}
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
        background: `${TRACK_COLORS[p.track]}22`, color: TRACK_COLORS[p.track],
        textAlign: 'center',
      }}>{p.track}</span>

      {/* Progress bar + tooltip */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}
        onMouseEnter={() => setHover(true)}>
        <ProgressBar pct={p.avgProgress} height={7} />
        {hover && <RouteTooltip routes={p.routes} />}
      </div>

      {/* % value */}
      <span style={{ fontSize: 13, fontWeight: 700, color: progressColor(p.avgProgress), textAlign: 'right' }}>
        {p.avgProgress}%
      </span>

      {/* Status */}
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, textAlign: 'center',
        background: p.isActive ? '#10b98122' : '#ef444422',
        color: p.isActive ? '#10b981' : '#ef4444',
      }}>
        {p.isActive ? 'Activo' : 'Inactivo'}
      </span>
    </div>
  );
}

export default function FormationProgressSection({ formationProgress }) {
  const [filter, setFilter] = useState('todos'); // todos | activos | inactivos
  const [search, setSearch] = useState('');

  if (!formationProgress) return null;

  const { participants, active, inactive, globalAvg, distribution } = formationProgress;

  const visible = participants
    .filter(p => {
      if (filter === 'activos' && !p.isActive) return false;
      if (filter === 'inactivos' && p.isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
      }
      return true;
    });

  const distColors = { '0–25%': '#ef4444', '25–50%': '#f97316', '50–75%': '#f59e0b', '75–100%': '#10b981' };

  return (
    <div style={{ marginTop: 24 }}>
      {/* Section title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Nivelación — Progreso de Formación</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Avance individual por ruta. Hover sobre la barra para ver detalle por módulo.</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progreso Promedio</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: progressColor(globalAvg), marginTop: 4 }}>{globalAvg}%</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{active.length} participantes activos</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Activos</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{active.length}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>en proceso de nivelación</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Retirados</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>{inactive.length}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>se retiraron del programa</div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Distribución de avance</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {Object.entries(distribution).map(([label, count]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: distColors[label], flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#475569', flex: 1 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table header / controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <input
            type="text"
            placeholder="Buscar participante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8,
              padding: '6px 12px', fontSize: 13, color: '#0f172a', outline: 'none', width: 220,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {['todos', 'activos', 'inactivos'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: filter === f ? '#cbd5e1' : 'transparent',
                  color: filter === f ? '#0f172a' : '#64748b',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>{visible.length} participantes</span>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '28px 1fr 48px 180px 64px 72px',
          gap: 12, padding: '6px 12px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          {['#', 'Participante', 'Ruta', 'Progreso por módulos', '%', 'Estado'].map(h => (
            <span key={h} style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === '#' ? 'right' : undefined }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 520, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#475569', fontSize: 13 }}>Sin resultados</div>
          ) : (
            visible.map((p, i) => <ParticipantRow key={p.candidateId} p={p} index={i} />)
          )}
        </div>
      </div>
    </div>
  );
}
