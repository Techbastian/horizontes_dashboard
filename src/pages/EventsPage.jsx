import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  monthRangeUtcIso,
  overlapsBogotaDay,
  formatBogotaRange,
  isoToBogotaTime,
  isoToBogotaDate,
} from '../lib/bogotaTime';
import EventEditorModal from '../components/EventEditorModal';
import EventAttendanceModal from '../components/EventAttendanceModal';
import {
  gruposDe,
  GRUPO_CLASS,
  tipoLabel,
  attendanceTipo,
  PROGRAMA_HS,
  PROGRAMA_CIRCULOS,
} from '../lib/eventos';

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateKeyFromParts(y, monthIndex, dom) {
  return `${y}-${pad(monthIndex + 1)}-${pad(dom)}`;
}

function buildCalendarCells(viewYear, viewMonth0) {
  const first = new Date(viewYear, viewMonth0, 1);
  const last = new Date(viewYear, viewMonth0 + 1, 0);
  const padStart = (first.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < padStart; i++) {
    const d = new Date(viewYear, viewMonth0, -padStart + 1 + i);
    cells.push({
      dateKey: dateKeyFromParts(d.getFullYear(), d.getMonth(), d.getDate()),
      inMonth: false,
      dom: d.getDate(),
    });
  }
  for (let dom = 1; dom <= last.getDate(); dom++) {
    cells.push({
      dateKey: dateKeyFromParts(viewYear, viewMonth0, dom),
      inMonth: true,
      dom,
    });
  }
  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1];
    const [y2, m2, d2] = lastCell.dateKey.split('-').map(Number);
    const nx = new Date(y2, m2 - 1, d2 + 1);
    cells.push({
      dateKey: dateKeyFromParts(nx.getFullYear(), nx.getMonth(), nx.getDate()),
      inMonth: false,
      dom: nx.getDate(),
    });
  }
  return cells;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function EventsPage({ cohort }) {
  const [cursor, setCursor] = useState(() => new Date());
  const viewYear = cursor.getFullYear();
  const viewMonth0 = cursor.getMonth();

  // El calendario aloja los dos programas. `cohort` (Horizontes Senior) llega por
  // props y es la selección inicial; la lista completa se trae aquí porque esta
  // página ya consulta Supabase directo (ver CLAUDE.md, excepción documentada).
  const [cohortes, setCohortes] = useState([]);
  const [selectedCohortId, setSelectedCohortId] = useState(cohort?.id || null);
  const cohortId = selectedCohortId || cohort?.id;

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grupoFilter, setGrupoFilter] = useState('Todos');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      // `!inner` + filtro sobre el embed acota a los dos programas de este
      // dashboard. Hoy son las únicas 2 cohortes de la base, pero es compartida
      // con otros módulos (bolsa, aliados…): sin el filtro, el día que alguno
      // cree su cohorte aparecería en este selector.
      const { data, error: err } = await supabase
        .from('cohorts')
        .select('id, name, program:projects!inner(slug, name)')
        .in('program.slug', [PROGRAMA_HS, PROGRAMA_CIRCULOS])
        .order('created_at', { ascending: true });
      if (cancelado) return;
      if (err) {
        // Sin la lista el calendario sigue sirviendo para Horizontes Senior.
        console.warn('No se pudo cargar la lista de cohortes:', err.message);
        return;
      }
      setCohortes(data || []);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const cohorteActual = cohortes.find((c) => c.id === cohortId);
  const programa = cohorteActual?.program?.slug || PROGRAMA_HS;
  const grupos = useMemo(() => gruposDe(programa), [programa]);

  // Al cambiar de programa cambia el vocabulario de grupos: un filtro "Junior"
  // heredado dejaría el calendario de Círculos vacío sin explicación.
  useEffect(() => {
    setGrupoFilter('Todos');
  }, [programa]);

  const [selectedDayKey, setSelectedDayKey] = useState(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [attendanceEvent, setAttendanceEvent] = useState(null);

  const calendarCells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth0),
    [viewYear, viewMonth0]
  );

  const loadEvents = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = monthRangeUtcIso(viewYear, viewMonth0);
      const { data, error: err } = await supabase
        .from('eventos')
        .select('*')
        .eq('cohort_id', cohortId)
        .gte('fecha_hora_fin', start)
        .lte('fecha_hora_inicio', end)
        .order('fecha_hora_inicio', { ascending: true });

      if (err) throw err;
      setEvents(data || []);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los eventos.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, viewYear, viewMonth0]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const todayKey = isoToBogotaDate(new Date().toISOString());

  // Al filtrar por un grupo concreto se incluyen también los eventos
  // "Compartido" (aplican a todos los grupos). "Compartido" solo muestra esos.
  const matchesGrupo = useCallback(
    (ev) => {
      if (grupoFilter === 'Todos') return true;
      if (ev.grupo === grupoFilter) return true;
      return grupoFilter !== 'Compartido' && ev.grupo === 'Compartido';
    },
    [grupoFilter]
  );

  const filteredEvents = useMemo(() => events.filter(matchesGrupo), [events, matchesGrupo]);

  // Grupos con evento en cada día → un punto de color por grupo.
  const gruposByDay = useMemo(() => {
    const uniq = [...new Set(calendarCells.map((c) => c.dateKey))];
    const map = {};
    for (const dk of uniq) {
      const grupos = new Set();
      for (const ev of filteredEvents) {
        if (overlapsBogotaDay(ev.fecha_hora_inicio, ev.fecha_hora_fin, dk)) {
          grupos.add(ev.grupo || 'Compartido');
        }
      }
      map[dk] = [...grupos];
    }
    return map;
  }, [calendarCells, filteredEvents]);

  const eventsForSelectedDay = useMemo(() => {
    if (!selectedDayKey) return [];
    return filteredEvents
      .filter((ev) => overlapsBogotaDay(ev.fecha_hora_inicio, ev.fecha_hora_fin, selectedDayKey))
      .sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio));
  }, [filteredEvents, selectedDayKey]);

  const monthTitle = cursor.toLocaleString('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });

  if (!cohortId) {
    return (
      <div className="animate-in">
        <div className="page-header">
          <h1>Eventos</h1>
          <p>No hay cohorte activa para asociar eventos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Eventos</h1>
          <p>
            Calendario operativo por cohorte. Pulsa un día para ver, crear, editar o eliminar
            eventos (zona America/Bogota).
          </p>
        </div>
        {cohortes.length > 1 && (
          <div className="page-header-actions">
            <select
              className="filter-select"
              value={cohortId || ''}
              onChange={(e) => {
                setSelectedCohortId(e.target.value);
                setSelectedDayKey(null);
              }}
              aria-label="Programa y cohorte"
            >
              {cohortes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.program?.name} — {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="events-calendar-wrap">
        <div className="events-calendar-toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setCursor(new Date(viewYear, viewMonth0 - 1, 1))
            }
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <h2 className="events-calendar-month-title">{monthTitle}</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setCursor(new Date(viewYear, viewMonth0 + 1, 1))
            }
            aria-label="Mes siguiente"
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-primary events-calendar-today-btn"
            onClick={() => setCursor(new Date())}
          >
            Hoy
          </button>
        </div>

        <div className="events-group-filters">
          {['Todos', ...grupos].map((g) => (
            <button
              key={g}
              type="button"
              className={`events-group-chip${
                g !== 'Todos' ? ` ${GRUPO_CLASS[g]}` : ''
              }${grupoFilter === g ? ' is-active' : ''}`}
              onClick={() => setGrupoFilter(g)}
            >
              {g !== 'Todos' && <span className="events-group-chip-dot" />}
              {g}
            </button>
          ))}
        </div>

        {error && (
          <div className="error-message" style={{ marginBottom: 16 }}>
            {error}{' '}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadEvents()}>
              Reintentar
            </button>
          </div>
        )}

        <div className={`events-calendar ${loading ? 'events-calendar-loading' : ''}`}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="events-calendar-weekday">
              {w}
            </div>
          ))}
          {calendarCells.map((cell) => (
            <button
              key={`${cell.dateKey}-${cell.inMonth}-${cell.dom}`}
              type="button"
              className={`events-calendar-day${cell.inMonth ? '' : ' events-calendar-day-muted'}${
                cell.dateKey === todayKey ? ' events-calendar-day-today' : ''
              }`}
              onClick={() => setSelectedDayKey(cell.dateKey)}
            >
              <span className="events-calendar-dom">{cell.dom}</span>
              {(gruposByDay[cell.dateKey]?.length || 0) > 0 && (
                <span className="events-calendar-dots">
                  {gruposByDay[cell.dateKey].map((g) => (
                    <span
                      key={g}
                      className={`events-calendar-dot ${GRUPO_CLASS[g] || 'grp-compartido'}`}
                      title={g}
                    />
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedDayKey && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1050 }}
          role="presentation"
          onClick={() => {
            setSelectedDayKey(null);
          }}
        >
          <div
            className="modal-content events-day-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="events-day-modal-title"
          >
            <div className="modal-header">
              <div className="modal-header-info">
                <div className="modal-avatar">📅</div>
                <div>
                  <div id="events-day-modal-title" className="modal-name">
                    {new Date(`${selectedDayKey}T12:00:00-05:00`).toLocaleDateString('es-CO', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'America/Bogota',
                    })}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {eventsForSelectedDay.length} evento
                    {eventsForSelectedDay.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedDayKey(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body events-day-modal-body">
              <div className="events-day-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingEvent(null);
                    setEditorOpen(true);
                  }}
                >
                  + Nuevo evento
                </button>
              </div>

              {eventsForSelectedDay.length === 0 ? (
                <p className="events-day-empty">
                  No hay eventos este día. Crea uno con el botón anterior.
                </p>
              ) : (
                <ul className="events-day-list">
                  {eventsForSelectedDay.map((ev) => (
                    <li key={ev.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="events-day-item"
                        onClick={() => {
                          setEditingEvent(ev);
                          setEditorOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setEditingEvent(ev);
                            setEditorOpen(true);
                          }
                        }}
                      >
                        <span className="events-day-item-title">{ev.nombre}</span>
                        {(ev.grupo || ev.codigo || (ev.tipo && ev.tipo.length > 0)) && (
                          <span className="events-day-item-badges">
                            {ev.grupo && (
                              <span
                                className={`events-badge events-badge-grupo ${
                                  GRUPO_CLASS[ev.grupo] || 'grp-compartido'
                                }`}
                              >
                                {ev.grupo}
                              </span>
                            )}
                            {ev.codigo && (
                              <span className="events-badge events-badge-codigo">{ev.codigo}</span>
                            )}
                            {(ev.tipo || []).map((t) => (
                              <span key={t} className="events-badge events-badge-tipo">
                                {tipoLabel(t)}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="events-day-item-meta">
                          {isoToBogotaDate(ev.fecha_hora_inicio) ===
                          isoToBogotaDate(ev.fecha_hora_fin)
                            ? `${isoToBogotaTime(ev.fecha_hora_inicio)} – ${isoToBogotaTime(ev.fecha_hora_fin)}`
                            : formatBogotaRange(ev.fecha_hora_inicio, ev.fecha_hora_fin)}
                        </span>
                        {ev.descripcion && (
                          <span className="events-day-item-desc">{ev.descripcion}</span>
                        )}
                        <div className="events-day-item-actions">
                          {attendanceTipo(ev) && (
                            <button
                              type="button"
                              className="events-day-item-attendance"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAttendanceEvent(ev);
                              }}
                            >
                              Tomar asistencia
                            </button>
                          )}
                          {ev.evidencia_url && (
                            <button
                              type="button"
                              className="events-day-item-evidence"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(ev.evidencia_url, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Abrir evidencia
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <EventEditorModal
          cohortId={cohortId}
          programa={programa}
          selectedDateKey={selectedDayKey}
          event={editingEvent}
          onClose={() => {
            setEditorOpen(false);
            setEditingEvent(null);
          }}
          onSaved={() => loadEvents()}
          onDeleted={() => loadEvents()}
        />
      )}

      {attendanceEvent && (
        <EventAttendanceModal
          cohortId={cohortId}
          programa={programa}
          event={attendanceEvent}
          onClose={() => setAttendanceEvent(null)}
        />
      )}
    </div>
  );
}
