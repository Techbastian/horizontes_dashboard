// ============================================================================
// Exportación a Excel de las listas del dashboard.
//
// `xlsx` (SheetJS) ya estaba en el proyecto para los ETL. Aquí se carga con
// import() DINÁMICO a propósito: pesa ~800 kB y solo hace falta cuando alguien
// pulsa el botón, así que Vite la deja en su propio chunk y no engorda la carga
// inicial del dashboard (que ya ronda los 969 kB por Recharts).
//
// Ojo con la forma del import: `xlsx.mjs` —el entry que usa Vite— exporta solo
// con nombre, SIN default. En el navegador va `const { utils, write } = await
// import('xlsx')`; el `import XLSX from 'xlsx'` de los scripts funciona porque
// node resuelve el CJS. No unifiques las dos formas.
//
// Módulo plain .js sin JSX: las páginas le pasan los datos YA calculados, los
// mismos que están pintando en pantalla, así que el Excel siempre coincide con
// lo que el equipo está viendo. Nada de recalcular métricas aquí.
//
// Qué se incluye lo decide el usuario en ExportExcelModal y llega en `opciones`;
// este módulo no filtra por su cuenta.
// ============================================================================

import { nombreActividad } from './asistencia.js';

// Excel no acepta estos caracteres en el nombre de una hoja, y corta a 31.
const nombreHoja = (s) => String(s).replace(/[[\]:*?/\\]/g, '-').slice(0, 31);

// Fecha de hoy en Bogotá (UTC-5 fijo) para el nombre del archivo.
export function hoyBogota() {
  const t = Date.now() - 5 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Escribe y descarga un .xlsx.
 * @param nombre  nombre del archivo, sin extensión
 * @param hojas   [{ nombre, columnas: [{ titulo, ancho }], filas: [[...]] }]
 */
export async function descargarLibro({ nombre, hojas }) {
  const { utils, write } = await import('xlsx');
  const wb = utils.book_new();

  for (const hoja of hojas) {
    const encabezado = hoja.columnas.map((c) => c.titulo);
    const ws = utils.aoa_to_sheet([encabezado, ...hoja.filas]);
    // `!cols` (ancho) sí lo escribe la versión community de SheetJS; el panel
    // congelado (`!freeze`) no existe en 0.18.5, así que no se intenta.
    ws['!cols'] = hoja.columnas.map((c) => ({ wch: c.ancho || 14 }));
    utils.book_append_sheet(wb, ws, nombreHoja(hoja.nombre));
  }

  const buffer = write(wb, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Vocabulario compartido ──────────────────────────────────────────────────

// Mismo criterio que AttendanceCells en FormationPage: "pendiente" gana sobre
// todo lo demás, para que el Excel diga exactamente lo que muestra la pantalla.
export function estadoAsistencia(item) {
  if (!item) return '';
  const entregable = item.tipo === 'entregable';
  if (item.occurred === false) return 'Pendiente';
  if (item.asistio === true) return entregable ? 'Entregó' : 'Sí';
  if (item.asistio === false) return entregable ? 'No entregó' : 'No';
  return 'Sin registro';
}

const siNo = (v) => (v ? 'Sí' : 'No');

// Los porcentajes van como NÚMERO entero (85), no como fracción (0.85): el
// encabezado ya dice "%", y así la celda se ordena y promedia en Excel sin
// depender de un formato de celda que la versión community no siempre escribe.
// null = no se le midió nada todavía → celda vacía, nunca un 0 que se leería
// como "no fue a nada" (misma regla que el "—" de la pantalla).
const pct = (v) => (v == null ? '' : Math.round(v));

// Historial de rutas en una línea: "Activación → Junior (desde 23/07)".
function historialTexto(fases = []) {
  if (fases.length <= 1) return '';
  const dm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '');
  return fases
    .map((f, i) => (i === 0 ? f.ruta : `${f.ruta}${f.desde ? ` (desde ${dm(f.desde)})` : ''}`))
    .join(' → ');
}

// Orden de columnas de actividad: primero sesiones, luego cafés, luego
// entregables; dentro de cada tipo por fecha (los entregables no tienen) y
// `orden` de desempate, igual que en src/lib/asistencia.js.
const PESO_TIPO = { sesion: 0, cafe: 1, entregable: 2 };
function ordenarActividades(a, b) {
  return (
    (PESO_TIPO[a.tipo] ?? 9) - (PESO_TIPO[b.tipo] ?? 9) ||
    String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')) ||
    (a.orden ?? 0) - (b.orden ?? 0) ||
    String(a.actividad).localeCompare(String(b.actividad), 'es')
  );
}

const claveActividad = (i) => `${i.grupo}|${i.tipo}|${i.actividad}|${i.fecha || ''}`;

const itemsDe = (att) => [
  ...(att?.sesiones || []),
  ...(att?.cafes || []),
  ...(att?.entregables || []),
];

// ── Hoja de asistencia: personas × actividades ──────────────────────────────
// Es el equivalente digital de la matriz de seguimiento en Excel: una fila por
// persona, una columna por actividad. Las columnas salen de la UNIÓN de lo que
// tiene cada miembro del grupo, no de una lista fija, porque quien cambió de
// ruta arrastra las actividades de su fase anterior (ver historial_ruta).
function hojaAsistencia({ nombre, perfiles, asistencia, columnasExtra, contacto }) {
  const actividades = new Map();
  for (const p of perfiles) {
    for (const it of itemsDe(asistencia[p.candidate_id])) {
      const k = claveActividad(it);
      if (!actividades.has(k)) actividades.set(k, it);
    }
  }
  const cols = [...actividades.values()].sort(ordenarActividades);

  // Si en la hoja conviven actividades de varios grupos (alguien que cambió de
  // ruta), el encabezado lo dice: si no, dos "Sesion 25/05" distintas —una de
  // Junior y otra de Senior— se leerían como la misma.
  const grupos = new Set(cols.map((c) => c.grupo));
  const tituloCol = (c) => {
    // El nombre legible, no el código con el que se guarda (Círculos: C-S01).
    const titulo = nombreActividad(c);
    // Muchos nombres ya traen la fecha dentro ("Sesion 25/05"): no se repite.
    const dm = c.fecha ? `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}` : '';
    const fecha = dm && !titulo.includes(dm) ? ` ${dm}` : '';
    const grupo = grupos.size > 1 ? ` [${c.grupo}]` : '';
    const pendiente = c.occurred === false ? ' (pendiente)' : '';
    return `${titulo}${fecha}${grupo}${pendiente}`;
  };

  const columnas = [
    { titulo: 'Participante', ancho: 32 },
    { titulo: 'Documento', ancho: 14 },
    ...(contacto ? [{ titulo: 'Correo', ancho: 30 }] : []),
    { titulo: 'Ruta actual', ancho: 12 },
    { titulo: 'Estado', ancho: 10 },
    ...cols.map((c) => ({ titulo: tituloCol(c), ancho: 16 })),
    { titulo: '% Sesiones', ancho: 12 },
    ...(columnasExtra
      ? [{ titulo: '% Cafés', ancho: 11 }, { titulo: '% Entregables', ancho: 14 }]
      : []),
    { titulo: 'Total ponderado', ancho: 15 },
  ];

  const filas = perfiles.map((p) => {
    const items = new Map(itemsDe(asistencia[p.candidate_id]).map((i) => [claveActividad(i), i]));
    return [
      p.fullName,
      p.doc,
      ...(contacto ? [p.email] : []),
      p.ruta,
      p.isActive ? 'Activo' : 'Inactivo',
      // Celda vacía = la actividad no le correspondía a esta persona (entró al
      // grupo después). Distinto de "Sin registro", que sí se le esperaba.
      ...cols.map((c) => estadoAsistencia(items.get(claveActividad(c)))),
      pct(p.pondSesiones),
      ...(columnasExtra ? [pct(p.pondCafes), pct(p.pondEntregables)] : []),
      pct(p.totalPonderado),
    ];
  });

  return { nombre, columnas, filas };
}

// ── Hoja de matrículas: una fila por persona con todo su estado ─────────────
function hojaMatriculas({ perfiles, avancePorCandidato, columnasExtra, incluye }) {
  const columnas = [
    { titulo: 'Participante', ancho: 32 },
    { titulo: 'Documento', ancho: 14 },
    ...(incluye.contacto
      ? [
          { titulo: 'Correo', ancho: 30 },
          { titulo: 'Teléfono', ancho: 14 },
          { titulo: 'Ciudad', ancho: 16 },
        ]
      : []),
    { titulo: 'Ruta actual', ancho: 12 },
    ...(incluye.historial && columnasExtra ? [{ titulo: 'Historial de rutas', ancho: 30 }] : []),
    { titulo: 'Estado', ancho: 10 },
    { titulo: '% Sesiones', ancho: 12 },
    ...(columnasExtra
      ? [{ titulo: '% Cafés', ancho: 11 }, { titulo: '% Entregables', ancho: 14 }]
      : []),
    { titulo: 'Total ponderado', ancho: 15 },
    ...(incluye.plataforma ? [{ titulo: 'Avance plataforma', ancho: 17 }] : []),
    ...(incluye.riesgo
      ? [
          { titulo: 'En riesgo', ancho: 11 },
          { titulo: 'Situación de riesgo', ancho: 28 },
          { titulo: 'Categoría de retiro', ancho: 22 },
          { titulo: 'Motivo de retiro', ancho: 40 },
          { titulo: 'Fecha de retiro', ancho: 14 },
        ]
      : []),
  ];

  const filas = perfiles.map((p) => {
    const avance = avancePorCandidato[p.candidate_id];
    const r = p.retiro || {};
    return [
      p.fullName,
      p.doc,
      ...(incluye.contacto ? [p.email, p.phone, p.city] : []),
      p.ruta,
      ...(incluye.historial && columnasExtra ? [historialTexto(p.fases)] : []),
      p.isActive ? 'Activo' : 'Inactivo',
      pct(p.pondSesiones),
      ...(columnasExtra ? [pct(p.pondCafes), pct(p.pondEntregables)] : []),
      pct(p.totalPonderado),
      ...(incluye.plataforma ? [pct(avance ? avance.avgProgress : null)] : []),
      ...(incluye.riesgo
        ? [siNo(p.enRiesgo), p.enRiesgo?.situacion || '', r.categoria || '', r.motivo || '', r.fecha || '']
        : []),
    ];
  });

  return { nombre: 'Matrículas', columnas, filas };
}

// ── Hoja larga: una fila por (persona, actividad) ───────────────────────────
// La matriz ancha es la que el equipo lee; esta es la que se cruza con tablas
// dinámicas. Va aparte porque en una sola hoja no caben las dos formas.
function hojaDetalle({ perfiles, asistencia }) {
  const columnas = [
    { titulo: 'Participante', ancho: 32 },
    { titulo: 'Documento', ancho: 14 },
    { titulo: 'Ruta actual', ancho: 12 },
    { titulo: 'Grupo de la actividad', ancho: 18 },
    { titulo: 'Tipo', ancho: 12 },
    { titulo: 'Actividad', ancho: 26 },
    { titulo: 'Fecha', ancho: 12 },
    { titulo: 'Asistencia', ancho: 13 },
    { titulo: 'Observación', ancho: 40 },
  ];

  const filas = [];
  for (const p of perfiles) {
    for (const it of itemsDe(asistencia[p.candidate_id]).sort(ordenarActividades)) {
      filas.push([
        p.fullName,
        p.doc,
        p.ruta,
        it.grupo,
        it.tipo,
        nombreActividad(it),
        it.fecha || '',
        estadoAsistencia(it),
        it.observacion || '',
      ]);
    }
  }

  return { nombre: 'Detalle por actividad', columnas, filas };
}

// Filtro de personas según lo elegido en el modal. Es el único sitio donde se
// filtra: así el resumen que muestra el modal y lo que trae el archivo no se
// pueden separar.
export function filtrarPerfiles(perfiles, { grupos, estado }) {
  return perfiles.filter((p) => {
    if (grupos && grupos.length && !grupos.includes(p.ruta)) return false;
    if (estado === 'activos' && !p.isActive) return false;
    if (estado === 'inactivos' && p.isActive) return false;
    return true;
  });
}

/**
 * Libro de Formación. Sirve para los dos programas: en Círculos el grupo es
 * único y las columnas de cafés/entregables no aplican (`columnasExtra=false`).
 */
export async function exportarFormacion({
  programa,
  perfiles,
  asistencia,
  avancePorCandidato = {},
  columnasExtra,
  opciones,
}) {
  const { grupos = [], estado = 'todos', hojas = [], columnas = [] } = opciones || {};
  const incluye = {
    contacto: columnas.includes('contacto'),
    historial: columnas.includes('historial'),
    plataforma: columnas.includes('plataforma'),
    riesgo: columnas.includes('riesgo'),
  };

  const lista = filtrarPerfiles(perfiles, { grupos, estado });
  const libro = [];

  if (hojas.includes('matriculas')) {
    libro.push(hojaMatriculas({ perfiles: lista, avancePorCandidato, columnasExtra, incluye }));
  }

  if (hojas.includes('asistencia')) {
    for (const g of grupos) {
      const delGrupo = lista.filter((p) => p.ruta === g);
      if (!delGrupo.length) continue;
      libro.push(
        hojaAsistencia({
          nombre: `Asistencia ${g}`,
          perfiles: delGrupo,
          asistencia,
          columnasExtra,
          contacto: incluye.contacto,
        })
      );
    }
  }

  if (hojas.includes('detalle')) {
    libro.push(hojaDetalle({ perfiles: lista, asistencia }));
  }

  // Un libro sin hojas es un archivo corrupto para Excel: mejor avisar.
  if (!libro.length) throw new Error('No hay ninguna hoja seleccionada.');

  await descargarLibro({ nombre: `Formación - ${programa} - ${hoyBogota()}`, hojas: libro });
  return { participantes: lista.length, hojas: libro.length };
}

// ── Candidatos: el pipeline de selección ───────────────────────────────────
// Las filas llegan ya proyectadas por enriquecerPostulaciones (src/lib/
// postulaciones.js), la misma que alimenta la tabla de /candidatos.

export function filtrarPostulaciones(postulaciones, { elegibilidad, seleccion }) {
  return postulaciones.filter((p) => {
    if (elegibilidad === 'elegibles' && p.isRejected) return false;
    if (elegibilidad === 'noElegibles' && !p.isRejected) return false;
    if (seleccion === 'seleccionados' && !p.isFinalSelected) return false;
    if (seleccion === 'noSeleccionados' && p.isFinalSelected) return false;
    return true;
  });
}

export async function exportarCandidatos({ postulaciones, circulosIds, opciones }) {
  const { elegibilidad = 'todos', seleccion = 'todos', columnas = [] } = opciones || {};
  const lista = filtrarPostulaciones(postulaciones, { elegibilidad, seleccion });
  const incluye = {
    contacto: columnas.includes('contacto'),
    demografico: columnas.includes('demografico'),
    puntajes: columnas.includes('puntajes'),
    circulos: columnas.includes('circulos') && !!circulosIds,
  };

  const columnasHoja = [
    { titulo: 'Nombre', ancho: 32 },
    { titulo: 'Documento', ancho: 14 },
    ...(incluye.contacto
      ? [{ titulo: 'Correo', ancho: 30 }, { titulo: 'Teléfono', ancho: 14 }]
      : []),
    ...(incluye.demografico
      ? [
          { titulo: 'Edad', ancho: 7 },
          { titulo: 'Género', ancho: 14 },
          { titulo: 'Escolaridad', ancho: 20 },
          { titulo: 'Ciudad', ancho: 16 },
          { titulo: 'Canal', ancho: 18 },
          { titulo: 'Es cuidador/a', ancho: 13 },
        ]
      : []),
    { titulo: 'Elegibilidad', ancho: 13 },
    { titulo: 'Grupo evaluado', ancho: 14 },
    ...(incluye.puntajes
      ? [
          { titulo: 'Puntaje técnico', ancho: 15 },
          { titulo: 'Puntaje entrevista', ancho: 17 },
          { titulo: 'Puntaje total', ancho: 13 },
          { titulo: 'Motivo de descarte', ancho: 38 },
        ]
      : []),
    { titulo: 'Seleccionado', ancho: 13 },
    { titulo: 'Ruta', ancho: 12 },
    { titulo: 'Activo', ancho: 10 },
    ...(incluye.circulos ? [{ titulo: 'Continuó en Círculos', ancho: 19 }] : []),
  ];

  const filas = lista.map((p) => {
    const c = p.candidate || {};
    return [
      p.fullName,
      p.documentNumber,
      ...(incluye.contacto ? [p.email, c.phone || ''] : []),
      ...(incluye.demografico
        ? [
            c.age ?? '',
            c.gender || '',
            c.education_level || '',
            c.city || '',
            c.acquisition_channel || '',
            siNo(p.esCuidador),
          ]
        : []),
      p.elegibilidadStatus,
      p.grupo,
      ...(incluye.puntajes
        ? [
            p.puntajeTecnico ?? '',
            p.puntajeActitudinal ?? '',
            p.puntajeTotal ?? '',
            p.motivoDescarte || '',
          ]
        : []),
      siNo(p.isFinalSelected),
      p.nivelSeleccion || '',
      p.isFinalSelected ? siNo(p.nivelActivo) : '',
      ...(incluye.circulos ? [siNo(circulosIds?.has(c.id))] : []),
    ];
  });

  await descargarLibro({
    nombre: `Candidatos - Horizontes Senior - ${hoyBogota()}`,
    hojas: [{ nombre: 'Postulaciones', columnas: columnasHoja, filas }],
  });
  return { participantes: lista.length, hojas: 1 };
}

// ── Círculos: caracterización completa ─────────────────────────────────────
// El formulario de HubSpot dejó en custom_answers.caracterizacion todo lo que no
// tenía columna propia, y las llaves varían entre personas. Las que el equipo
// mira siempre van primero y con un título legible; el resto solo si se piden.
const CARAC_PRINCIPALES = [
  ['sexo', 'Sexo'],
  ['identidad_genero', 'Identidad de género'],
  ['escolaridad', 'Escolaridad'],
  ['municipio', 'Municipio'],
  ['comuna', 'Comuna'],
  ['barrio', 'Barrio'],
  ['estrato', 'Estrato'],
  ['cabeza_de_hogar', 'Jefatura de hogar'],
];

const CARAC_HABILIDADES = [
  ['habilidades_tecnicas', 'Habilidades técnicas'],
  ['power_skills', 'Power skills'],
];

const titulizar = (k) => String(k).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Una respuesta puede venir como lista (habilidades, power skills).
const valorPlano = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(' · ');
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
};

export function filtrarParticipantes(participantes, { estado }) {
  return participantes.filter((p) => {
    if (estado === 'activos' && !p.activo) return false;
    if (estado === 'inactivos' && p.activo) return false;
    return true;
  });
}

export async function exportarCirculos({
  participantes,
  asistencia = {},
  avancePorCandidato = {},
  opciones,
}) {
  const { estado = 'todos', columnas = [] } = opciones || {};
  const lista = filtrarParticipantes(participantes, { estado });

  const bloques = [...CARAC_PRINCIPALES];
  if (columnas.includes('habilidades')) bloques.push(...CARAC_HABILIDADES);

  const yaPuestas = bloques.map(([k]) => k);
  const otras = columnas.includes('todo')
    ? [...new Set(lista.flatMap((p) => Object.keys(p.carac || {})))]
        .filter((k) => !yaPuestas.includes(k))
        .sort()
    : [];

  const columnasHoja = [
    { titulo: 'Participante', ancho: 32 },
    ...(columnas.includes('contacto') ? [{ titulo: 'Correo', ancho: 30 }] : []),
    { titulo: 'Edad', ancho: 7 },
    { titulo: 'Estado', ancho: 10 },
    { titulo: 'Registro en plataforma', ancho: 34 },
    ...bloques.map(([, t]) => ({ titulo: t, ancho: t.length > 14 ? 26 : 16 })),
    ...(columnas.includes('asistencia') ? [{ titulo: '% Asistencia', ancho: 13 }] : []),
    ...(columnas.includes('plataforma') ? [{ titulo: 'Avance plataforma', ancho: 17 }] : []),
    ...otras.map((k) => ({ titulo: titulizar(k), ancho: 22 })),
  ];

  const filas = lista.map((p) => {
    const carac = p.carac || {};
    const att = asistencia[p.candidateId];
    const avance = avancePorCandidato[p.candidateId];
    return [
      p.nombre,
      ...(columnas.includes('contacto') ? [p.email] : []),
      p.edad ?? '',
      p.activo ? 'Activo' : 'Inactivo',
      // El detalle, no el estado a secas: distingue a quien está pendiente de
      // verificar el correo de quien de plano no aparece en la plataforma.
      p.registroDetalle || p.registro || 'Sin dato',
      ...bloques.map(([k]) => valorPlano(carac[k])),
      ...(columnas.includes('asistencia') ? [pct(att ? att.pctSesiones : null)] : []),
      ...(columnas.includes('plataforma') ? [pct(avance ? avance.avgProgress : null)] : []),
      ...otras.map((k) => valorPlano(carac[k])),
    ];
  });

  await descargarLibro({
    nombre: `Círculos de Conocimiento - participantes - ${hoyBogota()}`,
    hojas: [{ nombre: 'Participantes', columnas: columnasHoja, filas }],
  });
  return { participantes: lista.length, hojas: 1 };
}
