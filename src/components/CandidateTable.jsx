import { useState, useMemo } from 'react';

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

export default function CandidateTable({ applications, onSelectCandidate }) {
  const [search, setSearch] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');
  const [filterElegibilidad, setFilterElegibilidad] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const pageSize = 20;

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
    return applications.map(app => {
      const ca = app.custom_answers || {};
      const fases = ca.seguimiento_fases || {};
      const isRejected = fases.elegibilidad === 'rejected';

      // Parse puntajes taking 'N/A' into account
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
        grupo: fases.grupo_asignado || 'Sin asignar',
        elegibilidadStatus: isRejected ? 'No elegible' : 'Elegible',
        isRejected,
        puntajeTecnico: isRejected ? null : pFase2,
        puntajeActitudinal: isRejected ? null : pFase3,
        puntajeTotal: isRejected ? null : (typeof fases.puntaje_total === 'number' ? fases.puntaje_total : null),
        email: app.candidate?.email || '',
      };
    });
  }, [applications]);

  // Filtered & sorted
  const filtered = useMemo(() => {
    let result = enriched;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(a =>
        a.fullName.toLowerCase().includes(s) ||
        a.email.toLowerCase().includes(s)
      );
    }

    if (filterGrupo) result = result.filter(a => a.grupo === filterGrupo);
    if (filterElegibilidad) result = result.filter(a => a.elegibilidadStatus === filterElegibilidad);

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
  }, [enriched, search, filterGrupo, filterElegibilidad, sortField, sortDir]);

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
    if (app.isRejected) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

    const g = app.grupo || '';
    let label = g;
    let sub = '';

    if (g === 'Senior') {
      label = 'Senior';
      sub = 'Avanza por puntaje técnico';
    } else if (g === 'Grupo de respaldo') {
      label = 'Grupo de respaldo';
    } else if (g === 'Pasan a entrevistas') {
      label = 'Pasan a entrevistas';
      sub = app.puntajeActitudinal > 0 ? `Puntaje: ${app.puntajeActitudinal}` : '';
    }

    return (
      <div style={{ textAlign: 'right' }}>
        <span className={`badge ${getGrupoBadgeClass(g)}`}>
          {label}
        </span>
        {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
      </div>
    );
  };

  return (
    <div>
      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-search">
          <span className="filter-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
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
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className={sortField === 'name' ? 'sorted' : ''} onClick={() => handleSort('name')} style={{ width: '22%' }}>
                Candidato <SortIcon field="name" />
              </th>
              <th className={sortField === 'elegibilidad' ? 'sorted' : ''} onClick={() => handleSort('elegibilidad')}>
                Fase 1: Elegibilidad <SortIcon field="elegibilidad" />
              </th>
              <th className={sortField === 'tecnico' ? 'sorted' : ''} onClick={() => handleSort('tecnico')} style={{ width: '13%' }}>
                Fase 2: Prueba Técnica <SortIcon field="tecnico" />
              </th>
              <th className={sortField === 'actitudinal' ? 'sorted' : ''} onClick={() => handleSort('actitudinal')} style={{ width: '18%' }}>
                Fase 3: Formulario Actitudinal <SortIcon field="actitudinal" />
              </th>
              <th className={sortField === 'grupo' ? 'sorted' : ''} onClick={() => handleSort('grupo')} style={{ textAlign: 'right', width: '20%' }}>
                Fase 4: Asignación Final <SortIcon field="grupo" />
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(app => (
              <tr key={app.id} onClick={() => onSelectCandidate(app)} className={app.isRejected ? 'rejected-row' : ''}>
                <td>
                  <div className="table-name">{app.fullName}</div>
                  <div className="table-sub">{app.email}</div>
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
