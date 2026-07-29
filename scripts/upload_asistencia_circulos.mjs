// ============================================================================
// upload_asistencia_circulos.mjs — Carga la asistencia a las sesiones de
// Círculos de Conocimiento desde los formularios de registro (Google Forms).
//
//   node scripts/upload_asistencia_circulos.mjs            → DRY RUN (no escribe)
//   node scripts/upload_asistencia_circulos.mjs --commit   → escribe en Supabase
//
// El formulario solo lista a QUIENES ASISTIERON. Los demás matriculados se
// marcan explícitamente en false: para esa sesión el dato es definitivo, no es
// "sin registrar" (null). Esa distinción es la que hace que los % del dashboard
// cuenten la sesión en el denominador.
//
// La identidad NO se resuelve por documento a secas: el formulario trae cédulas
// mal digitadas (Walter Duque y Wilson Bedoya se registraron dos veces, con un
// dígito distinto entre envíos). Cascada: documento → correo → nombre normalizado.
//
// Idempotente: upsert por (cohort_id, candidate_id, grupo, tipo, actividad).
// Se puede re-correr sin duplicar; vuelve a pisar los mismos valores.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');


const COHORT_ID = '386dcf50-e269-4b5b-b248-aaa754dbd0aa'; // Círculos de Conocimiento I
const GRUPO = 'Círculos'; // grupo único: los 263 no están subdivididos

// Van TODAS las sesiones del programa, pero de las que aún no tienen formulario
// no se escribe ninguna fila: qué sesiones existen lo define el CALENDARIO, así
// que basta con que el evento esté cargado (upload_eventos_circulos.mjs) para
// que el dashboard las pinte en gris. Listarlas aquí sirve para ver el estado de
// cada una en el resumen y para saber dónde va el próximo archivo.
//
// `actividad` debe coincidir con el `codigo` del evento para que la app edite la
// misma fila al tomar asistencia desde el calendario, en vez de crear una nueva.
// Los encabezados los pone quien arma el formulario en Google Forms y CAMBIAN de
// una sesión a otra (la del 29/07 no reutilizó el formulario del 21/07: "Correo
// electrónico" pasó a "Dirección de correo electrónico", etc.). Por eso cada
// sesión declara los suyos y nunca se leen por posición.
const COLUMNAS_SESION_INICIAL = {
  email: 'Correo electrónico',
  nombre: 'Nombre(s) completo(s) y apellido(s)',
  doc: 'Número de cédula de ciudadanía (o documento de identidad, sin puntos ni comas)',
};

// A partir de las mentorías el formulario pregunta además qué necesita cada
// quien; esa respuesta va a session_attendance.observacion, que es donde el
// dashboard busca las notas por actividad (perfil, informe de retiros, PDF).
const COLUMNAS_MENTORIA = {
  email: 'Dirección de correo electrónico',
  nombre: 'Nombre completo y apellidos',
  doc: 'Número de documento de identidad',
  observacion: '¿Hay algo urgente que tu mentor deba saber hoy para apoyarte mejor?',
};

const SESIONES = [
  {
    actividad: 'C-S01',
    fecha: '2026-07-21',
    archivo: 'Asistencia Sesión Inicial  21-07.xlsx',
    columnas: COLUMNAS_SESION_INICIAL,
  },
  {
    actividad: 'C-S02',
    fecha: '2026-07-29',
    archivo: 'Asistencia sesion 29-07-2026.xlsx',
    columnas: COLUMNAS_MENTORIA,
  },
  // Sin `archivo` = aún no hay formulario, y no se escribe nada: la sesión ya
  // está en el calendario, que es lo que la hace existir para el dashboard.
  { actividad: 'C-S03', fecha: '2026-08-06' },
  { actividad: 'C-S04', fecha: '2026-08-11' },
  { actividad: 'C-S05', fecha: '2026-08-18' },
];

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

const doc = (d) => String(d ?? '').replace(/\D/g, '').trim();
const mail = (e) => String(e ?? '').toLowerCase().trim();
const nom = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function leerFormulario(sesion) {
  const ruta = resolve(__dirname, '../bases_de_datos', sesion.archivo);
  const wb = XLSX.readFile(ruta);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  return filas.map((f) => ({
    email: mail(f[sesion.columnas.email]),
    nombre: String(f[sesion.columnas.nombre] ?? '').trim(),
    doc: doc(f[sesion.columnas.doc]),
    // Opcional: no todos los formularios la preguntan.
    observacion: sesion.columnas.observacion
      ? String(f[sesion.columnas.observacion] ?? '').trim()
      : '',
  }));
}

// Cascada de identidad. Devuelve el enrollment o null.
function resolver(asistente, indices) {
  if (asistente.doc && indices.porDoc.has(asistente.doc)) {
    return { e: indices.porDoc.get(asistente.doc), via: 'documento' };
  }
  if (asistente.email && indices.porMail.has(asistente.email)) {
    return { e: indices.porMail.get(asistente.email), via: 'correo' };
  }
  const n = nom(asistente.nombre);
  if (n && indices.porNombre.has(n)) {
    return { e: indices.porNombre.get(n), via: 'nombre' };
  }
  return null;
}

async function main() {
  console.log(`\n${'='.repeat(74)}`);
  console.log(`  ASISTENCIA DE CÍRCULOS — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`${'='.repeat(74)}`);

  // Matrículas del programa (los 263). Son el universo: quien no esté aquí no
  // puede tener asistencia, porque session_attendance apunta a un candidate_id.
  const { data: enrs, error: enrErr } = await supabase
    .from('program_enrollments')
    .select('candidate_id, custom_form_data, candidate:candidates(id, email, document_number, first_name, last_name)')
    .eq('cohort_id', COHORT_ID);
  if (enrErr) throw enrErr;

  const indices = { porDoc: new Map(), porMail: new Map(), porNombre: new Map() };
  for (const e of enrs) {
    const c = e.candidate || {};
    const cf = e.custom_form_data || {};
    const d1 = doc(c.document_number);
    const d2 = doc(cf.cedula);
    if (d1) indices.porDoc.set(d1, e);
    if (d2 && !indices.porDoc.has(d2)) indices.porDoc.set(d2, e);
    if (c.email) indices.porMail.set(mail(c.email), e);
    const n = nom(cf.nombre_completo || `${c.first_name || ''} ${c.last_name || ''}`);
    if (n) indices.porNombre.set(n, e);
  }
  console.log(`\n  Matriculados en Círculos: ${enrs.length}`);

  // Lo ya registrado, para no pisar asistencia capturada desde la app en las
  // sesiones que aquí solo llevan marcador de posición.
  const { data: yaRegistrado, error: yaErr } = await supabase
    .from('session_attendance')
    .select('candidate_id, actividad, asistio, observacion')
    .eq('cohort_id', COHORT_ID)
    .eq('grupo', GRUPO);
  if (yaErr) throw yaErr;
  const existentes = new Set((yaRegistrado || []).map((r) => `${r.actividad}|${r.candidate_id}`));
  // Observaciones ya guardadas: si el formulario no trae una, se conserva la que
  // haya (puede venir de la app), en vez de pisarla con null al re-correr.
  const obsPrevia = new Map(
    (yaRegistrado || [])
      .filter((r) => String(r.observacion || '').trim())
      .map((r) => [`${r.actividad}|${r.candidate_id}`, r.observacion])
  );

  const filasAEscribir = [];
  const sinResolver = [];

  for (const sesion of SESIONES) {
    // El evento da el `evento_id`, que enlaza la asistencia con el calendario.
    const { data: evento } = await supabase
      .from('eventos')
      .select('id, nombre')
      .eq('cohort_id', COHORT_ID)
      .eq('codigo', sesion.actividad)
      .maybeSingle();

    const etiquetaEvento = evento ? `(evento: ${evento.nombre})` : '⚠️ sin evento en el calendario';
    console.log(`\n  ── ${sesion.actividad} · ${sesion.fecha} ${etiquetaEvento}`);

    if (!sesion.archivo) {
      // Sin formulario no hay nada que escribir. NO se crean filas de relleno: la
      // sesión ya existe para el dashboard porque está en el calendario, y una
      // fila con asistio=null no aporta ningún dato (ver la regla de
      // "ocurridas vs pendientes" en CLAUDE.md). Llegó a haber 1.052 filas así.
      const previas = enrs.filter((e) => existentes.has(`${sesion.actividad}|${e.candidate_id}`)).length;
      console.log(`     sin formulario todavía · no se escribe nada${previas ? ` · ${previas} filas ya existen` : ''}`);
      continue;
    }

    const asistentes = leerFormulario(sesion);
    const presentes = new Map(); // candidate_id → cómo se resolvió

    for (const a of asistentes) {
      const r = resolver(a, indices);
      if (!r) {
        sinResolver.push({ ...a, sesion: sesion.actividad });
        continue;
      }
      // Varias filas de la misma persona (envió el formulario dos veces) colapsan
      // en una sola: el primer match manda. La observación es la excepción — si
      // el primer envío vino vacío y el segundo trae texto, se queda el texto.
      const previo = presentes.get(r.e.candidate_id);
      if (!previo) {
        presentes.set(r.e.candidate_id, { via: r.via, observacion: a.observacion });
      } else if (!previo.observacion && a.observacion) {
        previo.observacion = a.observacion;
      }
    }

    const conObservacion = [...presentes.values()].filter((p) => p.observacion).length;
    console.log(`     filas en el formulario : ${asistentes.length}`);
    console.log(`     asistentes únicos      : ${presentes.size}`);
    console.log(`     ausentes (marcados no) : ${enrs.length - presentes.size}`);
    if (sesion.columnas.observacion) {
      console.log(`     con observación        : ${conObservacion}`);
    }
    const via = {};
    for (const v of presentes.values()) via[v.via] = (via[v.via] || 0) + 1;
    console.log(`     resueltos por          : ${Object.entries(via).map(([k, n]) => `${k} ${n}`).join(' · ')}`);

    for (const e of enrs) {
      filasAEscribir.push({
        cohort_id: COHORT_ID,
        candidate_id: e.candidate_id,
        grupo: GRUPO,
        tipo: 'sesion',
        actividad: sesion.actividad,
        fecha: sesion.fecha,
        // `orden` se deja en null a propósito: la app tampoco lo escribe al tomar
        // asistencia desde el calendario, y el cálculo desempata por fecha
        // (ver porOrden en src/lib/asistencia.js). Ponerlo aquí y no allá haría
        // que las sesiones futuras se ordenaran antes que esta.
        orden: null,
        asistio: presentes.has(e.candidate_id),
        // Lo que respondió en el formulario; si no respondió, lo que ya hubiera.
        observacion:
          presentes.get(e.candidate_id)?.observacion ||
          obsPrevia.get(`${sesion.actividad}|${e.candidate_id}`) ||
          null,
        evento_id: evento?.id ?? null,
      });
    }
  }

  if (sinResolver.length) {
    console.log(`\n  ⚠️  ${sinResolver.length} registro(s) del formulario NO corresponden a nadie matriculado:`);
    sinResolver.forEach((s) => console.log(`       ${s.nombre} · doc ${s.doc} · ${s.email}`));
    console.log(`     No se cargan: session_attendance exige un candidate_id existente.`);
    console.log(`     Si asistieron de verdad, hay que matricularlos primero en el programa.`);
  }

  console.log(`\n  Total de filas a escribir: ${filasAEscribir.length}`);

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  for (let i = 0; i < filasAEscribir.length; i += 200) {
    const lote = filasAEscribir.slice(i, i + 200);
    const { error } = await supabase
      .from('session_attendance')
      .upsert(lote, { onConflict: 'cohort_id,candidate_id,grupo,tipo,actividad' });
    if (error) throw error;
  }
  console.log(`\n✅ ${filasAEscribir.length} filas de asistencia cargadas.\n`);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
