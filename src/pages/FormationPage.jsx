import { useState, useMemo } from 'react';
import ParticipantDetailModal from '../components/ParticipantDetailModal';

const GROUPS = ['Senior', 'Junior', 'Activación'];
const GROUP_META = {
  Senior:     { color: 'var(--accent-teal)',   solid: '#0d9488', icon: '⭐', label: 'Ruta Senior' },
  Junior:     { color: 'var(--accent-violet)', solid: '#7c3aed', icon: '🌱', label: 'Ruta Junior' },
  'Activación': { color: '#f59e0b',            solid: '#f59e0b', icon: '⚡', label: 'Estrategia de Activación' },
};

function pct01(v) { return v == null ? null : Math.round(v * 100); }
function progressColor(p) {
  if (p == null) return '#475569';
  if (p >= 75) return '#10b981';
  if (p >= 40) return '#f97316';
  return '#ef4444';
}

function Bar({ pct, width = 90 }) {
  if (pct == null) return <span style={{ color: '#475569', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width, background: '#1e293b', borderRadius: 99, height: 6, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: progressColor(pct), borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(pct), minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

// Badge que cuenta la historia de la persona (transición de nivel)
function HistoryBadge({ profile }) {
  const c = profile.cambioNivel || '';
  let bg, color, icon, text;
  if (/Ascendió/i.test(c))      { bg = '#7c3aed22'; color = '#a78bfa'; icon = '🔼'; text = 'Subió a Senior'; }
  else if (/Descendió/i.test(c)){ bg = '#f59e0b22'; color = '#fbbf24'; icon = '🔽'; text = 'Bajó a Junior'; }
  else if (/activación/i.test(c)){ bg = '#f59e0b22'; color = '#fbbf24'; icon = '⚡'; text = 'Activación'; }
  else if (/Inactivo/i.test(c)) { bg = '#ef444422'; color = '#f87171'; icon = '✖'; text = 'Retirado'; }
  else return <span style={{ fontSize: 11, color: '#475569' }}>—</span>;
  return (
    <span title={profile.historia || text} style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: bg, color, whiteSpace: 'nowrap',
    }}>{icon} {text}</span>
  );
}

// Mini-gráfico: asistencia por sesión del grupo
function SessionAttendanceChart({ sessions }) {
  if (!sessions || !sessions.length) return null;
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
        Asistencia por sesión
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 130, paddingTop: 8 }}>
        {sessions.map((s, i) => {
          const label = s.actividad.replace(/Sesi[oó]n\s*/i, '').replace(/^\d+\s*/, '').trim() || `S${i + 1}`;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(s.pct) }}>{s.pct}%</span>
              <div style={{ width: '100%', maxWidth: 46, background: '#1e293b', borderRadius: 6, height: '100%', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: `${s.pct}%`, background: progressColor(s.pct), borderRadius: 6, transition: 'height 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ fontSize: 9, color: '#475569' }}>{s.asistieron}/{s.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FormationPage({ enrollments = [], formationProgress, attendanceByCandidate = {}, groupAttendance = {}, updateEnrollment }) {
  const [activeTab, setActiveTab] = useState('Senior');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const progressByCandidateId = useMemo(() => {
    if (!formationProgress) return {};
    const map = {};
    formationProgress.participants.forEach(p => { map[p.candidateId] = p; });
    return map;
  }, [formationProgress]);

  // Construir perfiles desde enrollments (ya incluye ruta_asignada, historial y ponderados)
  const profiles = useMemo(() => {
    return enrollments.map(enr => {
      const c = enr.candidate || {};
      const cf = enr.custom_form_data || {};
      return {
        id: enr.id,
        candidate_id: c.id,
        fullName: cf.nombre_completo || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Desconocido',
        doc: cf.cedula || c.document_number || 'S/N',
        email: c.email || '',
        phone: c.phone || '',
        city: c.city || 'Desconocido',
        ruta: cf.ruta_asignada || 'Sin asignar',
        isActive: cf.estado_activo !== false && enr.status !== 'inactive',
        rutaInicial: cf.ruta_inicial || null,
        cambioNivel: cf.cambio_nivel || null,
        historia: cf.historia || null,
        motivoCambio: cf.motivo_cambio || null,
        completitud: cf.completitud_nivelacion ?? null,
        pondSesiones: pct01(cf.pond_sesiones),
        pondCafes: pct01(cf.pond_cafes),
        pondEntregables: pct01(cf.pond_entregables),
        totalPonderado: pct01(cf.total_ponderado),
      };
    });
  }, [enrollments]);

  // Stats globales por grupo
  const groupStats = useMemo(() => {
    const s = {};
    GROUPS.forEach(g => {
      const list = profiles.filter(p => p.ruta === g);
      const activos = list.filter(p => p.isActive);
      const avg = (key) => {
        const vals = activos.map(p => p[key]).filter(v => v != null);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      };
      s[g] = { total: list.length, activos: activos.length, inactivos: list.length - activos.length, avgSesiones: avg('pondSesiones'), avgTotal: avg('totalPonderado') };
    });
    return s;
  }, [profiles]);

  const filtered = useMemo(() => {
    let list = profiles.filter(p => p.ruta === activeTab);
    if (!showInactive) list = list.filter(p => p.isActive);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.fullName.toLowerCase().includes(q) || String(p.doc).includes(q) || p.email.toLowerCase().includes(q));
    }
    // Activos primero (por total ponderado desc), luego inactivos
    return list.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (b.totalPonderado ?? -1) - (a.totalPonderado ?? -1);
    });
  }, [profiles, activeTab, search, showInactive]);

  const meta = GROUP_META[activeTab];
  const st = groupStats[activeTab] || {};

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header-left">
          <h1>Cohorte de Formación</h1>
          <p>Asistencia y avance formativo por grupo · Senior, Junior y Estrategia de Activación.</p>
        </div>
      </div>

      {/* KPIs por grupo */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        {GROUPS.map((g, i) => {
          const gs = groupStats[g] || {};
          const gm = GROUP_META[g];
          return (
            <div
              key={g}
              className="kpi-card"
              onClick={() => setActiveTab(g)}
              style={{ animationDelay: `${i * 0.1}s`, cursor: 'pointer', borderTop: activeTab === g ? `2px solid ${gm.solid}` : '2px solid transparent' }}
            >
              <div className="kpi-label"><span className="kpi-label-icon">{gm.icon}</span>{gm.label}</div>
              <div className="kpi-value">{gs.activos ?? 0}</div>
              <div className="kpi-change neutral" style={{ display: 'flex', gap: 12 }}>
                <span>{gs.inactivos ?? 0} inactivos</span>
                {gs.avgTotal != null && <span style={{ color: progressColor(gs.avgTotal) }}>· {gs.avgTotal}% prom.</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Panel del grupo activo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Promedios del grupo — {meta.label}</div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Asistencia a sesiones</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: progressColor(st.avgSesiones) }}>{st.avgSesiones ?? '—'}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Total ponderado</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: progressColor(st.avgTotal) }}>{st.avgTotal ?? '—'}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Participantes</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#f1f5f9' }}>{st.activos ?? 0}</div>
            </div>
          </div>
        </div>
        <SessionAttendanceChart sessions={groupAttendance[activeTab]} />
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', gap: 24 }}>
          {GROUPS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="nav-item"
              style={{
                padding: '12px 16px', background: 'transparent',
                borderBottom: activeTab === tab ? `2px solid ${GROUP_META[tab].solid}` : '2px solid transparent',
                borderRadius: 0, fontWeight: activeTab === tab ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 8,
                color: activeTab === tab ? '#f1f5f9' : '#64748b',
              }}
            >
              {GROUP_META[tab].label}
              <span style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
                {groupStats[tab]?.activos ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="filter-search" style={{ minWidth: 280 }}>
            <span className="filter-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar por cédula o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 38px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Mostrar inactivos
            </label>
            <span style={{ fontSize: 13, color: '#475569' }}>{filtered.length} participantes</span>
          </div>
        </div>

        {/* Tabla */}
        <div className="table-container" style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderSpacing: '10px 6px', minWidth: 860 }}>
            <thead>
              <tr>
                {['Participante', 'Documento', 'Historial', 'Asist. sesiones', 'Cafés', 'Entregable', 'Total', 'Estado'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '12px 14px', background: 'rgba(148,163,184,0.08)', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => setSelectedProfile(p)} style={{ cursor: 'pointer', opacity: p.isActive ? 1 : 0.55 }}>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'left', borderRadius: 4 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.fullName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.email}</div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4, fontSize: 13 }}>{p.doc}</td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}><HistoryBadge profile={p} /></td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><Bar pct={p.pondSesiones} /></div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><Bar pct={p.pondCafes} width={60} /></div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    {p.pondEntregables == null ? <span style={{ color: '#475569' }}>—</span>
                      : p.pondEntregables >= 100 ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                      : <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>}
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: progressColor(p.totalPonderado) }}>{p.totalPonderado ?? '—'}%</span>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    {p.isActive
                      ? <span className="badge badge-approved" style={{ background: 'var(--accent-emerald-dim)', color: 'var(--accent-emerald)' }}>Activo</span>
                      : <span className="badge badge-rejected" style={{ background: 'var(--accent-rose-dim)', color: 'var(--accent-rose)' }}>Inactivo</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No hay participantes en este grupo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProfile && (
        <ParticipantDetailModal
          profile={selectedProfile}
          courseProgress={progressByCandidateId[selectedProfile.candidate_id]}
          attendance={attendanceByCandidate[selectedProfile.candidate_id]}
          onClose={() => setSelectedProfile(null)}
          onSave={updateEnrollment
            ? async (id, updates) => { await updateEnrollment(id, updates); setSelectedProfile(null); }
            : null}
        />
      )}
    </div>
  );
}
