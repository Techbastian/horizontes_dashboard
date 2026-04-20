import { useState, useMemo } from 'react';

export default function FormationPage({ enrollments = [], applications = [] }) {
  const [activeTab, setActiveTab] = useState('Senior');
  const [search, setSearch] = useState('');

  // Extract profiles
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
        isActive: custom.estado_activo !== false
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
        const doc = c.document_number || 'S/N';
        
        return {
          id: app.id,
          candidate_id: c.id,
          status: app.status,
          fullName,
          doc,
          ruta: 'Reemplazo',
          email: c.email || '',
          phone: c.phone || '',
          city: c.city || 'Desconocido',
          isActive: c.is_active !== false
        };
      });

    const enrolledCandidateIds = new Set(enrolledProfiles.map(p => p.candidate_id));
    const uniqueReemplazos = reemplazoProfiles.filter(p => !enrolledCandidateIds.has(p.candidate_id));

    return [...enrolledProfiles, ...uniqueReemplazos];
  }, [enrollments, applications]);

  const stats = useMemo(() => {
    return {
      total: profiles.length,
      senior: profiles.filter(p => p.ruta === 'Senior').length,
      junior: profiles.filter(p => p.ruta === 'Junior').length,
      reemplazo: profiles.filter(p => p.ruta === 'Reemplazo' || p.ruta.toLowerCase().includes('respaldo')).length,
    };
  }, [profiles]);

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

  return (
    <div className="animate-in">
      {/* Header */}
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

      {/* Main Content */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', gap: '24px' }}>
          <button 
            className={`nav-item ${activeTab === 'Senior' ? 'active' : ''}`}
            onClick={() => setActiveTab('Senior')}
            style={{ padding: '12px 16px', background: 'transparent', borderBottom: activeTab === 'Senior' ? '2px solid var(--accent-teal)' : 'none', borderRadius: 0, fontWeight: activeTab === 'Senior' ? '700' : '500', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            Ruta Senior <span style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>{stats.senior}</span>
          </button>
          
          <button 
            className={`nav-item ${activeTab === 'Junior' ? 'active' : ''}`}
            onClick={() => setActiveTab('Junior')}
            style={{ padding: '12px 16px', background: 'transparent', borderBottom: activeTab === 'Junior' ? '2px solid var(--accent-violet)' : 'none', borderRadius: 0, fontWeight: activeTab === 'Junior' ? '700' : '500', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            Ruta Junior <span style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>{stats.junior}</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'Reemplazo' ? 'active' : ''}`}
            onClick={() => setActiveTab('Reemplazo')}
            style={{ padding: '12px 16px', background: 'transparent', borderBottom: activeTab === 'Reemplazo' ? '2px solid #f59e0b' : 'none', borderRadius: 0, fontWeight: activeTab === 'Reemplazo' ? '700' : '500', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            Lista de Reemplazo <span style={{ background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>{stats.reemplazo}</span>
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="filter-search" style={{ minWidth: '300px' }}>
            <span className="filter-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar participante por cédula o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 38px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            />
          </div>
          <button className="btn btn-secondary">
            ⬇️ Descargar Listado {activeTab}
          </button>
        </div>

        {/* Table layout copied from index.css standards */}
        <div className="table-container" style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table" style={{ width: '100%', borderSpacing: '12px 6px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '14px 16px', background: 'rgba(148, 163, 184, 0.08)' }}>Participante</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148, 163, 184, 0.08)' }}>Documento</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148, 163, 184, 0.08)' }}>Contacto</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148, 163, 184, 0.08)' }}>Municipio</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', background: 'rgba(148, 163, 184, 0.08)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ background: 'rgba(148, 163, 184, 0.04)', padding: '16px', textAlign: 'left', borderRadius: '4px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.fullName}</div>
                  </td>
                  <td style={{ background: 'rgba(148, 163, 184, 0.04)', padding: '16px', textAlign: 'center', borderRadius: '4px' }}>
                    {p.doc}
                  </td>
                  <td style={{ background: 'rgba(148, 163, 184, 0.04)', padding: '16px', textAlign: 'center', borderRadius: '4px' }}>
                    <div style={{ color: 'var(--text-primary)' }}>{p.phone || 'S/N'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.email}</div>
                  </td>
                  <td style={{ background: 'rgba(148, 163, 184, 0.04)', padding: '16px', textAlign: 'center', borderRadius: '4px' }}>
                    {p.city}
                  </td>
                  <td style={{ background: 'rgba(148, 163, 184, 0.04)', padding: '16px', textAlign: 'center', borderRadius: '4px' }}>
                    {p.isActive ? (
                      <span className="badge badge-approved" style={{ background: 'var(--accent-emerald-dim)', color: 'var(--accent-emerald)' }}>Activo</span>
                    ) : (
                      <span className="badge badge-rejected" style={{ background: 'var(--accent-rose-dim)', color: 'var(--accent-rose)' }}>Inactivo</span>
                    )}
                  </td>
                </tr>
              ))}
              
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No hay participantes encontrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
