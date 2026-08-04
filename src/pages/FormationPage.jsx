import { useState, useMemo } from 'react';
import ParticipantDetailModal from '../components/ParticipantDetailModal';
import { fasesDeMatricula, rutaActual } from '../lib/rutas';
import { nombreActividad, etiquetaCorta } from '../lib/asistencia';
import { exportarFormacion, filtrarPerfiles } from '../lib/exportar';
import ExportExcelModal from '../components/ExportExcelModal';
import InformeModal from '../components/InformeModal';
import InformeAsistencia from '../components/InformeAsistencia';


// Cada programa trae sus propios grupos. Horizontes Senior se divide en rutas;
// Círculos de Conocimiento es un grupo único de 263 personas sin subdividir.
const PROGRAMAS = {
  'horizontes-senior': {
    nombre: 'Horizontes Senior',
    grupos: ['Senior', 'Junior', 'Activación'],
    // HS pondera sesiones 35% / cafés 40% / entregables 25%; Círculos solo tiene
    // sesiones, así que su "total" es la asistencia simple y esas columnas sobran.
    columnasExtra: true,
    // Destinos posibles al mover a alguien de grupo. Activación quedó fuera a
    // propósito: es fase histórica, no destino.
    rutas: ['Senior', 'Junior'],
  },
  'circulos-de-conocimiento': {
    nombre: 'Círculos de Conocimiento',
    grupos: ['Círculos'],
    columnasExtra: false,
    // Grupo único: no hay cambio de nivel que registrar, así que el modal
    // muestra el grupo como dato y solo deja editar el estado y el retiro.
    rutas: ['Círculos'],
  },
};

const GROUP_META = {
  Senior:     { color: 'var(--accent-teal)',   solid: '#0d9488', icon: '⭐', label: 'Ruta Senior' },
  Junior:     { color: 'var(--accent-violet)', solid: '#7c3aed', icon: '🌱', label: 'Ruta Junior' },
  'Activación': { color: '#f59e0b',            solid: '#f59e0b', icon: '⚡', label: 'Estrategia de Activación' },
  'Círculos': { color: 'var(--accent-blue)',   solid: '#3b82f6', icon: '🔗', label: 'Círculos de Conocimiento' },
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
      <div style={{ width, background: '#e2e8f0', borderRadius: 99, height: 6, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: progressColor(pct), borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(pct), minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

// Recuadros ✓/✗ por actividad + porcentaje (mismo diseño que el perfil)
function AttendanceCells({ items, pct }) {
  const hasItems = items && items.length > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      {hasItems && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 156 }}>
          {items.map((it, i) => {
            const isEntregable = it.tipo === 'entregable';
            const pending = it.occurred === false;             // aún no ocurre → neutro
            const attended = !pending && it.asistio === true;
            const missed = !pending && it.asistio === false;
            const bg = pending ? '#f1f5f9' : attended ? '#10b98122' : missed ? '#ef444422' : '#e2e8f0';
            const color = pending ? '#cbd5e1' : attended ? '#10b981' : missed ? '#ef4444' : '#475569';
            // Entregables no tienen fecha: "Entregado" / "Pendiente" (pendiente cuenta 0%, va en rojo).
            const estado = pending ? 'Pendiente'
              : attended ? (isEntregable ? 'Entregado' : 'Asistió')
              : missed ? (isEntregable ? 'Pendiente' : 'No asistió')
              : 'Sin registro';
            return (
              <span key={i} title={`${nombreActividad(it)}${it.fecha ? ' · ' + it.fecha : ''}: ${estado}`}
                style={{ width: 19, height: 19, borderRadius: 4, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {pending ? '·' : attended ? '✓' : missed ? '✗' : '·'}
              </span>
            );
          })}
        </div>
      )}
      <span style={{ fontSize: 12, fontWeight: 700, color: progressColor(pct), minWidth: 30, textAlign: 'right' }}>
        {pct == null ? '—' : `${pct}%`}
      </span>
    </div>
  );
}

// Leyenda de colores de asistencia (mismo esquema que AttendanceCells / AttendanceDots)
function AttendanceLegend() {
  const chip = (bg, color, ch, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{ch}</span>
      <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      {chip('#10b98122', '#10b981', '✓', 'Asistió')}
      {chip('#ef444422', '#ef4444', '✗', 'No asistió')}
      {chip('#f1f5f9', '#cbd5e1', '·', 'Pendiente · aún no ocurre')}
    </div>
  );
}

// Badge que cuenta la historia de la persona (transición de nivel).
// Con historial de rutas manda el historial: es el registro real de por dónde
// pasó. `cambio_nivel` —texto suelto que escribió el ETL legacy— queda de
// respaldo para quien nunca cambió de grupo desde el dashboard.
function HistoryBadge({ profile }) {
  const fases = profile.fases || [];
  if (fases.length > 1) {
    const previa = fases[fases.length - 2];
    const actual = fases[fases.length - 1];
    const meta = GROUP_META[previa.ruta] || {};
    const desde = actual.desde ? ` desde el ${actual.desde.slice(8, 10)}/${actual.desde.slice(5, 7)}` : '';
    return (
      <span title={actual.motivo || `${previa.ruta} → ${actual.ruta}${desde}`} style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
        background: `${meta.solid || '#64748b'}22`, color: meta.solid || '#64748b', whiteSpace: 'nowrap',
      }}>{meta.icon || '↪'} {previa.ruta} → {actual.ruta}</span>
    );
  }

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

// Fecha dd/mm a partir de ISO
function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Mini-gráfico de asistencia por actividad (sesiones o cafés), con fecha visible
function AttendanceBarChart({ title, items, kind }) {
  if (!items || !items.length) return null;
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130, paddingTop: 8 }}>
        {items.map((s, i) => {
          const pending = s.occurred === false;
          const fecha = fechaCorta(s.fecha);
          // En el eje solo caben unos pocos caracteres: los nombres largos del
          // calendario ("Café de Conocimiento No. 3") se compactan a "C3", y de
          // ahí se reexpanden a "Café 3" para que todas las barras se lean igual
          // vengan del Excel ("Cafe 1") o del calendario.
          const corta = etiquetaCorta(s);
          const label = kind === 'cafe'
            ? (/^C\d+$/.test(corta) ? `Café ${corta.slice(1)}` : corta || `C${i + 1}`)
            : fecha || corta || `S${i + 1}`;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: pending ? '#475569' : progressColor(s.pct) }}>{pending ? '—' : `${s.pct}%`}</span>
              <div style={{ width: '100%', maxWidth: 46, background: '#e2e8f0', borderRadius: 6, height: '100%', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: pending ? '6px' : `${s.pct}%`, background: pending ? '#cbd5e1' : progressColor(s.pct), borderRadius: 6, transition: 'height 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', fontWeight: kind === 'sesion' ? 600 : 400 }}>{label}</span>
              <span style={{ fontSize: 9, color: '#475569' }}>{pending ? 'Pendiente' : `${s.asistieron}/${s.total}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FormationPage({ enrollments = [], formationProgress, attendanceByCandidate = {}, groupAttendance = {}, asistenciaSinCargar = [], updateEnrollment, circulos }) {
  const [programa, setPrograma] = useState('horizontes-senior');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const cfg = PROGRAMAS[programa];
  // La pestaña elegida se guarda tal cual, pero la que se usa (`activeTab`, más
  // abajo) se valida contra los grupos que de verdad tienen gente.
  const [tabSeleccionada, setActiveTab] = useState(cfg.grupos[0]);

  // Los dos programas exponen las mismas formas (ver src/lib/asistencia.js), así
  // que aquí solo se elige de cuál se lee. Sin datos de Círculos se cae a HS.
  const esCirculos = programa === 'circulos-de-conocimiento';
  const datos = esCirculos
    ? {
        enrollments: circulos?.enrollments || [],
        formationProgress: circulos?.avancePlataforma || null,
        attendanceByCandidate: circulos?.attendanceByCandidate || {},
        groupAttendance: circulos?.groupAttendance || {},
        asistenciaSinCargar: circulos?.asistenciaSinCargar || [],
      }
    : { enrollments, formationProgress, attendanceByCandidate, groupAttendance, asistenciaSinCargar };

  // Guardar un perfil va contra el hook del programa que se está viendo.
  const guardarMatricula = esCirculos ? circulos?.updateEnrollment : updateEnrollment;

  // Al cambiar de programa cambian los grupos: la pestaña anterior no existe.
  const cambiarPrograma = (slug) => {
    setPrograma(slug);
    setActiveTab(PROGRAMAS[slug].grupos[0]);
    setSearch('');
  };

  const progressByCandidateId = useMemo(() => {
    if (!datos.formationProgress) return {};
    const map = {};
    datos.formationProgress.participants.forEach(p => { map[p.candidateId] = p; });
    return map;
  }, [datos.formationProgress]);

  // Construir perfiles desde enrollments (ya incluye ruta_asignada, historial y ponderados)
  // Se excluyen quienes nunca fueron elegidos (elegido === false): no forman parte de la selección.
  const profiles = useMemo(() => {
    return datos.enrollments.filter(enr => enr.custom_form_data?.elegido !== false).map(enr => {
      const c = enr.candidate || {};
      const cf = enr.custom_form_data || {};
      // Porcentajes ajustados (solo actividades ocurridas); fallback al Excel si no hay filas de asistencia.
      const att = datos.attendanceByCandidate[c.id];
      return {
        id: enr.id,
        candidate_id: c.id,
        fullName: cf.nombre_completo || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Desconocido',
        doc: cf.cedula || c.document_number || 'S/N',
        email: c.email || '',
        phone: c.phone || '',
        city: c.city || 'Desconocido',
        ruta: rutaActual(cf) || 'Sin asignar',
        isActive: cf.estado_activo !== false && enr.status !== 'inactive',
        // El historial de grupos, para que el modal pueda cerrar la fase abierta
        // y abrir la nueva sin perder la asistencia anterior (src/lib/rutas.js).
        customFormData: cf,
        fases: fasesDeMatricula(cf),
        rutaInicial: cf.ruta_inicial || null,
        cambioNivel: cf.cambio_nivel || null,
        historia: cf.historia || null,
        motivoCambio: cf.motivo_cambio || null,
        completitud: cf.completitud_nivelacion ?? null,
        retiro: cf.retiro || null,
        enRiesgo: cf.en_riesgo ? { situacion: cf.riesgo_situacion, canal: cf.riesgo_canal } : null,
        // Si hay filas de asistencia, usar los % ajustados (null = aún no ocurre ninguna → "—");
        // solo si no hay asistencia registrada, caer al valor del Excel.
        pondSesiones: att ? att.pctSesiones : pct01(cf.pond_sesiones),
        pondCafes: att ? att.pctCafes : pct01(cf.pond_cafes),
        pondEntregables: att ? att.pctEntregables : pct01(cf.pond_entregables),
        totalPonderado: att ? att.totalPonderado : pct01(cf.total_ponderado),
      };
    });
  }, [datos.enrollments, datos.attendanceByCandidate]);

  // Las pestañas salen de los DATOS, no de una lista fija: un grupo se muestra
  // solo si alguien lo tiene como ruta actual. Así, cuando Activación termine de
  // migrarse a Junior la pestaña desaparece sola, y si alguien se quedara atrás
  // sigue visible en vez de esconderse. El vocabulario completo se conserva en
  // PROGRAMAS —da el orden— y en GROUP_META los colores del histórico.
  const GROUPS = useMemo(() => {
    const conGente = new Set(profiles.map(p => p.ruta));
    const vivos = cfg.grupos.filter(g => conGente.has(g));
    return vivos.length ? vivos : cfg.grupos;
  }, [profiles, cfg.grupos]);

  // Si la pestaña elegida se quedó sin nadie, se cae a la primera con gente en
  // vez de pintar una tabla vacía.
  const activeTab = GROUPS.includes(tabSeleccionada) ? tabSeleccionada : GROUPS[0];

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
  }, [profiles, GROUPS]);

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

  // Contexto de madurez del grupo activo: cuántas sesiones ya ocurrieron y hasta qué fecha
  const sesInfo = useMemo(() => {
    const ses = datos.groupAttendance[activeTab]?.sesiones || [];
    const realizadas = ses.filter(s => s.occurred).length;
    const lastFecha = ses
      .filter(s => s.occurred && s.fecha)
      .reduce((max, s) => (!max || s.fecha > max) ? s.fecha : max, null);
    return { realizadas, total: ses.length, lastFecha };
  }, [datos.groupAttendance, activeTab]);

  // Sesiones cuya fecha ya pasó pero que siguen sin asistencia cargada. Quedan en
  // gris (no hunden los porcentajes), pero sin aviso se olvidarían en silencio.
  // Lo calcula src/lib/asistencia.js; aquí solo se acota al grupo visible.
  const sinCargar = useMemo(
    () => (datos.asistenciaSinCargar || []).filter(s => s.grupo === activeTab),
    [datos.asistenciaSinCargar, activeTab]
  );

  const meta = GROUP_META[activeTab];
  const st = groupStats[activeTab] || {};

  // ── Exportación ───────────────────────────────────────────────────────────
  // Qué se lleva el Excel lo decide el usuario en el modal; aquí solo se
  // declaran los filtros disponibles y se le pasa lo que ya está en pantalla.
  const [exportOpen, setExportOpen] = useState(false);
  const [informeOpen, setInformeOpen] = useState(false);

  const camposExport = useMemo(() => [
    {
      id: 'grupos',
      label: 'Grupos',
      tipo: 'checks',
      opciones: GROUPS.map((g) => ({
        id: g,
        label: GROUP_META[g]?.label || g,
        hint: `${groupStats[g]?.activos ?? 0} activos · ${groupStats[g]?.inactivos ?? 0} inactivos`,
      })),
    },
    {
      id: 'estado',
      label: 'Estado',
      tipo: 'radio',
      opciones: [
        { id: 'todos', label: 'Activos e inactivos' },
        { id: 'activos', label: 'Solo activos' },
        { id: 'inactivos', label: 'Solo inactivos', hint: 'Para revisar retiros' },
      ],
    },
    {
      id: 'hojas',
      label: 'Hojas del libro',
      tipo: 'checks',
      opciones: [
        { id: 'matriculas', label: 'Matrículas', hint: 'Una fila por persona con su estado' },
        { id: 'asistencia', label: 'Matriz de asistencia', hint: 'Una hoja por grupo: personas × actividades' },
        { id: 'detalle', label: 'Detalle por actividad', hint: 'Una fila por persona y actividad, para tablas dinámicas' },
      ],
    },
    {
      id: 'columnas',
      label: 'Columnas opcionales',
      tipo: 'checks',
      opciones: [
        { id: 'contacto', label: 'Contacto', hint: 'Correo, teléfono y ciudad' },
        ...(cfg.columnasExtra
          ? [{ id: 'historial', label: 'Historial de rutas', hint: 'Por qué grupos pasó y desde cuándo' }]
          : []),
        { id: 'plataforma', label: 'Avance en plataforma' },
        { id: 'riesgo', label: 'Riesgo y retiro', hint: 'Categoría, motivo y fecha' },
      ],
    },
  ], [GROUPS, groupStats, cfg.columnasExtra]);

  const valoresExport = useMemo(() => ({
    grupos: GROUPS,
    estado: 'todos',
    hojas: ['matriculas', 'asistencia'],
    columnas: ['contacto', ...(cfg.columnasExtra ? ['historial'] : []), 'plataforma', 'riesgo'],
  }), [GROUPS, cfg.columnasExtra]);

  const resumenExport = (v) => {
    const n = filtrarPerfiles(profiles, { grupos: v.grupos, estado: v.estado }).length;
    const hojas = (v.hojas || []).length;
    if (!hojas) return 'Selecciona al menos una hoja.';
    return `${n} participante${n === 1 ? '' : 's'} · ${hojas} tipo${hojas === 1 ? '' : 's'} de hoja`;
  };

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header-left">
          <h1>Cohorte de Formación</h1>
          <p>
            {esCirculos
              ? 'Asistencia a sesiones y avance en plataforma · Círculos de Conocimiento.'
              : 'Asistencia y avance formativo por grupo · Senior, Junior y Estrategia de Activación.'}
          </p>
        </div>
        <div className="page-header-actions">
          {circulos && (
            <select
              className="filter-select"
              value={programa}
              onChange={e => cambiarPrograma(e.target.value)}
              aria-label="Programa"
            >
              {Object.entries(PROGRAMAS).map(([slug, p]) => (
                <option key={slug} value={slug}>{p.nombre}</option>
              ))}
            </select>
          )}
          <button className="btn btn-secondary" onClick={() => setExportOpen(true)}>📊 Exportar Excel</button>
          <button className="btn btn-secondary" onClick={() => setInformeOpen(true)}>📄 Informe PDF</button>
        </div>
      </div>

      {/* KPIs por grupo */}
      <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(${GROUPS.length}, 1fr)`, marginBottom: 24 }}>
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

      {sinCargar.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 16, padding: '14px 18px', display: 'flex', gap: 12,
            alignItems: 'flex-start', borderLeft: '3px solid var(--accent-amber)',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {sinCargar.length === 1
                ? 'Hay una actividad sin asistencia cargada'
                : `Hay ${sinCargar.length} actividades sin asistencia cargada`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {sinCargar.map(s => `${nombreActividad(s)} (${fechaCorta(s.fecha) || 'sin fecha'})`).join(' · ')}
              {' '}— ya {sinCargar.length === 1 ? 'ocurrió' : 'ocurrieron'} pero no {sinCargar.length === 1 ? 'tiene' : 'tienen'} ningún
              registro, así que {sinCargar.length === 1 ? 'sigue' : 'siguen'} en gris y no {sinCargar.length === 1 ? 'cuenta' : 'cuentan'} en
              los porcentajes. Toma la asistencia desde Eventos o carga el formulario.
            </div>
          </div>
        </div>
      )}

      {/* Panel del grupo activo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 40 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', width: 120 }}>Promedios del grupo<br /><span style={{ color: meta.color, fontSize: 13 }}>{meta.label}</span></div>
          <div style={{ display: 'flex', gap: 32 }}>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Asistencia a sesiones</div><div style={{ fontSize: 30, fontWeight: 800, color: progressColor(st.avgSesiones) }}>{st.avgSesiones ?? '—'}%</div></div>
            {/* El ponderado solo tiene sentido donde hay cafés y entregables que ponderar. */}
            {cfg.columnasExtra && (
              <div><div style={{ fontSize: 12, color: '#64748b' }}>Total ponderado</div><div style={{ fontSize: 30, fontWeight: 800, color: progressColor(st.avgTotal) }}>{st.avgTotal ?? '—'}%</div></div>
            )}
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Sesiones realizadas</div><div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a' }}>{sesInfo.realizadas}<span style={{ fontSize: 16, color: '#475569', fontWeight: 600 }}>/{sesInfo.total}</span></div></div>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Participantes</div><div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a' }}>{st.activos ?? 0}</div></div>
          </div>
          {sesInfo.lastFecha && (
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              Datos al<br /><span style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>{fechaCorta(sesInfo.lastFecha)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: cfg.columnasExtra ? '1fr 1fr' : '1fr', gap: 16 }}>
          <AttendanceBarChart title="Asistencia por sesión" items={datos.groupAttendance[activeTab]?.sesiones} kind="sesion" />
          {cfg.columnasExtra && (
            <AttendanceBarChart title="Asistencia a cafés de conocimiento" items={datos.groupAttendance[activeTab]?.cafes} kind="cafe" />
          )}
          {/* Solo cuando el grupo tenga mentorías: son acompañamiento, no las
              tienen todos los grupos y su % no entra en el del programa. */}
          {(datos.groupAttendance[activeTab]?.mentorias || []).length > 0 && (
            <AttendanceBarChart
              title="Asistencia a mentorías (no cuenta para el %)"
              items={datos.groupAttendance[activeTab]?.mentorias}
              kind="sesion"
            />
          )}
        </div>
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
                color: activeTab === tab ? '#0f172a' : '#64748b',
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Mostrar inactivos
            </label>
            <span style={{ fontSize: 13, color: '#475569' }}>{filtered.length} participantes</span>
          </div>
        </div>

        {/* Leyenda de asistencia */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
          <AttendanceLegend />
        </div>

        {/* Tabla */}
        <div className="table-container" style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderSpacing: '10px 6px', minWidth: 1040 }}>
            <thead>
              <tr>
                {(cfg.columnasExtra
                  ? ['Participante', 'Documento', 'Historial', 'Asist. sesiones', 'Cafés', 'Entregable', 'Total', 'Estado']
                  // Círculos: sin transiciones de nivel ni cafés/entregables. En su
                  // lugar, el avance en plataforma, que es su segunda métrica.
                  : ['Participante', 'Documento', 'Asist. sesiones', 'Progreso plataforma', 'Total', 'Estado']
                ).map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '12px 14px', background: 'rgba(148,163,184,0.08)', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const att = datos.attendanceByCandidate[p.candidate_id] || {};
                const avance = progressByCandidateId[p.candidate_id];
                return (
                <tr key={p.id} onClick={() => setSelectedProfile(p)} style={{ cursor: 'pointer', opacity: p.isActive ? 1 : 0.55 }}>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'left', borderRadius: 4 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.fullName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.email}</div>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4, fontSize: 13 }}>{p.doc}</td>
                  {cfg.columnasExtra && (
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}><HistoryBadge profile={p} /></td>
                  )}
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    <AttendanceCells items={att.sesiones} pct={p.pondSesiones} />
                  </td>
                  {cfg.columnasExtra ? (
                    <>
                      <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                        <AttendanceCells items={att.cafes} pct={p.pondCafes} />
                      </td>
                      <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                        <AttendanceCells items={att.entregables} pct={p.pondEntregables} />
                      </td>
                    </>
                  ) : (
                    // Avance en plataforma. "—" mientras no se cargue el reporte.
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                      <Bar pct={avance ? avance.avgProgress : null} width={80} />
                    </td>
                  )}
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: progressColor(p.totalPonderado) }}>{p.totalPonderado ?? '—'}%</span>
                  </td>
                  <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                    {p.isActive
                      ? <span className="badge badge-approved" style={{ background: 'var(--accent-emerald-dim)', color: 'var(--accent-emerald)' }}>Activo</span>
                      : <span className="badge badge-rejected" style={{ background: 'var(--accent-rose-dim)', color: 'var(--accent-rose)' }}>Inactivo</span>}
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={cfg.columnasExtra ? 8 : 6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No hay participantes en este grupo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {exportOpen && (
        <ExportExcelModal
          titulo="Exportar formación a Excel"
          descripcion={cfg.nombre}
          campos={camposExport}
          valoresIniciales={valoresExport}
          resumen={resumenExport}
          onClose={() => setExportOpen(false)}
          onExportar={(opciones) => exportarFormacion({
            programa: cfg.nombre,
            perfiles: profiles,
            asistencia: datos.attendanceByCandidate,
            avancePorCandidato: progressByCandidateId,
            columnasExtra: cfg.columnasExtra,
            opciones,
          })}
        />
      )}

      {informeOpen && (
        <InformeModal
          titulo="Informe de asistencia"
          subtitulo={`${cfg.nombre}${sesInfo.lastFecha ? ` · datos al ${fechaCorta(sesInfo.lastFecha)}` : ''}`}
          onClose={() => setInformeOpen(false)}
        >
          <InformeAsistencia
            programa={cfg.nombre}
            grupos={GROUPS}
            groupStats={groupStats}
            groupAttendance={datos.groupAttendance}
            perfiles={profiles}
            asistencia={datos.attendanceByCandidate}
            sinCargar={datos.asistenciaSinCargar}
            columnasExtra={cfg.columnasExtra}
            etiquetaGrupo={(g) => GROUP_META[g]?.label || g}
          />
        </InformeModal>
      )}

      {selectedProfile && (
        <ParticipantDetailModal
          profile={selectedProfile}
          courseProgress={progressByCandidateId[selectedProfile.candidate_id]}
          attendance={datos.attendanceByCandidate[selectedProfile.candidate_id]}
          onClose={() => setSelectedProfile(null)}
          rutas={cfg.rutas}
          // Cada programa guarda con la función de SU hook: la matrícula se
          // resuelve contra su propia lista. Antes se usaba siempre la de
          // Horizontes y editar a alguien de Círculos lanzaba
          // "Enrollment no encontrado".
          onSave={guardarMatricula
            ? async (id, updates) => { await guardarMatricula(id, updates); setSelectedProfile(null); }
            : null}
        />
      )}
    </div>
  );
}
