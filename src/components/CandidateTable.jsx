import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function getScoreColor(score, max) {
  const pct = score / max;
  if (pct >= 0.7) return '#10b981';
  if (pct >= 0.4) return '#f59e0b';
  return '#f43f5e';
}

function getGrupoBadgeClass(grupo) {
  const g = (grupo || '').toLowerCase();
  if (g === 'senior') return 'badge-senior';
  if (g.includes('entrevista') || g === 'pasan a entrevistas') return 'badge-entrevista';
  if (g.includes('respaldo')) return 'badge-entrevista'; // yellow-ish
  if (g.includes('no') || g === 'no elegido' || g === 'no seleccionado' || g === 'no aplica') return 'badge-no-seleccionado';
  return 'badge-sin-asignar';
}

export default function CandidateTable({ applications, enrollments, onSelectCandidate }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterElegibilidad, setFilterElegibilidad] = useState('');
  const [filterFase2, setFilterFase2] = useState(false);
  const [filterFase3, setFilterFase3] = useState(false);
  const [filterCuidador, setFilterCuidador] = useState(false);
  const [filterEnrolled, setFilterEnrolled] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Sync state from dashboard navigation
  useEffect(() => {
    if (location.state) {
      if (location.state.filterElegibilidad !== undefined) setFilterElegibilidad(location.state.filterElegibilidad);
      if (location.state.requireFase2 !== undefined) setFilterFase2(location.state.requireFase2);
      if (location.state.requireFase3 !== undefined) setFilterFase3(location.state.requireFase3);
      if (location.state.filterCuidador !== undefined) setFilterCuidador(location.state.filterCuidador);
      if (location.state.filterEnrolled !== undefined) setFilterEnrolled(location.state.filterEnrolled);
      setPage(1);
    }
  }, [location.state]);

  const handleClearFilters = () => {
    setSearch('');
    setFilterGrupo('');
    setFilterElegibilidad('');
    setFilterFase2(false);
    setFilterFase3(false);
    setFilterCuidador(false);
    setFilterEnrolled('');
    setPage(1);
    navigate(location.pathname, { replace: true, state: {} });
  };

  // Extract filter options
  const filterOptions = useMemo(() => {
    const grupos = new Set();
    applications.forEach(app => {
      const ca = app.custom_answers || {};
      const fases = ca.seguimiento_fases || {};
      grupos.add(fases.grupo_asignado || 'Sin asignar');
    });

    return {
      grupos: [...grupos].sort(),
      elegibilidades: ['Elegible', 'No elegible']
    };
  }, [applications]);

  // Enriched data
  const enriched = useMemo(() => {
    const enrolledSet = new Set(
      (enrollments || [])
        .filter(e => e.custom_form_data?.estado_activo === true)
        .map(e => e.candidate?.id)
        .filter(Boolean)
    );

    return applications.map(app => {
      const ca = app.custom_answers || {};
      const fases = ca.seguimiento_fases || {};
      const isRejected = fases.elegibilidad === 'rejected';

      const pFase2 = (typeof fases.puntaje_tecnico === 'number') ? fases.puntaje_tecnico : null;
      let pFase3 = null;
      if (typeof fases.puntaje_entrevista === 'number') {
        pFase3 = fases.puntaje_entrevista;
      } else if (fases.puntaje_entrevista === '0' || fases.puntaje_entrevista === 0) {
        pFase3 = 0;
      }

      return {
        ...app,
        fullName: `${app.candidate?.first_name || ''} ${app.candidate?.last_name || ''}`.trim(),
        documentNumber: app.candidate?.document_number || '',
        grupo: fases.grupo_asignado || 'Sin asignar',
        elegibilidadStatus: isRejected ? 'No elegible' : 'Elegible',
        isRejected,
        puntajeTecnico: isRejected ? null : pFase2,
        puntajeActitudinal: isRejected ? null : pFase3,
        puntajeTotal: isRejected ? null : (typeof fases.puntaje_total === 'number' ? fases.puntaje_total : null),
        email: app.candidate?.email || '',
        esCuidador: ca.es_cuidador === true,
        isFinalSelected: enrolledSet.has(app.candidate?.id),
      };
    });
  }, [applications, enrollments]);

  // Filtered & sorted
  const filtered = useMemo(() => {
    let result = enriched;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(a =>
        a.fullName.toLowerCase().includes(s) ||
        a.email.toLowerCase().includes(s) ||
        a.documentNumber.includes(s)
      );
    }

    if (filterGrupo) result = result.filter(a => a.grupo === filterGrupo);
    if (filterElegibilidad) result = result.filter(a => a.elegibilidadStatus === filterElegibilidad);
    if (filterFase2) result = result.filter(a => a.puntajeTecnico !== null && a.puntajeTecnico > 0);
    if (filterFase3) result = result.filter(a => a.puntajeActitudinal !== null && a.puntajeActitudinal > 0);
    if (filterCuidador) result = result.filter(a => a.esCuidador);
    if (filterEnrolled === 'yes') result = result.filter(a => a.isFinalSelected);
    if (filterEnrolled === 'no') result = result.filter(a => !a.isFinalSelected);

    // Sort
    result.sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'name': valA = a.fullName; valB = b.fullName; break;
        case 'elegibilidad': valA = a.elegibilidadStatus; valB = b.elegibilidadStatus; break;
        case 'tecnico': valA = a.puntajeTecnico || 0; valB = b.puntajeTecnico || 0; break;
        case 'actitudinal': valA = a.puntajeActitudinal || -1; valB = b.puntajeActitudinal || -1; break;
        case 'total': valA = a.puntajeTotal || 0; valB = b.puntajeTotal || 0; break;
        case 'grupo': valA = a.grupo; valB = b.grupo; break;
        default: valA = a.fullName; valB = b.fullName;
      }

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB, 'es');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [enriched, search, filterGrupo, filterElegibilidad, filterFase2, filterFase3, filterCuidador, filterEnrolled, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Render Phase 3 (Formulario Actitudinal)
  const renderFaseActitudinal = (app) => {
    if (app.isRejected) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    
    if (app.puntajeActitudinal === null) {
      return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No avanzó</span>;
    }
    if (app.puntajeActitudinal === 0) {
      return <span style={{ color: '#f43f5e', fontSize: '13px', fontWeight: '500' }}>No diligenció</span>;
    }

    return (
      <div className="score-bar-container">
        <div className="score-bar">
          <div
            className="score-bar-fill"
            style={{
              width: `${(app.puntajeActitudinal / 17) * 100}%`,
              background: getScoreColor(app.puntajeActitudinal, 17),
            }}
          />
        </div>
        <span className="score-value">{app.puntajeActitudinal}</span>
      </div>
    );
  };

  // Render Phase 4 (Assignment Rules)
  const renderAssignment = (app) => {
    if (app.isRejected) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>;

    const g = app.grupo || '';
    let label = g;
    let sub = '';

    if (g === 'Senior') {
      label = 'Avanza por puntaje técnico';
    } else if (g === 'Grupo de respaldo') {
      label = 'Grupo de respaldo';
    } else if (g === 'Pasan a entrevistas') {
      label = 'Pasan a entrevistas';
      sub = app.puntajeActitudinal > 0 ? `Puntaje: ${app.puntajeActitudinal}` : '';
    }

    return (
      <div style={{ textAlign: 'center' }}>
        <span className={`badge ${getGrupoBadgeClass(g)}`}>
          {label}
        </span>
        {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px auto 0' }}>{sub}</div>}
      </div>
    );
  };

  return (
    <div>
      {/* Filters */}
      <div className="filters-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="filter-search" style={{ flex: '1', minWidth: '250px' }}>
          <span className="filter-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre, email o cédula..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="filter-select" value={filterElegibilidad} onChange={e => { setFilterElegibilidad(e.target.value); setPage(1); }}>
          <option value="">Fase 1: Elegibilidad (Todos)</option>
          {filterOptions.elegibilidades.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="filter-select" value={filterGrupo} onChange={e => { setFilterGrupo(e.target.value); setPage(1); }}>
          <option value="">Fase 4: Asignación Final (Todos)</option>
          {filterOptions.grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        
        {/* Ad hoc filter indicators */}
        {(filterFase2 || filterFase3 || filterCuidador || filterEnrolled) && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--accent-teal)', flexWrap: 'wrap' }}>
            {filterFase2 && <span>✅ Evaluados</span>}
            {filterFase3 && <span>✅ Formulario Actitudinal</span>}
            {filterCuidador && <span>🤲 Cuidadores</span>}
            {filterEnrolled === 'yes' && <span>⭐ Selección Final</span>}
            {filterEnrolled === 'no' && <span>↩ No en Selección Final</span>}
          </div>
        )}

        <button 
          className="btn btn-secondary btn-sm" 
          onClick={handleClearFilters}
          style={{ width: 'auto', padding: '8px 16px', marginLeft: 'auto' }}
        >
          Limpiar Filtros
        </button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className={sortField === 'name' ? 'sorted' : ''} onClick={() => handleSort('name')} style={{ width: '20%' }}>
                Candidato <SortIcon field="name" />
              </th>
              <th className={sortField === 'elegibilidad' ? 'sorted' : ''} onClick={() => handleSort('elegibilidad')}>
                Fase 1: Elegibilidad <SortIcon field="elegibilidad" />
              </th>
              <th className={sortField === 'tecnico' ? 'sorted' : ''} onClick={() => handleSort('tecnico')} style={{ width: '12%' }}>
                Fase 2: Técnica <SortIcon field="tecnico" />
              </th>
              <th className={sortField === 'actitudinal' ? 'sorted' : ''} onClick={() => handleSort('actitudinal')} style={{ width: '15%' }}>
                Fase 3: Actitudinal <SortIcon field="actitudinal" />
              </th>
              <th className={sortField === 'grupo' ? 'sorted' : ''} onClick={() => handleSort('grupo')} style={{ width: '17%' }}>
                Fase 4: Asignación <SortIcon field="grupo" />
              </th>
              <th style={{ width: '13%', textAlign: 'center' }}>
                Selección Final
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(app => (
              <tr key={app.id} onClick={() => onSelectCandidate(app)} className={app.isRejected ? 'rejected-row' : ''}>
                <td>
                  <div className="table-name">{app.fullName}</div>
                  <div className="table-sub">{app.email}</div>
                  {app.esCuidador && (
                    <div style={{ fontSize: '10px', color: '#0d9488', marginTop: 2, fontWeight: 600 }}>🤲 Cuidador/a</div>
                  )}
                </td>
                <td>
                  <span className={`badge ${app.isRejected ? 'badge-rechazado' : 'badge-pendiente'}`} style={{ backgroundColor: app.isRejected ? '#f43f5e20' : '#10b98120', color: app.isRejected ? '#f43f5e' : '#10b981' }}>
                    {app.elegibilidadStatus}
                  </span>
                </td>
                <td>
                  {app.isRejected ? (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  ) : app.puntajeTecnico !== null ? (
                    <div className="score-bar-container">
                      <div className="score-bar">
                        <div
                          className="score-bar-fill"
                          style={{
                            width: `${(app.puntajeTecnico / 15) * 100}%`,
                            background: getScoreColor(app.puntajeTecnico, 15),
                          }}
                        />
                      </div>
                      <span className="score-value">{app.puntajeTecnico}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td>
                  {renderFaseActitudinal(app)}
                </td>
                <td>
                  {renderAssignment(app)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {app.isFinalSelected
                    ? <span className="badge" style={{ backgroundColor: '#0d948820', color: '#0d9488', fontWeight: 700 }}>⭐ Inscrito</span>
                    : <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div className="pagination-info">
          Mostrando {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} candidatos
        </div>
        <div className="pagination-buttons">
          <button className="pagination-btn" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
            ← Anterior
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let p = page <= 3 ? i + 1 : page - 2 + i;
            if (p > totalPages) p = totalPages - 4 + i;
            if (p < 1) p = 1;
            
            return (
              <button
                key={i}
                className={`pagination-btn${p === page ? ' active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            );
          })}
          <button className="pagination-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
