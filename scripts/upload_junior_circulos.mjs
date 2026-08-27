// ============================================================================
// upload_junior_circulos.mjs — Matricula en Horizontes Senior, grupo
// "Junior x Círculos", a quienes aprobaron Círculos de Conocimiento.
//
//   node scripts/upload_junior_circulos.mjs            → DRY RUN (no escribe)
//   node scripts/upload_junior_circulos.mjs --commit   → escribe en Supabase
//
// Fuente: hoja "Seguimiento Junior 2" de la matriz maestra de HS. Son 15
// personas y las 15 vienen de Círculos (los 12 "APROBADO - PASA A HORIZONTES"
// más 3 de los 4 "RECONOCIMIENTO").
//
// ── Qué escribe y qué NO ────────────────────────────────────────────────────
// Escribe la matrícula y la asistencia al Café 4 (26/08), que es lo único que
// ya ocurrió: 14 de los 15 asistieron. NO crea eventos —el Café 4 ya existe
// como evento Compartido— ni carga las tres sesiones de la hoja (27/08, 31/08,
// 01/09), que están todas en 0 y de las que el grupo tendrá además versiones
// propias los martes, aún sin definir.
//
// El Café 4 NO es opcional aunque parezca un detalle: `inicioPorGrupo` en
// src/lib/asistencia.js saca la fecha de corte de un grupo del primer registro
// que tenga, y un grupo SIN registros no tiene corte, así que se le esperan
// todas las actividades del calendario. Como los cafés son eventos Compartido y
// se desdoblan en todos los grupos, sin esta carga el grupo aparecía debiendo
// los cafés 1 (21/05), 2 (23/06) y 3 (23/07) —de antes de que existiera— y los
// tres salían en el aviso de "sesiones sin asistencia cargada" de /formacion.
// Con el Café 4 escrito, el corte queda en el 26/08 y los tres anteriores caen
// solos.
//
// NO toca `candidates`: las 15 personas ya existen ahí desde Círculos. NO toca
// su matrícula de Círculos, que se conserva como el histórico de ese programa
// —es el mismo patrón con el que ya conviven los dos programas—.
//
// ── Por qué grupo propio y no "Junior" a secas ──────────────────────────────
// Tienen sesiones propias. Si esas sesiones fueran eventos de Junior, el
// calendario se las exigiría también a los 66 Junior de hoy, que no las
// tuvieron, y les hundiría el porcentaje. Con grupo propio solo se les pide lo
// suyo. En los KPI del tablero sí cuentan como Junior: eso lo resuelve
// `rutaKPI` en src/lib/eventos.js, no este script.
//
// Idempotente: reutiliza la matrícula de HS si la persona ya tenía una (el caso
// de Nancy Restrepo, que arrastraba un enrollment con `elegido:false` de la
// selección original) y hace merge sobre `custom_form_data`.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const COHORT_HS = '3e8e4b55-b201-4a4e-90ae-ca5dab1c50e0';
const COHORT_CIRCULOS = '386dcf50-e269-4b5b-b248-aaa754dbd0aa';
const GRUPO = 'Junior x Círculos';
const ARCHIVO = 'Horizontes_Senior_Matriz_Maestra_VF.xlsx';
const HOJA = 'Seguimiento Junior 2';

// Fecha de ingreso al grupo. Es la del Café 4, no la de su primera sesión
// (27/08): 14 de los 15 asistieron a ese café y es su primera actividad real en
// Horizontes. El `desde` de la fase corta hacia atrás —ver `faseCubre` en
// src/lib/asistencia.js—, así que ponerlo en el 27 dejaría el café fuera.
const FECHA_INGRESO = '2026-08-26';

// El único café ya ocurrido para este grupo. Los 5 y 6 (24/09 y 22/10) están en
// la hoja con ceros, pero son marcadores de una actividad futura: guardarlos como
// "no asistió" haría que el día que lleguen cuenten como que faltaron todos.
const CAFE = { codigo: 'C4', columna: 'Café 4', observacion: 'Observaciones cafe 4', fecha: '2026-08-26' };

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);
const doc = (d) => String(d ?? '').replace(/\D/g, '').replace(/^0+/, '').trim();

async function main() {
  console.log(`\n${'='.repeat(74)}`);
  console.log(`  ${GRUPO.toUpperCase()} — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`  Fuente: ${ARCHIVO} · hoja "${HOJA}"`);
  console.log(`${'='.repeat(74)}\n`);

  const wb = XLSX.readFile(resolve(__dirname, '../bases_de_datos', ARCHIVO));
  if (!wb.Sheets[HOJA]) throw new Error(`El archivo no tiene la hoja "${HOJA}"`);
  const filas = XLSX.utils
    .sheet_to_json(wb.Sheets[HOJA], { defval: null })
    .filter((r) => String(r['Número de Documento'] ?? '').trim() !== '');

  // Los 15 se identifican contra su matrícula de Círculos, que es de donde
  // vienen: ahí está su candidate_id y el cierre del programa.
  const { data: circ, error: cErr } = await supabase
    .from('program_enrollments')
    .select('candidate_id, custom_form_data, candidate:candidates(id, document_number, first_name, last_name, email)')
    .eq('cohort_id', COHORT_CIRCULOS);
  if (cErr) throw cErr;
  const porDoc = new Map();
  for (const e of circ) {
    for (const d of [doc(e.candidate?.document_number), doc(e.custom_form_data?.cedula)]) {
      if (d && !porDoc.has(d)) porDoc.set(d, e);
    }
  }

  // Matrículas y postulaciones que ya existan en HS, para reutilizar en vez de duplicar.
  const { data: hsEn, error: hErr } = await supabase
    .from('program_enrollments')
    .select('id, candidate_id, custom_form_data, status')
    .eq('cohort_id', COHORT_HS);
  if (hErr) throw hErr;
  const matriculaDe = new Map(hsEn.map((e) => [e.candidate_id, e]));

  const { data: apps, error: aErr } = await supabase
    .from('project_applications')
    .select('id, candidate_id')
    .eq('cohort_id', COHORT_HS);
  if (aErr) throw aErr;
  const appDe = new Map(apps.map((a) => [a.candidate_id, a.id]));

  const inserts = [], updates = [], sinResolver = [];
  for (const r of filas) {
    const cir = porDoc.get(doc(r['Número de Documento']));
    if (!cir) { sinResolver.push(r); continue; }
    const candidateId = cir.candidate.id;
    const previa = matriculaDe.get(candidateId);
    const cf = previa?.custom_form_data || {};
    const cierre = cir.custom_form_data?.cierre || null;

    const custom = {
      ...cf,
      elegido: true,
      estado_activo: true,
      ruta_asignada: GRUPO,
      ruta_inicial: GRUPO,
      // Una sola fase abierta con la fecha de ingreso. Es lo que evita que se
      // les cuente como ausencia todo el calendario de Junior anterior al 26/08.
      historial_ruta: [
        { ruta: GRUPO, desde: FECHA_INGRESO, hasta: null, motivo: 'Ingresó desde Círculos de Conocimiento' },
      ],
      nombre_completo: cir.custom_form_data?.nombre_completo
        || `${cir.candidate.first_name || ''} ${cir.candidate.last_name || ''}`.trim(),
      cedula: cir.candidate.document_number || String(r['Número de Documento']),
      origen: 'circulos-de-conocimiento',
      // El resultado con el que llegaron, para no tener que cruzar programas
      // cada vez que alguien pregunte por qué están aquí.
      cierre_circulos: cierre
        ? { resultado_final: cierre.resultado_final, total_ponderado: cierre.total_ponderado }
        : null,
    };

    const fila = {
      candidateId,
      nombre: custom.nombre_completo,
      resultado: cierre?.resultado_final ?? '—',
      custom,
    };
    if (previa) {
      updates.push({ ...fila, id: previa.id, antes: `elegido=${cf.elegido} ruta=${cf.ruta_asignada ?? '-'} activo=${cf.estado_activo}` });
    } else {
      inserts.push({ ...fila, application_id: appDe.get(candidateId) ?? null });
    }
  }

  if (sinResolver.length) {
    console.log(`  ⚠️  ${sinResolver.length} fila(s) sin matrícula en Círculos:`);
    sinResolver.forEach((r) => console.log(`       ${r['Nombre Completo']} · ${r['Número de Documento']}`));
  }

  console.log(`  Matrículas NUEVAS en Horizontes Senior: ${inserts.length}`);
  inserts.forEach((i) => console.log(`     + ${i.nombre.slice(0, 34).padEnd(35)} ${i.resultado}${i.application_id ? '  (con postulación)' : ''}`));
  console.log(`\n  Matrículas REUTILIZADAS: ${updates.length}`);
  updates.forEach((u) => console.log(`     ~ ${u.nombre.slice(0, 34).padEnd(35)} ${u.resultado}\n         antes: ${u.antes}`));
  console.log(`\n  Todas quedan: ruta="${GRUPO}" · elegido=true · estado_activo=true · fase desde ${FECHA_INGRESO}`);

  // ── Asistencia al Café 4 ──────────────────────────────────────────────────
  // Se reusa el nombre de actividad que ya tienen los otros grupos para ese
  // mismo evento ("Café 4"), que es también el que reutilizaría la app al tomar
  // asistencia desde el calendario. Así el Excel y la app escriben la misma fila.
  const { data: eventoCafe } = await supabase
    .from('eventos').select('id, nombre, fecha_hora_inicio')
    .eq('cohort_id', COHORT_HS).eq('codigo', CAFE.codigo).maybeSingle();
  if (!eventoCafe) throw new Error(`No existe el evento ${CAFE.codigo} en el calendario de HS.`);

  const { data: previasCafe } = await supabase
    .from('session_attendance').select('actividad')
    .eq('cohort_id', COHORT_HS).eq('tipo', 'cafe').eq('fecha', CAFE.fecha).limit(1);
  const actividadCafe = previasCafe?.[0]?.actividad || CAFE.codigo;

  const filasCafe = [];
  for (const r of filas) {
    const cir = porDoc.get(doc(r['Número de Documento']));
    if (!cir) continue;
    filasCafe.push({
      cohort_id: COHORT_HS,
      candidate_id: cir.candidate.id,
      grupo: GRUPO,
      tipo: 'cafe',
      actividad: actividadCafe,
      fecha: CAFE.fecha,
      orden: null,
      asistio: r[CAFE.columna] === 1 || r[CAFE.columna] === '1',
      observacion: String(r[CAFE.observacion] ?? '').trim() || null,
      evento_id: eventoCafe.id,
    });
  }
  const si = filasCafe.filter((f) => f.asistio).length;
  console.log(`\n  Asistencia al ${CAFE.columna} (${CAFE.fecha}) → actividad "${actividadCafe}" · ${eventoCafe.nombre}`);
  console.log(`     asistió=${si}  no=${filasCafe.length - si}  ·  ${filasCafe.filter((f) => f.observacion).length} con observación`);
  console.log(`  Cafés 5 y 6 no se cargan: aún no ocurren (los ceros de la hoja son marcador, no dato).`);
  console.log(`  Las 3 sesiones de la hoja tampoco: están en 0 y no tienen evento en el calendario.`);

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  if (inserts.length) {
    // `id` se omite: es bigint generated always as identity y pasarle un valor falla.
    const { error } = await supabase.from('program_enrollments').insert(
      inserts.map((i) => ({
        cohort_id: COHORT_HS,
        candidate_id: i.candidateId,
        application_id: i.application_id,
        status: 'active',
        custom_form_data: i.custom,
        enrolled_at: FECHA_INGRESO,
      }))
    );
    if (error) throw error;
    console.log(`\n✅ ${inserts.length} matrículas creadas.`);
  }
  for (const u of updates) {
    const { error } = await supabase
      .from('program_enrollments')
      .update({ custom_form_data: u.custom, status: 'active' })
      .eq('id', u.id);
    if (error) throw new Error(`${u.nombre}: ${error.message}`);
  }
  if (updates.length) console.log(`✅ ${updates.length} matrículas reutilizadas.`);

  const { error: caErr } = await supabase
    .from('session_attendance')
    .upsert(filasCafe, { onConflict: 'cohort_id,candidate_id,grupo,tipo,actividad' });
  if (caErr) throw caErr;
  console.log(`✅ ${filasCafe.length} filas de asistencia al ${CAFE.columna} escritas.`);
  console.log('');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
