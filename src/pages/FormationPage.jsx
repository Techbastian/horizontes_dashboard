import { useState, useMemo } from 'react';
import ParticipantDetailModal from '../components/ParticipantDetailModal';

function progressColor(pct) {
  if (pct >= 75) return '#10b981';
  if (pct >= 40) return '#f97316';
  return '#ef4444';
}

function MiniProgressBar({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: '#475569', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, background: '#1e293b', borderRadius: 99, height: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%',
          background: progressColor(pct), borderRadius: 99,
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(pct), minWidth: 34 }}>{pct}%</span>
    </div>
  );
}

export default function FormationPage({ enrollments = [], applications = [], formationProgress, updateEnrollment }) {
  const [activeTab, setActiveTab] = useState('Senior');
  const [search, setSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);

  // Build a map: candidate_id → courseProgress
  const progressByCandidateId = useMemo(() => {
    if (!formationProgress) return {};
    const map = {};
    formationProgress.participants.forEach(p => { map[p.candidateId] = p; });
    return map;
  }, [formationProgress]);

  const profiles = useMemo(() => {
    const enrolledProfiles = enrollments.map(enr => {
      const c = enr.candidate || {};
      const custom = enr.custom_form_data || {};
      const ruta = custom.ruta_asignada || 'Sin asignar';
      const fullName = custom.nombre_completo || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Desconocido';
      const doc = custom.cedula || c.document_number || 'S/N';
      return {
        id: enr.id,
        candidate_id: c.id,
        status: enr.status,
        fullName,
        doc,
        ruta,
        email: c.email || '',
        phone: c.phone || '',
        city: c.city || 'Desconocido',
        isActive: custom.estado_activo !== false,
        isEnrollment: true,
      };
    });

    const reemplazoProfiles = applications
      .filter(app => {
        const fases = app?.custom_answers?.seguimiento_fases || {};
        return fases.grupo_asignado === 'Reemplazo' || fases.grupo_asignado?.toLowerCase().includes('respaldo');
      })
      .map(app => {
        const c = app.candidate || {};
        const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Desconocido';
        return {
          id: app.id,
          candidate_id: c.id,
          status: app.status,
          fullName,
          doc: c.document_number || 'S/N',
          ruta: 'Reemplazo',
          email: c.email || '',
          phone: c.phone || '',
          city: c.city || 'Desconocido',
          isActive: c.is_active !== false,
          isEnrollment: false,
        };
      });

    const enrolledIds = new Set(enrolledProfiles.map(p => p.candidate_id));
    return [...enrolledProfiles, ...reemplazoProfiles.filter(p => !enrolledIds.has(p.candidate_id))];
  }, [enrollments, applications]);

  const stats = useMemo(() => ({
    total: profiles.length,
    senior: profiles.filter(p => p.ruta === 'Senior').length,
    junior: profiles.filter(p => p.ruta === 'Junior').length,
    reemplazo: profiles.filter(p => p.ruta === 'Reemplazo' || p.ruta.toLowerCase().includes('respaldo')).length,
  }), [profiles]);

  const filtered = useMemo(() => {
    const list = profiles.filter(p =>
      activeTab === 'Reemplazo'
        ? (p.ruta === 'Reemplazo' || p.ruta.toLowerCase().includes('respaldo'))
        : p.ruta === activeTab
    );
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(p =>
      p.fullName.toLowerCase().includes(s) ||
      String(p.doc).includes(s) ||
      p.email.toLowerCase().includes(s)
    );
  }, [profiles, activeTab, search]);

  const tabColors = { Senior: 'var(--accent-teal)', Junior: 'var(--accent-violet)', Reemplazo: '#f59e0b' };

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div className="page-header-left">
          <h1>Cohorte de Formación</h1>
          <p>Gestión de los {stats.total} participantes matriculados en el programa técnico.</p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '32px' }}>
        <div className="kpi-card" style={{ animationDelay: '0s' }}>
          <div className="kpi-label"><span className="kpi-label-icon">🎓</span>Total Matriculados</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-label"><span className="kpi-label-icon">⭐</span>Ruta Senior</div>
          <div className="kpi-value">{stats.senior}</div>
          <div className="kpi-change positive">Participantes confirmados</div>
        </div>
        <div className="kpi-card" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-label"><span className="kpi-label-icon">🌱</span>Ruta Junior</div>
          <div className="kpi-value">{stats.junior}</div>
          <div className="kpi-change neutral">Participantes confirmados</div>
        </div>
        <div className="kpi-card" style={{ animationDelay: '0.3s' }}>
          <div className="kpi-label"><span className="kpi-label-icon">🔄</span>Lista Reemplazo</div>
          <div className="kpi-value">{stats.reemplazo}</div>
          <div className="kpi-change negative">Participantes en espera</div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', gap: '24px' }}>
          {['Senior', 'Junior', 'Reemplazo'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="nav-item"
              style={{
                padding: '12px 16px', background: 'transparent',
                borderBottom: activeTab === tab ? `2px solid ${tabColors[tab]}` : '2px solid transparent',
                borderRadius: 0,
                fontWeight: activeTab === tab ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 8,
                color: activeTab === tab ? '#f1f5f9' : '#64748b',
              }}
            >
              {tab === 'Senior' ? 'Ruta Senior' : tab === 'Junior' ? 'Ruta Junior' : 'Lista de Reemplazo'}
              <span style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
                {tab === 'Senior' ? stats.senior : tab === 'Junior' ? stats.junior : stats.reemplazo}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="filter-search" style={{ minWidth: 300 }}>
            <span className="filter-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar participante por cédula o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 38px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            />
          </div>
          <span style={{ fontSize: 13, color: '#475569' }}>{filtered.length} participantes</span>
        </div>

        {/* Table */}
        <div className="table-container" style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table" style={{ width: '100%', borderSpacing: '12px 6px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '14px 16px', background: 'rgba(148,163,184,0.08)' }}>Participante</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148,163,184,0.08)' }}>Documento</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148,163,184,0.08)' }}>Contacto</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148,163,184,0.08)' }}>Municipio</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148,163,184,0.08)' }}>Progreso</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148,163,184,0.08)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const cp = progressByCandidateId[p.candidate_id];
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '16px', textAlign: 'left', borderRadius: 4 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.fullName}</div>
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '16px', textAlign: 'center', borderRadius: 4 }}>
                      {p.doc}
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '16px', textAlign: 'center', borderRadius: 4 }}>
                      <div style={{ color: 'var(--text-primary)' }}>{p.phone || 'S/N'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.email}</div>
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '16px', textAlign: 'center', borderRadius: 4 }}>
                      {p.city}
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '16px', textAlign: 'center', borderRadius: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <MiniProgressBar pct={cp?.avgProgress ?? null} />
                      </div>
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '16px', textAlign: 'center', borderRadius: 4 }}>
                      {p.isActive
                        ? <span className="badge badge-approved" style={{ background: 'var(--accent-emerald-dim)', color: 'var(--accent-emerald)' }}>Activo</span>
                        : <span className="badge badge-rejected" style={{ background: 'var(--accent-rose-dim)', color: 'var(--accent-rose)' }}>Inactivo</span>
                      }
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No hay participantes encontrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {selectedProfile && (
        <ParticipantDetailModal
          profile={selectedProfile}
          courseProgress={progressByCandidateId[selectedProfile.candidate_id]}
          onClose={() => setSelectedProfile(null)}
          onSave={selectedProfile.isEnrollment && updateEnrollment
            ? async (id, updates) => { await updateEnrollment(id, updates); setSelectedProfile(null); }
            : null
          }
        />
      )}
    </div>
  );
}
