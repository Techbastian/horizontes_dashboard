import { useState, useMemo } from 'react';

function getGrupoBadgeClass(grupo) {
  const g = (grupo || '').toLowerCase();
  if (g === 'senior') return 'badge-senior';
  if (g.includes('entrevista') || g === 'pasan a entrevistas') return 'badge-entrevista';
  if (g.includes('no') || g === 'no elegido' || g === 'no seleccionado' || g === 'no aplica') return 'badge-no-seleccionado';
  return 'badge-sin-asignar';
}

function getScoreColor(score, max) {
  const pct = score / max;
  if (pct >= 0.7) return '#10b981';
  if (pct >= 0.4) return '#f59e0b';
  return '#f43f5e';
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
    const elegibilidades = new Set(['Elegible', 'Rechazado']);

    applications.forEach(app => {
      const ca = app.custom_answers || {};
      const fases = ca.seguimiento_fases || {};
      grupos.add(fases.grupo_asignado || 'Sin asignar');
    });

    return {
      grupos: [...grupos].sort(),
      elegibilidades: [...elegibilidades]
    };
  }, [applications]);

  // Enriched data
  const enriched = useMemo(() => {
    return applications.map(app => {
      const ca = app.custom_answers || {};
      const fases = ca.seguimiento_fases || {};
      const isRejected = fases.elegibilidad === 'rejected';

      return {
        ...app,
        fullName: `${app.candidate?.first_name || ''} ${app.candidate?.last_name || ''}`.trim(),
        grupo: fases.grupo_asignado || 'Sin asignar',
        // Show Elegible if pending, otherwise Rechazado
        elegibilidadStatus: isRejected ? 'Rechazado' : 'Elegible',
        isRejected,
        // Hide scores if rejected from Phase 1
        puntajeTecnico: isRejected ? null : (typeof fases.puntaje_tecnico === 'number' ? fases.puntaje_tecnico : null),
        puntajeEntrevista: isRejected ? null : (typeof fases.puntaje_entrevista === 'number' ? fases.puntaje_entrevista : null),
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
        case 'puntaje': valA = a.puntajeTecnico || 0; valB = b.puntajeTecnico || 0; break;
        case 'entrevista': valA = a.puntajeEntrevista || 0; valB = b.puntajeEntrevista || 0; break;
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
          <option value="">Todos los grupos asignados</option>
          {filterOptions.grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className={sortField === 'name' ? 'sorted' : ''} onClick={() => handleSort('name')} style={{ width: '25%' }}>
                Candidato <SortIcon field="name" />
              </th>
              <th className={sortField === 'elegibilidad' ? 'sorted' : ''} onClick={() => handleSort('elegibilidad')}>
                Fase 1: Elegibilidad <SortIcon field="elegibilidad" />
              </th>
              <th className={sortField === 'puntaje' ? 'sorted' : ''} onClick={() => handleSort('puntaje')}>
                P. Técnico <SortIcon field="puntaje" />
              </th>
              <th className={sortField === 'entrevista' ? 'sorted' : ''} onClick={() => handleSort('entrevista')}>
                P. Entrevista <SortIcon field="entrevista" />
              </th>
              <th className={sortField === 'total' ? 'sorted' : ''} onClick={() => handleSort('total')}>
                P. Total <SortIcon field="total" />
              </th>
              <th className={sortField === 'grupo' ? 'sorted' : ''} onClick={() => handleSort('grupo')} style={{ textAlign: 'right' }}>
                Grupo Asignado <SortIcon field="grupo" />
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
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
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
                  {app.isRejected ? (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                  ) : app.puntajeEntrevista !== null ? (
                    <div className="score-bar-container">
                      <div className="score-bar">
                        <div
                          className="score-bar-fill"
                          style={{
                            width: `${(app.puntajeEntrevista / 17) * 100}%`,
                            background: getScoreColor(app.puntajeEntrevista, 17),
                          }}
                        />
                      </div>
                      <span className="score-value">{app.puntajeEntrevista}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                  )}
                </td>
                <td>
                  {app.isRejected ? (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                  ) : app.puntajeTotal !== null ? (
                    <span className="score-value">{app.puntajeTotal}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {!app.isRejected && (
                    <span className={`badge ${getGrupoBadgeClass(app.grupo)}`}>
                      {app.grupo}
                    </span>
                  )}
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
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                className={`pagination-btn${p === page ? ' active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 7 && <span style={{ color: 'var(--text-muted)', padding: '0 4px' }}>...</span>}
          <button className="pagination-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
