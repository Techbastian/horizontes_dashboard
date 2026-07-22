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
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';

const COHORT_ID = '386dcf50-e269-4b5b-b248-aaa754dbd0aa'; // Círculos de Conocimiento I
const GRUPO = 'Círculos'; // grupo único: los 263 no están subdivididos

// TODAS las sesiones del programa, no solo las que ya tienen formulario: las
// futuras necesitan sus filas creadas (con asistio=null) para que el dashboard
// sepa que existen y las pinte en gris. Sin fila, la sesión es invisible —
// "1 de 1 realizadas" en vez de "1 de 5". Es el mismo mecanismo de HS.
//
// `actividad` debe coincidir con el `codigo` del evento para que la app edite la
// misma fila al tomar asistencia desde el calendario, en vez de crear una nueva.
const COLUMNAS_FORMULARIO = {
  email: 'Correo electrónico',
  nombre: 'Nombre(s) completo(s) y apellido(s)',
  doc: 'Número de cédula de ciudadanía (o documento de identidad, sin puntos ni comas)',
};

const SESIONES = [
  {
    actividad: 'C-S01',
    fecha: '2026-07-21',
    archivo: 'Asistencia Sesión Inicial  21-07.xlsx',
    columnas: COLUMNAS_FORMULARIO,
  },
  // Sin `archivo` = aún no hay formulario. Solo se crean las filas que falten,
  // nunca se pisan las que ya tengan asistencia registrada desde la app.
  { actividad: 'C-S02', fecha: '2026-07-29' },
  { actividad: 'C-S03', fecha: '2026-08-06' },
  { actividad: 'C-S04', fecha: '2026-08-11' },
  { actividad: 'C-S05', fecha: '2026-08-18' },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    .select('candidate_id, actividad, asistio')
    .eq('cohort_id', COHORT_ID)
    .eq('grupo', GRUPO);
  if (yaErr) throw yaErr;
  const existentes = new Set((yaRegistrado || []).map((r) => `${r.actividad}|${r.candidate_id}`));

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
      // Sesión sin formulario: solo marcador de posición para las filas que falten.
      const nuevas = enrs.filter((e) => !existentes.has(`${sesion.actividad}|${e.candidate_id}`));
      console.log(`     sin formulario todavía · filas a crear: ${nuevas.length} · ya existentes: ${enrs.length - nuevas.length}`);
      for (const e of nuevas) {
        filasAEscribir.push({
          cohort_id: COHORT_ID,
          candidate_id: e.candidate_id,
          grupo: GRUPO,
          tipo: 'sesion',
          actividad: sesion.actividad,
          fecha: sesion.fecha,
          orden: null,
          asistio: null, // null = no registrado; la fecha futura la pinta en gris
          observacion: null,
          evento_id: evento?.id ?? null,
        });
      }
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
      // en una sola: el primer match manda.
      if (!presentes.has(r.e.candidate_id)) presentes.set(r.e.candidate_id, r.via);
    }

    console.log(`     filas en el formulario : ${asistentes.length}`);
    console.log(`     asistentes únicos      : ${presentes.size}`);
    console.log(`     ausentes (marcados no) : ${enrs.length - presentes.size}`);
    const via = {};
    for (const v of presentes.values()) via[v] = (via[v] || 0) + 1;
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
        observacion: null,
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
