// ============================================================================
// upload_cierre_circulos.mjs — Carga el cierre del programa Círculos de
// Conocimiento desde la hoja "Listado limpio" de la base maestra v2.
//
//   node scripts/upload_cierre_circulos.mjs            → DRY RUN (no escribe)
//   node scripts/upload_cierre_circulos.mjs --detalle  → + fila por fila
//   node scripts/upload_cierre_circulos.mjs --commit   → escribe en Supabase
//
// Escribe dos cosas:
//   1. session_attendance  — las 6 columnas de asistencia del Excel.
//   2. program_enrollments.custom_form_data — registro en plataforma, cursos,
//      total ponderado, resultado final y la decisión final derivada.
//
// ── El corrimiento de las columnas ──────────────────────────────────────────
// Los rótulos del Excel están corridos un lugar y el usuario lo confirmó
// (2026-08-27). La columna "Sesion de apertura" NO es la apertura del 21/07:
// contiene la asistencia del 29/07. Se verificó contra los formularios
// originales de Google Forms, que es una fuente independiente de la base:
//
//     columna "Sesion de apertura" (71 marcados)
//        vs formulario 21/07 → 56 coinciden, 15 marcados NO respondieron
//        vs formulario 29/07 → 70 coinciden, 1 marcado  NO respondió
//
// Los 15 son los que decidieron: si la columna fuera el 21/07 medido con otro
// criterio, tendría que ser un SUBCONJUNTO de esos 96, y no lo es.
//
// Consecuencia: la sesión del 21/07 (C-S01, 96 asistentes) NO está en este
// Excel y este script no la toca. Sus datos vienen del formulario original y
// siguen siendo los buenos.
//
// ── Por qué el 29/07 no se pisa ─────────────────────────────────────────────
// C-S02 ya está cargada desde su formulario, que es la fuente primaria (73
// asistentes). El Excel trae 71 para esa misma sesión. Pisarla perdería 3
// asistentes reales, así que va con `pisar: false` y el script solo REPORTA la
// diferencia. Si algún día se decide que manda el Excel, se cambia esa bandera.
//
// Idempotente: upsert por (cohort_id, candidate_id, grupo, tipo, actividad) y
// merge sobre custom_form_data (nunca reemplazo: se conserva lo que ya hubiera).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');
const DETALLE = process.argv.includes('--detalle');

const COHORT_ID = '386dcf50-e269-4b5b-b248-aaa754dbd0aa'; // Círculos de Conocimiento I
const GRUPO = 'Círculos'; // grupo único: los 263 no están subdivididos
const ARCHIVO = 'Base maestra circulos de conocimiento v2.xlsx';
const HOJA = 'Listado limpio';

// Columna del Excel → sesión real. El `codigo` es el del evento en el
// calendario, y es lo que va a `session_attendance.actividad` para que la app y
// el ETL escriban la misma fila (patrón de Círculos, ver CLAUDE.md).
const SESIONES = [
  { columna: 'Sesion de apertura', codigo: 'C-S02', fecha: '2026-07-29', pisar: false },
  { columna: 'mentoria 1', codigo: 'C-S03', fecha: '2026-08-06' },
  { columna: 'Mentoria 2', codigo: 'C-S04', fecha: '2026-08-11' },
  { columna: 'Mentoria 3', codigo: 'C-S06', fecha: '2026-08-14' },
  { columna: 'Mentoria 4', codigo: 'C-S05', fecha: '2026-08-18' },
  { columna: 'Sesión de cierre', codigo: 'C-S07', fecha: '2026-08-21' },
];

// `Resultado final` es una DECISIÓN del equipo, no una fórmula: los umbrales se
// solapan (hay un APROBADO con 0.450 y gente sin resultado con 0.550, y un
// RECONOCIMIENTO con 0.000). Se importa literal y de ahí se deriva la decisión;
// nunca se recalcula desde el ponderado.
const RESULTADOS = {
  'APROBADO': { decision: 'Aprobado', nota: null },
  'APROBADO - PASA A HORIZONTES': { decision: 'Aprobado', nota: 'Pasa a Horizontes Senior' },
  'RECONOCIMIENTO': {
    decision: 'Aprobado',
    nota: 'Reconocimiento por rendimiento en sesiones de mentoría',
  },
};

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

const doc = (d) => String(d ?? '').replace(/\D/g, '').replace(/^0+/, '').trim();
const mail = (e) => String(e ?? '').toLowerCase().trim();
const nom = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Los nombres vienen duplicados en varias filas ("Clara Isabel Clara Isabel
// Rodriguez Lalinde"): comparar el conjunto de palabras en vez de la cadena.
const nomSet = (s) => [...new Set(nom(s).split(' '))].filter(Boolean).sort().join(' ');
const num = (v) => (v === null || v === '' || v === undefined ? null : Number(v));

// Cascada de identidad. El Excel trae 13 documentos que no existen en la base
// (dígitos transpuestos). NO se corrigen en `candidates` —decisión del usuario:
// esa tabla la comparten los otros módulos— así que solo se usan para emparejar.
function resolver(fila, idx) {
  const d = doc(fila['Número documento']);
  if (d && idx.porDoc.has(d)) return { e: idx.porDoc.get(d), via: 'documento' };
  const m = mail(fila['Correo']);
  if (m && idx.porMail.has(m)) return { e: idx.porMail.get(m), via: 'correo' };
  const n = nomSet(fila['Nombre completo']);
  if (n && idx.porNombre.has(n)) return { e: idx.porNombre.get(n), via: 'nombre' };
  return null;
}

async function main() {
  console.log(`\n${'='.repeat(76)}`);
  console.log(`  CIERRE DE CÍRCULOS — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`  Fuente: ${ARCHIVO} · hoja "${HOJA}"`);
  console.log(`${'='.repeat(76)}`);

  const wb = XLSX.readFile(resolve(__dirname, '../bases_de_datos', ARCHIVO));
  if (!wb.Sheets[HOJA]) throw new Error(`El archivo no tiene la hoja "${HOJA}"`);
  const filas = XLSX.utils
    .sheet_to_json(wb.Sheets[HOJA], { defval: null })
    .filter((r) => String(r['Número documento'] ?? '').trim() !== '');

  const { data: enrs, error: enrErr } = await supabase
    .from('program_enrollments')
    .select('id, candidate_id, custom_form_data, candidate:candidates(email, document_number, first_name, last_name)')
    .eq('cohort_id', COHORT_ID);
  if (enrErr) throw enrErr;

  const idx = { porDoc: new Map(), porMail: new Map(), porNombre: new Map() };
  for (const e of enrs) {
    const c = e.candidate || {};
    const cf = e.custom_form_data || {};
    for (const d of [doc(c.document_number), doc(cf.cedula)]) {
      if (d && !idx.porDoc.has(d)) idx.porDoc.set(d, e);
    }
    if (c.email) idx.porMail.set(mail(c.email), e);
    const n = nomSet(cf.nombre_completo || `${c.first_name || ''} ${c.last_name || ''}`);
    if (n && !idx.porNombre.has(n)) idx.porNombre.set(n, e);
  }
  console.log(`\n  Matriculados en Círculos : ${enrs.length}`);
  console.log(`  Filas en el Excel        : ${filas.length}`);

  // ── Resolución de identidad ───────────────────────────────────────────────
  const via = {};
  const sinResolver = [];
  const resueltos = new Map(); // candidate_id → fila del Excel
  for (const f of filas) {
    const r = resolver(f, idx);
    if (!r) {
      sinResolver.push(f);
      continue;
    }
    via[r.via] = (via[r.via] || 0) + 1;
    resueltos.set(r.e.candidate_id, { fila: f, enr: r.e });
  }
  console.log(`  Resueltos por            : ${Object.entries(via).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  if (sinResolver.length) {
    console.log(`\n  ⚠️  ${sinResolver.length} fila(s) del Excel sin matrícula en Círculos:`);
    sinResolver.forEach((f) => console.log(`       ${f['Nombre completo']} · doc ${f['Número documento']} · ${f['Correo']}`));
  }
  const sinFila = enrs.filter((e) => !resueltos.has(e.candidate_id));
  if (sinFila.length) {
    console.log(`\n  ⚠️  ${sinFila.length} matrícula(s) sin fila en el Excel (no se tocan):`);
    sinFila.forEach((e) => console.log(`       ${e.candidate?.first_name} ${e.candidate?.last_name} · doc ${e.candidate?.document_number}`));
  }

  // ── Asistencia ────────────────────────────────────────────────────────────
  // Paginado de 1000 en 1000: PostgREST no devuelve más aunque se pidan todas, y
  // con 7 sesiones × 263 personas la tabla ya pasa de 1.800 filas. Sin paginar,
  // el resumen de "nuevas / difieren" que imprime este script sale mal —lo que
  // convierte la verificación previa al --commit en algo que no se puede creer.
  const previas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error: pErr } = await supabase
      .from('session_attendance')
      .select('candidate_id, actividad, asistio')
      .eq('cohort_id', COHORT_ID)
      .eq('grupo', GRUPO)
      .range(desde, desde + 999);
    if (pErr) throw pErr;
    previas.push(...data);
    if (data.length < 1000) break;
  }
  const yaHay = new Map(previas.map((r) => [`${r.actividad}|${r.candidate_id}`, r.asistio]));

  const { data: eventos, error: evErr } = await supabase
    .from('eventos')
    .select('id, codigo, nombre')
    .eq('cohort_id', COHORT_ID)
    .in('codigo', SESIONES.map((s) => s.codigo));
  if (evErr) throw evErr;
  const porCodigo = new Map((eventos || []).map((e) => [e.codigo, e]));

  console.log(`\n  ── ASISTENCIA ${'─'.repeat(60)}`);
  const filasAsistencia = [];
  for (const s of SESIONES) {
    const ev = porCodigo.get(s.codigo);
    if (!ev) throw new Error(`Falta el evento ${s.codigo} en el calendario. Corre upload_eventos_circulos.mjs primero.`);

    let si = 0, no = 0, cambios = 0, nuevos = 0;
    const difs = [];
    for (const [candidate_id, { fila, enr }] of resueltos) {
      const asistio = fila[s.columna] === 1 || fila[s.columna] === '1';
      if (asistio) si++; else no++;
      const anterior = yaHay.get(`${s.codigo}|${candidate_id}`);
      if (anterior === undefined) nuevos++;
      else if (anterior !== asistio) {
        cambios++;
        difs.push(`${enr.candidate?.first_name} ${enr.candidate?.last_name}: base=${anterior ? 'sí' : 'no'} → excel=${asistio ? 'sí' : 'no'}`);
      }
      if (s.pisar === false) continue;
      filasAsistencia.push({
        cohort_id: COHORT_ID,
        candidate_id,
        grupo: GRUPO,
        tipo: 'sesion',
        actividad: s.codigo,
        fecha: s.fecha,
        // null a propósito: el orden cronológico lo resuelve el desempate por
        // fecha en src/lib/asistencia.js. Escribirlo aquí y no en la app
        // desordenaría las sesiones (ver CLAUDE.md).
        orden: null,
        asistio,
        evento_id: ev.id,
      });
    }
    const marca = s.pisar === false ? '⏭️  NO se escribe' : `${nuevos} nuevas`;
    console.log(`\n  ${s.codigo} · ${s.fecha} · "${s.columna}" → ${ev.nombre}`);
    console.log(`     asistió=${si}  no=${no}  ·  ${marca}${cambios ? ` · ${cambios} difieren de la base` : ''}`);
    if (s.pisar === false) {
      console.log(`     (la fuente primaria es el formulario del ${s.fecha.slice(8)}/${s.fecha.slice(5, 7)}; el Excel trae ${si} y la base ${[...yaHay].filter(([k, v]) => k.startsWith(`${s.codigo}|`) && v === true).length})`);
    }
    if (difs.length && DETALLE) difs.forEach((d) => console.log(`       · ${d}`));
    else if (difs.length) console.log(`       (corre con --detalle para ver quiénes)`);
  }

  // ── Matrículas: registro, cursos, ponderado y decisión ────────────────────
  console.log(`\n  ── MATRÍCULAS ${'─'.repeat(59)}`);
  const ACT = SESIONES.map((s) => s.columna);
  const updates = [];
  const conteoDecision = {};
  const conteoResultado = {};
  let cambiaRegistro = 0;

  for (const [candidate_id, { fila, enr }] of resueltos) {
    const cf = enr.custom_form_data || {};
    const registrado = String(fila['Estado'] ?? '').trim() === 'Registrado';
    const cursosCompletos = num(fila['N cursos completos']);
    const cursosEnProgreso = num(fila['Cursos en progreso']);
    const ponderado = num(fila['Total ponderado']) ?? 0;
    const resultado = String(fila['Resultado final'] ?? '').trim() || null;

    // Sin resultado explícito: "No evaluado" solo si no hay NINGUNA señal de
    // participación. Quien se registró, completó algún curso o asistió aunque
    // fuera una vez sí fue evaluado y quedó por debajo → "No aprobado".
    // (Decisión del usuario, 2026-08-27: da 144 no evaluados y 91 no aprobados.)
    let decision, nota;
    if (resultado && RESULTADOS[resultado]) {
      ({ decision, nota } = RESULTADOS[resultado]);
    } else if (resultado) {
      throw new Error(`Resultado final desconocido en el Excel: "${resultado}" (${fila['Nombre completo']})`);
    } else {
      const hayActividad = registrado || (cursosCompletos ?? 0) > 0 || ACT.some((c) => fila[c] === 1);
      decision = hayActividad ? 'No aprobado' : 'No evaluado';
      nota = null;
    }
    conteoDecision[decision] = (conteoDecision[decision] || 0) + 1;
    conteoResultado[resultado ?? '(sin resultado)'] = (conteoResultado[resultado ?? '(sin resultado)'] || 0) + 1;
    if ((cf.estado_activo !== false) !== registrado) cambiaRegistro++;

    updates.push({
      id: enr.id,
      candidate_id,
      nombre: `${enr.candidate?.first_name ?? ''} ${enr.candidate?.last_name ?? ''}`.trim(),
      decision,
      custom_form_data: {
        ...cf,
        // En Círculos `estado_activo` significa "registrado en la plataforma
        // Learning to Earning", no "sigue en el programa" (ver CLAUDE.md).
        registro_plataforma: registrado,
        estado_activo: registrado,
        cierre: {
          registro_plataforma: registrado,
          cursos_completos: cursosCompletos,
          cursos_en_progreso: cursosEnProgreso,
          // El ponderado y el resultado se importan TAL CUAL: son el cálculo
          // oficial con el que se decidió quién aprobaba. El dashboard los
          // muestra, no los recalcula.
          total_ponderado: ponderado,
          resultado_final: resultado,
          decision_final: decision,
          nota,
          fuente: `${ARCHIVO} · ${HOJA}`,
        },
      },
    });
  }

  console.log(`\n  Resultado final del Excel:`);
  Object.entries(conteoResultado)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`     ${String(k).padEnd(30)} ${n}`));
  console.log(`\n  Decisión final derivada:`);
  Object.entries(conteoDecision)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`     ${k.padEnd(30)} ${n}`));
  console.log(`\n  Registro en plataforma   : ${updates.filter((u) => u.custom_form_data.registro_plataforma).length} registrados · ${cambiaRegistro} cambian respecto a la base`);
  console.log(`  Con cursos completos     : ${updates.filter((u) => (u.custom_form_data.cierre.cursos_completos ?? 0) > 0).length}`);

  if (DETALLE) {
    console.log(`\n  ── DETALLE de los aprobados ──`);
    updates
      .filter((u) => u.decision === 'Aprobado')
      .sort((a, b) => b.custom_form_data.cierre.total_ponderado - a.custom_form_data.cierre.total_ponderado)
      .forEach((u) => {
        const c = u.custom_form_data.cierre;
        console.log(`     ${(c.total_ponderado * 100).toFixed(1).padStart(6)}%  cursos=${String(c.cursos_completos ?? '-').padStart(3)}  ${c.resultado_final.padEnd(30)} ${u.nombre}${c.nota ? ` · ${c.nota}` : ''}`);
      });
  }

  console.log(`\n  ${'─'.repeat(72)}`);
  console.log(`  A escribir: ${filasAsistencia.length} filas de asistencia · ${updates.length} matrículas`);

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  for (let i = 0; i < filasAsistencia.length; i += 200) {
    const { error } = await supabase
      .from('session_attendance')
      .upsert(filasAsistencia.slice(i, i + 200), {
        onConflict: 'cohort_id,candidate_id,grupo,tipo,actividad',
      });
    if (error) throw error;
  }
  console.log(`\n✅ ${filasAsistencia.length} filas de asistencia escritas.`);

  // Una por una: cada custom_form_data es distinto y un upsert masivo exigiría
  // reenviar el resto de columnas de la fila.
  let n = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('program_enrollments')
      .update({ custom_form_data: u.custom_form_data })
      .eq('id', u.id);
    if (error) throw new Error(`${u.nombre}: ${error.message}`);
    if (++n % 50 === 0) console.log(`   ... ${n}/${updates.length}`);
  }
  console.log(`✅ ${updates.length} matrículas actualizadas.\n`);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
