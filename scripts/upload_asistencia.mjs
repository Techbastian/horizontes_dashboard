// ============================================================================
// upload_asistencia.mjs — Sincroniza asistencia sesión por sesión + rutas +
// historial de transiciones desde la Matriz Maestra de Horizontes Senior.
//
//   node scripts/upload_asistencia.mjs            → DRY RUN (no escribe nada)
//   node scripts/upload_asistencia.mjs --commit   → escribe en Supabase
//
// Fuentes de verdad:
//   • Grupo actual + asistencia  → hoja de "Seguimiento progreso {grupo}"
//   • Ruta inicial / historial   → hoja "Matriz Maestra"
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import { grupoEnFecha, rutaActual } from '../src/lib/rutas.js';
import { attendanceTipo, gruposDeAsistencia, PROGRAMA_HS } from '../src/lib/eventos.js';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');
// `--detalle` imprime, actividad por actividad, cuántos sí / no / sin registro
// van a quedar. Es la forma de contrastar el plan contra la hoja antes de
// escribir, sobre todo cuando la matriz estrena columnas.
const DETALLE = process.argv.includes('--detalle');

const EXCEL_PATH = resolve(__dirname, '../bases_de_datos/Horizontes_Senior_Matriz_Maestra_VF.xlsx');
const YEAR = 2026;
const COHORT_SLUG = 'horizontes-senior-2026'; // cohorte destino: Horizontes Senior

// Fechas oficiales de los cafés de conocimiento (presenciales, compartidos Junior+Senior+Activación),
// tomadas del cronograma V9 (hoja "Matriz de horarios"). Keyed por número de café.
// Permiten aplicar la misma regla de "gris si no ha pasado" que a las sesiones.
const CAFE_FECHAS = { 1: '2026-05-21', 2: '2026-06-23', 3: '2026-07-23', 4: '2026-08-26', 5: '2026-09-24', 6: '2026-10-22' };

// Columnas cuyo encabezado no dice lo que la columna es. Se renombran ANTES de
// clasificarlas, para que la regla general no tenga que conocer excepciones.
//   • "Cafe 3 entregable" (hoja Senior) es el entregable que se presentó en el
//     Café 3, no asistencia al café. Leída como café habría entrado en la
//     casilla del Café 3 del 23/07 —46 registros ya cargados— con un único dato.
const RENOMBRE_COLUMNAS = {
  'Cafe 3 entregable': 'Entregable 6 (Café 3)',
};

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);
const norm = (d) => String(d ?? '').replace(/\D/g, '').trim();
const lc = (s) => String(s ?? '').toLowerCase().trim();

// Auditoría del mapeo columna-de-observaciones → actividad. Se imprime en cada
// corrida: si mañana cambia el layout de la matriz, se ve en el resumen en vez
// de perderse en silencio (que es justo como se corrompieron las excusas antes).
const OBS_MAPEO = new Map(); // "hoja|columna" → { actividad, n }
const OBS_HUERFANAS = new Map(); // "hoja|columna" → n
// Celdas de sesión que no le correspondían a la persona en esa fecha (ver el
// filtro por `sesionesPorGrupo` más abajo). Se listan para que la decisión sea
// visible y no un descarte silencioso.
const SESIONES_DESCARTADAS = [];

// ── Parseo de una hoja de seguimiento ──────────────────────────────────────
// ¿La actividad todavía no ha ocurrido? Comparación por cadena 'YYYY-MM-DD'
// contra hoy en Bogotá (UTC-5 fijo): comparar objetos Date da un día de error,
// porque `new Date('2026-07-23')` es medianoche UTC y en Colombia eso cae antes
// del fin del día 22.
const HOY_BOGOTA = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
// Fecha local de Bogotá de un timestamptz, que es la que guarda session_attendance.
const fechaBogota = (iso) =>
  iso ? new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) : null;
function esFutura(fecha) {
  if (!fecha) return false; // los entregables no tienen fecha
  return String(fecha).slice(0, 10) > HOY_BOGOTA;
}

function parseAttendanceValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isNaN(n)) return n > 0;
  const s = lc(v);
  if (['sí', 'si', 'asistió', 'asistio', 'entregó', 'entrego', 'x', 'true'].includes(s)) return true;
  if (['no', 'no asistió', 'no asistio', 'no entregó', 'false'].includes(s)) return false;
  return null;
}

function extractDate(label) {
  const m = String(label).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = String(m[1]).padStart(2, '0');
  const month = String(m[2]).padStart(2, '0');
  return `${YEAR}-${month}-${day}`;
}

// Nombre de un entregable a partir del encabezado de su columna. Los entregables
// NO son eventos de calendario, así que este nombre es lo único que se ve en
// pantalla y es además su clave contra la base: tiene que ser estable entre
// corridas (una normalización determinista lo es) y legible.
// "Entregable 2 3/08/26" → "Entregable 2 · 03/08"; "Entregable 2 " → "Entregable 2".
function nombreEntregable(col) {
  const t = String(col).trim();
  const n = t.match(/entregable\s*(\d+)/i)?.[1];
  if (!n) return t;
  const resto = t.replace(/^entregable\s*\d+\s*/i, '').replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '').trim();
  const f = extractDate(t.replace(/^entregable\s*\d+/i, ''));
  const sufijo = [resto, f ? `· ${f.slice(8, 10)}/${f.slice(5, 7)}` : ''].filter(Boolean).join(' ');
  return `Entregable ${n}${sufijo ? ` ${sufijo}` : ''}`;
}

// Detecta la fila del encabezado buscando "Número de Documento" (robusto ante cambios de layout)
function detectHeaderRow(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1 });
  for (let i = 0; i < Math.min(6, raw.length); i++) {
    if ((raw[i] || []).some(c => String(c ?? '').trim().toLowerCase() === 'número de documento')) return i;
  }
  return 0;
}

function parseSeguimiento(wb, sheetName, grupo) {
  const ws = wb.Sheets[sheetName];
  const headerRow = detectHeaderRow(ws);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, range: headerRow });
  const people = [];
  for (const r of rows) {
    const doc = norm(r['Número de Documento']);
    if (!doc) continue;
    const sesiones = [], cafes = [], mentorias = [], entregables = [];
    // "Estado final" de la hoja. ANTES se ignoraba y se daba por activo a todo
    // el que apareciera en una hoja: los retirados siguen listados ahí (16 al
    // 2026-07-27, marcados INACTIVO en el propio Excel), así que cada corrida
    // los resucitaba —incluidos los retiros registrados desde el dashboard, que
    // quedaban activos y con su objeto `retiro` puesto a la vez.
    // Vacío o ausente = activo, que era el comportamiento anterior.
    const activo = !/^inactiv/i.test(String(r['Estado final'] ?? '').trim());
    // A qué actividad pertenece cada columna "Observaci…": SE LEE DE SU PROPIO
    // NOMBRE, no de la posición en la hoja.
    //
    // Antes se pegaba a la actividad que la precedía, y el layout real de la
    // matriz rompe esa suposición en tres sitios distintos (verificado el
    // 2026-07-29 contra el archivo del 28/07):
    //   • Junior: las dos columnas de observaciones van DESPUÉS de las dos
    //     sesiones (…Sesion 06/07 | Sesion 27/07 | Obs 06/07 | Obs 27/07), así
    //     que las excusas del 06/07 se escribían sobre la sesión del 27/07 y
    //     acto seguido las pisaba la observación del 27/07: 19 excusas perdidas.
    //   • Activación: las cinco columnas de observación van después de las cinco
    //     sesiones, y las cinco colapsaban sobre la Sesión 5 (así quedó cargado).
    //   • "Observacion de cafe 3" va después del Café 6 → caía en el Café 6.
    //
    // La fecha manda sobre el número porque los encabezados de Activación traen
    // el número equivocado: "Observacion 4 22/07/2028" es de la Sesión 5
    // (22/07), no de la 4. Si el nombre no dice nada (la columna genérica
    // "Observaciones" del final), se cae a la actividad anterior, que es el
    // comportamiento viejo.
    const actividadDeObservacion = (col) => {
      const t = String(col);
      const esCafe = /caf[eé]/i.test(t);
      const esSesion = /sesi[oó]n/i.test(t);
      const candidatas = esCafe ? cafes : esSesion ? sesiones : [...sesiones, ...cafes, ...mentorias];

      const fecha = extractDate(t.replace(/^observaci[oó]n(es)?/i, ''));
      if (fecha) {
        const porFecha = candidatas.find((a) => a.fecha === fecha);
        if (porFecha) return porFecha;
      }

      // Sin fecha utilizable: el número, pero solo cuando el encabezado dice de
      // qué tipo de actividad habla.
      const sinFechas = t.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '');
      const n = parseInt(String(sinFechas).match(/\d+/)?.[0], 10);
      if (n) {
        if (esCafe) return cafes.find((c) => c.num === n) || null;
        if (esSesion) return sesiones.find((s) => parseInt(String(s.actividad).match(/\d+/)?.[0], 10) === n) || null;
      }
      return null;
    };

    const observacionesPendientes = [];
    let lastActivity = null;
    for (const [colCrudo, val] of Object.entries(r)) {
      if (/^__empty/i.test(colCrudo)) continue;
      const col = RENOMBRE_COLUMNAS[String(colCrudo).trim()] || colCrudo;
      // Las observaciones se comprueban PRIMERO: "Observaciones Sesion 27/07"
      // también empieza por una palabra que clasificaría mal si se mirara
      // después. Y los entregables antes que los cafés, por "Cafe 3 entregable"
      // (ver RENOMBRE_COLUMNAS).
      if (/^observaci/i.test(col)) {
        // Se resuelve al final de la fila: una observación puede referirse a una
        // actividad cuya columna todavía no se ha leído.
        if (val) observacionesPendientes.push({ col, val, anterior: lastActivity });
      // Anclado al principio: sin el `^`, "Ponderado entregables 25%" también
      // entraba y creaba una actividad falsa por persona con el ponderado (0.35)
      // leído como asistencia. "Cafe 3 entregable" no necesita la excepción
      // porque RENOMBRE_COLUMNAS ya la convirtió en "Entregable 6 (Café 3)".
      } else if (/^entregable/i.test(col)) {
        lastActivity = { actividad: nombreEntregable(col), fecha: null, asistio: parseAttendanceValue(val), observacion: null };
        entregables.push(lastActivity);
      } else if (/^sesi[oó]n/i.test(col)) {
        lastActivity = { actividad: col.trim(), fecha: extractDate(col), asistio: parseAttendanceValue(val), observacion: null };
        sesiones.push(lastActivity);
      } else if (/^mentor[ií]a/i.test(col)) {
        // La matriz marca SOLO a quien asistió: en las seis columnas de mentoría
        // no hay un solo cero. Un blanco de alguien ACTIVO es una ausencia, no un
        // dato faltante. Verificado contra lo capturado desde la app: la Mentoría
        // del 05/08 tiene 22 sí / 44 no en la base, y las hojas marcan
        // exactamente esos 22 (16 en Junior + 6 en Activación) — los 44 restantes
        // son justo los activos sin marca. En un inactivo el blanco sí es "no se
        // le midió": no se le puede contar una ausencia a quien ya no está.
        const marcado = parseAttendanceValue(val);
        lastActivity = { actividad: col.trim(), fecha: extractDate(col), asistio: marcado ?? (activo ? false : null), observacion: null };
        mentorias.push(lastActivity);
      } else if (/^caf[eé]/i.test(col)) {
        // El número del café se guarda: NO se puede usar la posición en la hoja.
        // La hoja de Activación empieza en el Café 3 (el grupo arrancó el 08/07),
        // así que por posición el Café 3 recibiría la fecha, el orden y el motivo
        // del Café 1.
        const numCafe = parseInt(String(col).match(/\d+/)?.[0], 10);
        lastActivity = { actividad: col.trim(), num: numCafe || null, fecha: CAFE_FECHAS[numCafe] || null, asistio: parseAttendanceValue(val), observacion: null };
        cafes.push(lastActivity);
      }
    }

    for (const o of observacionesPendientes) {
      const destino = actividadDeObservacion(o.col) || o.anterior;
      const k = `${sheetName}|${o.col}`;
      if (destino) {
        destino.observacion = String(o.val).trim();
        const prev = OBS_MAPEO.get(k) || { actividad: destino.actividad, n: 0 };
        prev.n++;
        OBS_MAPEO.set(k, prev);
      } else {
        OBS_HUERFANAS.set(k, (OBS_HUERFANAS.get(k) || 0) + 1);
      }
    }
    const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isNaN(n) ? null : n; };
    people.push({
      doc,
      email: lc(r['Correo Electrónico']),
      name: (r['Nombre Completo'] || '').trim(),
      grupo,
      activo,
      sesiones, cafes, mentorias, entregables,
      pond_sesiones: num(r['Ponderado Asistencia sesiones 35%']),
      pond_cafes: num(r['Ponderado asistencia cafés 40%']),
      pond_entregables: num(r['Ponderado entregables 25%']),
      total_ponderado: num(r['Total ponderado']),
    });
  }
  return people;
}

// ── Parseo Matriz Maestra (historial) ──────────────────────────────────────
function parseMatriz(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Matriz Maestra'], { defval: null });
  const map = new Map();
  for (const r of rows) {
    const doc = norm(r['Número de Documento']);
    if (!doc) continue;
    map.set(doc, {
      doc,
      name: (r['Nombre Completo'] || '').trim(),
      email: lc(r['Correo Electrónico']),
      seleccionado: lc(r['Resultado de Selección Final']) === 'seleccionado',
      ruta_inicial: (r['Ruta Asignada al Inicio de la Nivelación'] || '').trim(),
      ruta_definitiva_matriz: (r['Ruta definitiva'] || '').trim(),
      clasificacion: (r['Clasificación Final'] || '').trim(),
      cambio_nivel_texto: (r['Cambio de Nivel durante la Nivelación'] || '').trim(),
      motivo_cafe_1: (r['Motivo de no asistencia al 1er Café'] || '').trim() || null,
      motivo_cafe_2: (r['Motivo de no asistencia al 2er Café'] || '').trim() || null,
      elegible_ascenso: (r['Elegible para Ascenso a Senior'] || '').trim(),
      reasignada_senior: r['Reasignadas a ruta Senior'] === true,
      completitud: r['Porcentaje de Completitud en Nivelación'],
      como_seleccionado: (r['Cómo Fue Seleccionado'] || '').trim(),
    });
  }
  return map;
}

// ── Derivar historial de la persona ────────────────────────────────────────
function derivarHistorial(grupoActual, m) {
  const inicial = m?.ruta_inicial && m.ruta_inicial !== 'No aplica' ? m.ruta_inicial : null;
  let cambio_nivel = 'Sin cambio';
  let historia = '';
  if (grupoActual === 'Activación') {
    cambio_nivel = 'Ingresó por estrategia de activación';
    historia = 'Ingresó al programa mediante la estrategia de activación.';
  } else if (grupoActual === 'Inactivo') {
    cambio_nivel = `Inactivo${inicial ? ` (era ${inicial})` : ''}`;
    historia = `Se retiró del programa${inicial ? ` (venía de ${inicial})` : ''}.`;
  } else if (inicial && inicial !== grupoActual) {
    if (inicial === 'Junior' && grupoActual === 'Senior') {
      cambio_nivel = 'Ascendió de Junior a Senior';
      historia = m?.elegible_ascenso?.startsWith('Sí')
        ? 'Ascendió a Senior tras completar el 100% como Junior.'
        : 'Reasignado a la ruta Senior durante la nivelación.';
    } else if (inicial === 'Senior' && grupoActual === 'Junior') {
      cambio_nivel = 'Descendió de Senior a Junior';
      historia = m?.cambio_nivel_texto || 'Reubicado en Junior por completitud menor al 60%.';
    } else {
      cambio_nivel = `Cambió de ${inicial} a ${grupoActual}`;
      historia = m?.cambio_nivel_texto || '';
    }
  } else {
    historia = `Se mantuvo en la ruta ${grupoActual}.`;
  }
  return { ruta_inicial: inicial, cambio_nivel, historia, completitud_nivelacion: m?.completitud ?? null };
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  CARGA DE ASISTENCIA — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`${'='.repeat(70)}\n`);

  const wb = XLSX.readFile(EXCEL_PATH);
  const jr = parseSeguimiento(wb, 'Seguimiento progreso Junior', 'Junior');
  const sr = parseSeguimiento(wb, 'Seguimiento progreso Senior', 'Senior');
  const act = parseSeguimiento(wb, 'Seguimiento progreso grupo de a', 'Activación');
  const matriz = parseMatriz(wb);
  console.log(`📄 Hojas: Junior=${jr.length}  Senior=${sr.length}  Activación=${act.length}  | Matriz=${matriz.size} personas`);

  const enSeguimiento = [...jr, ...sr, ...act];
  const docsSeguimiento = new Set(enSeguimiento.map(p => p.doc));

  // Qué sesiones tiene CADA grupo, por fecha. Sirve para no inventarle a un
  // grupo una sesión que nunca tuvo: la hoja de un grupo puede traer llena la
  // fila de alguien que en esa fecha estaba en otro grupo, y al reubicar la fila
  // por fase (grupoEnFecha) la actividad viajaría con su nombre de origen.
  // Caso real (2026-07-29): Claudia Giraldo pasó de Senior a Junior el 27/07; la
  // hoja Junior traía marcadas sus sesiones del 25/05, 01/06 y 06/07 —que son
  // sesiones JUNIOR, los lunes— y al mandarlas a Senior, que esos días no tenía
  // sesión, aparecieron tres "sesiones Senior" de una sola persona al 100%.
  // Se guarda por `grupo|tipo`: las mentorías corren el mismo riesgo que las
  // sesiones (la hoja de Activación trae dos, y esas 20 personas hoy son Junior).
  const actividadesPorGrupo = new Set();
  for (const [lista, grupo] of [[jr, 'Junior'], [sr, 'Senior'], [act, 'Activación']]) {
    for (const p of lista) {
      for (const s of p.sesiones) if (s.fecha) actividadesPorGrupo.add(`${grupo}|sesion|${s.fecha}`);
      for (const m of p.mentorias) if (m.fecha) actividadesPorGrupo.add(`${grupo}|mentoria|${m.fecha}`);
    }
  }

  // Cohorte de Horizontes Senior, fijada por slug. NO usar status='active': la base
  // aloja varios programas (Círculos de Conocimiento) y "la cohorte activa más
  // reciente" ya no es la de Horizontes Senior.
  const { data: cohort, error: cohErr } = await supabase.from('cohorts').select('id,name')
    .eq('slug_application', COHORT_SLUG).limit(1).single();
  if (cohErr) throw new Error(`No se encontró la cohorte "${COHORT_SLUG}": ${cohErr.message}`);
  console.log(`✅ Cohort: ${cohort.name} (${cohort.id})`);
  const cohortId = cohort.id;

  // Candidatos (por doc y email)
  const allDocs = [...new Set([...enSeguimiento.map(p => p.doc)])];
  const allEmails = [...new Set(enSeguimiento.map(p => p.email).filter(Boolean))];
  const candByDoc = new Map(), candByEmail = new Map();
  for (let i = 0; i < allDocs.length; i += 300) {
    const { data } = await supabase.from('candidates').select('id,document_number,email').in('document_number', allDocs.slice(i, i + 300));
    (data || []).forEach(c => { candByDoc.set(norm(c.document_number), c.id); if (c.email) candByEmail.set(lc(c.email), c.id); });
  }
  for (let i = 0; i < allEmails.length; i += 300) {
    const { data } = await supabase.from('candidates').select('id,email').in('email', allEmails.slice(i, i + 300));
    (data || []).forEach(c => { if (c.email) candByEmail.set(lc(c.email), c.id); });
  }
  const resolveCandidate = (p) => candByDoc.get(p.doc) || candByEmail.get(p.email) || null;

  // Enrollments actuales
  const { data: enrs } = await supabase.from('program_enrollments')
    .select('id,candidate_id,status,custom_form_data, candidates(document_number,email)').eq('cohort_id', cohortId);
  const enrByCand = new Map((enrs || []).map(e => [e.candidate_id, e]));

  // ── Con qué nombre está ya guardada cada actividad ─────────────────────────
  // El Excel y la captura desde la app llaman distinto a lo mismo: la matriz
  // trae "Sesion 06/08" y la app guardó "V-S08" (el código del evento), pero son
  // la MISMA casilla — Senior|sesion|2026-08-06, con los mismos 29 sí y 15 no—.
  // Escribir las dos deja a la persona con dos filas para una sola actividad, de
  // las que el frontend solo puede mostrar una, elegida por el orden en que
  // lleguen. Se resuelve igual que en EventAttendanceModal: reusar el nombre que
  // ya exista. Por orden de preferencia:
  //   1. la fila que ESA persona ya tiene en la casilla (nadie cambia de nombre);
  //   2. la que ya tengan otros en la misma casilla (la más frecuente);
  //   3. el código del evento del calendario — así el Excel y la app convergen
  //      de aquí en adelante, que es el patrón que ya sigue Círculos;
  //   4. el nombre de la columna del Excel, si la actividad no está en ningún lado.
  //
  // La casilla se identifica por fecha, no por nombre. Sin fecha —los
  // entregables— la que identifica es la actividad misma: son varios por grupo
  // y no hay nada más que los separe.
  const casilla = (grupo, tipo, fecha, actividad) =>
    fecha ? `${grupo}|${tipo}|${fecha}` : `${grupo}|${tipo}|${actividad}`;

  let filasPrevias = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('session_attendance')
      .select('candidate_id,grupo,tipo,fecha,actividad').eq('cohort_id', cohortId).range(desde, desde + 999);
    if (error) throw new Error(`No se pudo leer session_attendance: ${error.message}`);
    filasPrevias = filasPrevias.concat(data || []);
    if ((data || []).length < 1000) break;
  }
  const actividadDePersona = new Map();
  const frecuencias = new Map();
  for (const r of filasPrevias) {
    const k = casilla(r.grupo, r.tipo, r.fecha, r.actividad);
    actividadDePersona.set(`${k}|${r.candidate_id}`, r.actividad);
    if (!frecuencias.has(k)) frecuencias.set(k, new Map());
    const f = frecuencias.get(k);
    f.set(r.actividad, (f.get(r.actividad) || 0) + 1);
  }
  const actividadDominante = new Map(
    [...frecuencias].map(([k, f]) => [k, [...f].sort((a, b) => b[1] - a[1])[0][0]])
  );

  // Código del evento del calendario que corresponde a cada casilla.
  const { data: eventosCohorte } = await supabase.from('eventos')
    .select('id,grupo,tipo,codigo,nombre,fecha_hora_inicio').eq('cohort_id', cohortId);
  const codigoDeCasilla = new Map();
  for (const e of eventosCohorte || []) {
    const tipo = attendanceTipo(e);
    if (!tipo || !e.codigo) continue;
    const fecha = fechaBogota(e.fecha_hora_inicio);
    for (const g of gruposDeAsistencia(e, PROGRAMA_HS)) {
      const k = casilla(g, tipo, fecha, e.codigo);
      if (!codigoDeCasilla.has(k)) codigoDeCasilla.set(k, e.codigo);
    }
  }

  // Renombres aplicados, para que se vean en el resumen en vez de ocurrir en silencio.
  const RENOMBRES_APLICADOS = new Map();
  const nombreDeActividad = (grupo, tipo, fecha, candidateId, nombreExcel) => {
    const k = casilla(grupo, tipo, fecha, nombreExcel);
    const elegido = actividadDePersona.get(`${k}|${candidateId}`)
      || actividadDominante.get(k)
      || codigoDeCasilla.get(k)
      || nombreExcel;
    if (elegido !== nombreExcel) {
      const rk = `${grupo}|${tipo}|${fecha} · "${nombreExcel}" → "${elegido}"`;
      RENOMBRES_APLICADOS.set(rk, (RENOMBRES_APLICADOS.get(rk) || 0) + 1);
    }
    return elegido;
  };

  // ── Construir plan ────────────────────────────────────────────────────────
  const plan = { insertEnrollments: [], updateEnrollments: [], attendanceRows: [], sinCandidato: [], sinCambio: 0 };

  for (const p of enSeguimiento) {
    const candidateId = resolveCandidate(p);
    if (!candidateId) { plan.sinCandidato.push(p); continue; }
    const m = matriz.get(p.doc);
    const hist = derivarHistorial(p.activo ? p.grupo : 'Inactivo', m);

    const custom = {
      cedula: p.doc,
      nombre_completo: p.name,
      ruta_asignada: p.grupo,
      estado_activo: p.activo,
      elegido: true,
      ...hist,
      motivo_cambio: m?.cambio_nivel_texto || null,
      como_seleccionado: m?.como_seleccionado || null,
      pond_sesiones: p.pond_sesiones,
      pond_cafes: p.pond_cafes,
      pond_entregables: p.pond_entregables,
      total_ponderado: p.total_ponderado,
    };
    const attendance_percentage = p.pond_sesiones != null ? Math.round(p.pond_sesiones * 100) : null;

    const existing = enrByCand.get(candidateId);
    if (existing) {
      // El grupo de este script sale de la HOJA del Excel, que sigue reflejando el
      // reparto original. Si a la persona ya se le escribió un `historial_ruta`
      // (la movieron de grupo desde el dashboard o con
      // reclasificar_activacion_junior.mjs), ese historial manda: pisar
      // `ruta_asignada` con la hoja la devolvería a su grupo viejo y desharía la
      // migración. Las filas de session_attendance no corren ese riesgo porque
      // llevan el grupo de la hoja, que es donde de verdad ocurrió la actividad.
      const previo = existing.custom_form_data || {};
      const conservado = Array.isArray(previo.historial_ruta) && previo.historial_ruta.length
        ? { ruta_asignada: rutaActual(previo), historial_ruta: previo.historial_ruta }
        : {};
      plan.updateEnrollments.push({ id: existing.id, candidateId, grupo: p.grupo, custom: { ...previo, ...custom, ...conservado }, attendance_percentage, status: p.activo ? 'active' : 'inactive' });
    } else {
      plan.insertEnrollments.push({ candidateId, grupo: p.grupo, custom, attendance_percentage, doc: p.doc, name: p.name, status: p.activo ? 'active' : 'inactive' });
    }

    // Filas de asistencia. Cada actividad lleva su propia observación (viene pegada a su columna
    // en la hoja de seguimiento). Para cafés, el motivo de la Matriz Maestra (Café 1 y 2) tiene prioridad.
    const cafeMotivos = { 1: m?.motivo_cafe_1 || null, 2: m?.motivo_cafe_2 || null };
    // El grupo de cada fila es el grupo donde OCURRIÓ la actividad, no el de la
    // hoja: quien pasó de Activación a Junior el 23/07 hizo las sesiones de julio
    // como Activación pero el Café 3 (23/07) ya como Junior. Sin historial —el
    // caso de casi todos— `grupoEnFecha` no resuelve nada y manda la hoja, igual
    // que siempre. Las actividades sin fecha (entregables) tampoco se pueden
    // ubicar en el tiempo: se quedan con el grupo de la hoja.
    const cfPrevio = existing?.custom_form_data || null;
    const grupoDe = (fecha) => (cfPrevio && grupoEnFecha(cfPrevio, fecha)) || p.grupo;
    const push = (tipo, arr) => arr.forEach((a, i) => {
      const grupo = grupoDe(a.fecha);
      // Una sesión o mentoría que se reubica en otro grupo solo cuenta si ESE
      // grupo la tuvo ese día. Si no, la celda no le aplicaba a la persona (ver
      // `actividadesPorGrupo`) y escribirla crearía una actividad fantasma.
      // Los cafés son compartidos y los entregables no tienen fecha: no aplican.
      if ((tipo === 'sesion' || tipo === 'mentoria') && a.fecha && grupo !== p.grupo
          && !actividadesPorGrupo.has(`${grupo}|${tipo}|${a.fecha}`)) {
        SESIONES_DESCARTADAS.push({ doc: p.doc, name: p.name, actividad: a.actividad, deHoja: p.grupo, aGrupo: grupo });
        return;
      }
      plan.attendanceRows.push({
        cohort_id: cohortId, candidate_id: candidateId, grupo,
        tipo,
        actividad: nombreDeActividad(grupo, tipo, a.fecha, candidateId, a.actividad),
        fecha: a.fecha, orden: a.num ?? i + 1,
        // Una actividad que aún no ocurre no puede tener asistencia: el Excel trae
        // "No" en los cafés futuros y eso es un marcador, no un dato. Guardarlo como
        // false hace que el día que llegue la fecha cuente como que faltaron todos
        // y hunda los porcentajes. null = no registrado (ver src/lib/asistencia.js).
        asistio: esFutura(a.fecha) ? null : a.asistio,
        observacion: tipo === 'cafe' ? (cafeMotivos[a.num] || a.observacion || null) : (a.observacion || null),
      });
    });
    push('sesion', p.sesiones); push('cafe', p.cafes);
    push('mentoria', p.mentorias); push('entregable', p.entregables);
  }

  // Enrollments que NO están en una hoja de seguimiento:
  //   • inactivos    → FUERON elegidos (Seleccionado en la matriz), ahora inactivos. SÍ aparecen.
  //   • noElegidos   → NUNCA fueron elegidos ('No seleccionado' o fuera de la matriz).
  //                    Enrollments heredados/erróneos → elegido:false → NO aparecen en Formación.
  const inactivos = [], noElegidos = [];
  for (const e of (enrs || [])) {
    const doc = norm(e.custom_form_data?.cedula ?? e.candidates?.document_number);
    if (docsSeguimiento.has(doc)) continue; // en hoja → activo, ya procesado arriba
    const m = matriz.get(doc);
    const rutaPrevia = e.custom_form_data?.ruta_asignada || (m?.ruta_inicial && m.ruta_inicial !== 'No aplica' ? m.ruta_inicial : null) || null;
    // Activación apenas inicia hoy: quien sale de su hoja NO cuenta como inactivo del programa
    // (no hace parte de la selección final) → se oculta para no generar confusión.
    const esActivacionDropout = rutaPrevia === 'Activación';
    // Fue elegido si: (a) "Seleccionado" en la matriz, o (b) ya era participante Junior/Senior (elegido:true).
    const fueElegido = !esActivacionDropout && (!!(m && m.seleccionado) || e.custom_form_data?.elegido === true);

    if (fueElegido) {
      const hist = derivarHistorial('Inactivo', m);
      const esInactivoMatriz = m && (/inactivo/i.test(m.clasificacion) || /inactivo/i.test(m.ruta_definitiva_matriz));
      inactivos.push({
        id: e.id, doc, name: m?.name || e.custom_form_data?.nombre_completo, grupoPrevio: rutaPrevia,
        custom: {
          ...(e.custom_form_data || {}),
          ruta_asignada: rutaPrevia, estado_activo: false, elegido: true, ...hist,
          motivo_cambio: esInactivoMatriz
            ? (m.cambio_nivel_texto || 'Clasificado como inactivo en la matriz.')
            : 'No continúa: ya no figura en las matrices de seguimiento activas.',
        },
      });
    } else {
      // Nunca elegido: nunca tuvo ruta real. Se excluye de la selección definitiva.
      noElegidos.push({
        id: e.id, doc, name: m?.name || e.custom_form_data?.nombre_completo, grupoPrevio: rutaPrevia,
        custom: {
          ...(e.custom_form_data || {}),
          elegido: false, estado_activo: false,
          motivo_exclusion: m ? 'No seleccionado en la matriz maestra.' : 'No figura en la matriz maestra.',
        },
      });
    }
  }

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(70)}\n  RESUMEN DEL PLAN\n${'─'.repeat(70)}`);
  const byGrupo = (arr) => { const g = {}; arr.forEach(x => g[x.grupo] = (g[x.grupo] || 0) + 1); return JSON.stringify(g); };
  console.log(`  Enrollments a ACTUALIZAR (en hoja):     ${plan.updateEnrollments.length}  ${byGrupo(plan.updateEnrollments)}`);
  const inactivosEnHoja = plan.updateEnrollments.filter(x => x.status === 'inactive');
  console.log(`       de ellos, marcados INACTIVO en la hoja: ${inactivosEnHoja.length} (NO se reactivan)`);
  console.log(`  Enrollments a CREAR (Activación nuevos): ${plan.insertEnrollments.length}  ${byGrupo(plan.insertEnrollments)}`);
  console.log(`  INACTIVOS que SÍ fueron elegidos (aparecen): ${inactivos.length}`);
  inactivos.forEach(x => console.log(`       • ${x.doc} ${x.name} (era ${x.grupoPrevio})`));
  console.log(`  ❌ NUNCA elegidos (elegido:false, NO aparecen): ${noElegidos.length}`);
  noElegidos.forEach(x => console.log(`       • ${x.doc} ${x.name} (ruta_BD previa: ${x.grupoPrevio})`));
  console.log(`  Filas de asistencia a cargar:             ${plan.attendanceRows.length}`);
  const porTipo = {};
  plan.attendanceRows.forEach(r => { porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1; });
  console.log(`       por tipo: ${JSON.stringify(porTipo)}`);

  if (DETALLE) {
    const porActividad = new Map();
    for (const r of plan.attendanceRows) {
      const k = `${r.grupo}|${r.tipo}|${r.fecha ?? '—'.padEnd(10)}|${r.actividad}`;
      const v = porActividad.get(k) || { si: 0, no: 0, nulo: 0 };
      if (r.asistio === true) v.si++; else if (r.asistio === false) v.no++; else v.nulo++;
      porActividad.set(k, v);
    }
    console.log(`\n  Detalle por actividad (sí / no / sin registro):`);
    for (const [k, v] of [...porActividad].sort()) {
      const [grupo, tipo, fecha, actividad] = k.split('|');
      console.log(`       ${grupo.padEnd(11)} ${tipo.padEnd(11)} ${fecha}  ${String(actividad).padEnd(26)} ${String(v.si).padStart(3)} / ${String(v.no).padStart(3)} / ${String(v.nulo).padStart(3)}`);
    }
  }

  // Cada fila que NO se guarda con el nombre de su columna del Excel. Es lo que
  // evita la doble fila para una misma actividad, y conviene verlo: si un día
  // aparece un renombre que no tiene sentido, la casilla se está resolviendo mal.
  if (RENOMBRES_APLICADOS.size) {
    console.log(`\n  Actividades que se guardan con el nombre que YA tenían (no se duplican):`);
    for (const [k, n] of [...RENOMBRES_APLICADOS].sort()) console.log(`       ${k}  (${n})`);
  }

  // Mapeo de las columnas de observaciones. Se imprime siempre: es la única
  // forma de notar a tiempo que la matriz cambió de layout y que las excusas
  // están cayendo en la actividad equivocada.
  console.log(`\n  Excusas / observaciones — a qué actividad quedó cada columna:`);
  for (const [k, v] of [...OBS_MAPEO].sort()) {
    const [hoja, col] = k.split('|');
    console.log(`       ${hoja.replace(/^Seguimiento progreso /, '')} · "${col}" → ${v.actividad}  (${v.n})`);
  }
  if (OBS_HUERFANAS.size) {
    console.log(`  ⚠️  Columnas de observación que no se pudieron ubicar:`);
    for (const [k, n] of OBS_HUERFANAS) console.log(`       ${k.replace('|', ' · ')}  (${n})`);
  }

  if (SESIONES_DESCARTADAS.length) {
    console.log(`\n  Celdas de sesión descartadas (el grupo destino no tuvo sesión ese día): ${SESIONES_DESCARTADAS.length}`);
    for (const s of SESIONES_DESCARTADAS) {
      console.log(`       • ${s.name} · "${s.actividad}" de la hoja ${s.deHoja} → en esa fecha era ${s.aGrupo}`);
    }
  }
  if (plan.sinCandidato.length) {
    console.log(`  ⚠️  En hoja pero SIN candidato en BD:      ${plan.sinCandidato.length}`);
    plan.sinCandidato.forEach(p => console.log(`       • ${p.doc} ${p.name} ${p.email}`));
  }

  const transiciones = plan.updateEnrollments.filter(u => u.custom.cambio_nivel && u.custom.cambio_nivel !== 'Sin cambio');
  console.log(`\n  Transiciones detectadas: ${transiciones.length}`);
  const tg = {}; transiciones.forEach(t => tg[t.custom.cambio_nivel] = (tg[t.custom.cambio_nivel] || 0) + 1);
  Object.entries(tg).forEach(([k, v]) => console.log(`       ${v}\t${k}`));

  if (!COMMIT) {
    console.log(`\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n`);
    return;
  }

  // ── Escritura ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(70)}\n  ESCRIBIENDO EN SUPABASE...\n${'─'.repeat(70)}`);

  // 1. Crear enrollments Activación
  for (const ins of plan.insertEnrollments) {
    const { error } = await supabase.from('program_enrollments').insert({
      cohort_id: cohortId, candidate_id: ins.candidateId, status: ins.status,
      custom_form_data: ins.custom, attendance_percentage: ins.attendance_percentage, enrolled_at: new Date().toISOString(),
    });
    if (error) console.warn(`   ⚠️ insert ${ins.doc}: ${error.message}`);
  }
  console.log(`   ✅ ${plan.insertEnrollments.length} enrollments de Activación creados`);

  // 2. Actualizar enrollments (activos)
  let upd = 0;
  for (const u of plan.updateEnrollments) {
    const { error } = await supabase.from('program_enrollments')
      .update({ custom_form_data: u.custom, attendance_percentage: u.attendance_percentage, status: u.status })
      .eq('id', u.id);
    if (error) console.warn(`   ⚠️ update ${u.candidateId}: ${error.message}`); else upd++;
  }
  console.log(`   ✅ ${upd} enrollments actualizados`);

  // 3. Inactivos (elegidos)
  let ina = 0;
  for (const x of inactivos) {
    const { error } = await supabase.from('program_enrollments')
      .update({ custom_form_data: x.custom, status: 'inactive' }).eq('id', x.id);
    if (error) console.warn(`   ⚠️ inactivo ${x.doc}: ${error.message}`); else ina++;
  }
  console.log(`   ✅ ${ina} marcados inactivos (elegidos)`);

  // 3b. Nunca elegidos → elegido:false (excluidos de Formación)
  let nel = 0;
  for (const x of noElegidos) {
    const { error } = await supabase.from('program_enrollments')
      .update({ custom_form_data: x.custom, status: 'inactive' }).eq('id', x.id);
    if (error) console.warn(`   ⚠️ noElegido ${x.doc}: ${error.message}`); else nel++;
  }
  console.log(`   ✅ ${nel} marcados como NO elegidos (excluidos)`);

  // 4. session_attendance (si la tabla existe)
  const { error: tableErr } = await supabase.from('session_attendance').select('id', { head: true, count: 'exact' });
  if (tableErr) {
    console.log(`\n   ⚠️  Tabla session_attendance NO existe todavía — omito la carga de asistencia detallada.`);
    console.log(`       Ejecuta scripts/migracion_session_attendance.sql en el SQL Editor y vuelve a correr con --commit.`);
  } else {
    // Upsert NO destructivo (por la clave única): actualiza/inserta sin borrar.
    // No incluye `evento_id`, así que preserva los vínculos y la asistencia
    // capturada desde la app (Fase 2). Ya no hace delete del cohort completo.
    for (let i = 0; i < plan.attendanceRows.length; i += 200) {
      const batch = plan.attendanceRows.slice(i, i + 200);
      const { error } = await supabase
        .from('session_attendance')
        .upsert(batch, { onConflict: 'cohort_id,candidate_id,grupo,tipo,actividad' });
      if (error) console.warn(`   ⚠️ asistencia batch ${i}: ${error.message}`);
    }
    console.log(`   ✅ ${plan.attendanceRows.length} filas de asistencia upsertadas (no destructivo)`);
  }

  console.log(`\n🎉 Carga completada.\n`);
}

main().catch(err => { console.error('\n❌ Error:', err.message); process.exit(1); });
