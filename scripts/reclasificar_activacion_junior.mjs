// ============================================================================
// reclasificar_activacion_junior.mjs — Mueve a Junior a quienes hoy están en la
// Estrategia de Activación, PRESERVANDO su asistencia de Activación.
//
//   node scripts/reclasificar_activacion_junior.mjs            → DRY RUN
//   node scripts/reclasificar_activacion_junior.mjs --commit   → escribe
//
// POR QUÉ: Activación fue un arranque, no un destino. Las ~20 personas que
// entraron por ahí continúan el cronograma Junior desde el Café 3 (23/07/2026).
//
// CÓMO, Y QUÉ NO TOCA: escribe `historial_ruta` en custom_form_data (dos fases:
// Activación cerrada el día antes del corte, Junior abierta desde el corte) y
// deriva `ruta_asignada`. **NO toca `session_attendance`**: esas filas son
// inmutables y conservan el grupo donde ocurrió cada actividad — es justamente
// lo que permite que la historia de Activación siga viéndose. Cambiarles el
// grupo sería reescribir el pasado y además rompería las barras de Activación.
//
// IDEMPOTENTE: a quien ya tenga a Junior como fase actual no se le toca nada.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import { cambiarDeRuta, fasesDeMatricula, rutaActual } from '../src/lib/rutas.js';

const COMMIT = process.argv.includes('--commit');
const COHORT_SLUG = 'horizontes-senior-2026'; // cohorte destino: Horizontes Senior

const ORIGEN = 'Activación';
const DESTINO = 'Junior';
// Primera actividad que cuenta como Junior para los migrados: el Café 3. Las
// sesiones y cafés Junior anteriores a esta fecha no se les exigen.
const CORTE = '2026-07-23';
const MOTIVO = 'Continúa el cronograma Junior desde el Café 3';

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

// Activación es una fase que TERMINA en el corte: sus actividades posteriores no
// existen, porque a partir de ahí esa gente cuenta como Junior. En la base hay
// filas de los cafés 3 a 6 con `grupo='Activación'` que se crearon cuando la hoja
// del Excel las trajo, y al reasignar el Café 3 a Junior quedarían huérfanas:
// saldrían como un café "sin cargar" de un grupo que ya no existe.
//
// SEGURIDAD: solo borra filas SIN NINGÚN REGISTRO (`asistio IS NULL`) y con fecha
// desde el corte. Nunca toca una fila con dato real: si alguien tiene asistencia
// marcada ahí, se reporta y se deja quieta para revisarla a mano.
async function limpiarActividadesPosteriores(cohortId) {
  const { data: filas, error } = await supabase
    .from('session_attendance')
    .select('id, actividad, fecha, asistio')
    .eq('cohort_id', cohortId)
    .eq('grupo', ORIGEN)
    .gte('fecha', CORTE);
  if (error) throw error;

  const conDato = (filas || []).filter((r) => r.asistio !== null);
  const aBorrar = (filas || []).filter((r) => r.asistio === null);

  console.log(`\n  session_attendance de ${ORIGEN} desde ${CORTE}: ${(filas || []).length} filas`);
  if (conDato.length) {
    console.log(`     ⚠️  ${conDato.length} CON dato real — NO se tocan, revísalas a mano:`);
    const porAct = new Map();
    conDato.forEach((r) => porAct.set(r.actividad, (porAct.get(r.actividad) || 0) + 1));
    for (const [a, n] of porAct) console.log(`         "${a}" → ${n}`);
  }
  if (!aBorrar.length) {
    console.log('     nada que limpiar');
    return;
  }
  const porAct = new Map();
  aBorrar.forEach((r) => porAct.set(`${r.actividad} (${r.fecha})`, (porAct.get(`${r.actividad} (${r.fecha})`) || 0) + 1));
  console.log(`     ${aBorrar.length} sin registrar → se borran:`);
  for (const [a, n] of [...porAct].sort()) console.log(`         ${a} → ${n} filas`);

  if (!COMMIT) return;
  const ids = aBorrar.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error: delErr } = await supabase.from('session_attendance').delete().in('id', ids.slice(i, i + 200));
    if (delErr) throw delErr;
  }
  console.log(`     ✅ ${ids.length} filas borradas.`);
}

async function main() {
  console.log(`\n${'='.repeat(76)}`);
  console.log(`  ${ORIGEN} → ${DESTINO} (corte ${CORTE}) — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`${'='.repeat(76)}`);

  const { data: cohort, error: cohErr } = await supabase.from('cohorts').select('id')
    .eq('slug_application', COHORT_SLUG).limit(1).single();
  if (cohErr) throw new Error(`No se encontró la cohorte "${COHORT_SLUG}": ${cohErr.message}`);

  const { data: enrs, error: enrErr } = await supabase
    .from('program_enrollments')
    .select('id, custom_form_data, candidate:candidates(first_name, last_name)')
    .eq('cohort_id', cohort.id);
  if (enrErr) throw enrErr;

  const nombre = (e) => e.custom_form_data?.nombre_completo
    || `${e.candidate?.first_name || ''} ${e.candidate?.last_name || ''}`.trim()
    || `enrollment ${e.id}`;

  // Se filtra por la FASE ACTUAL, no por `ruta_asignada` a secas: si el script ya
  // corrió, la fase actual es Junior aunque el historial recuerde Activación.
  const enOrigen = (enrs || []).filter((e) => rutaActual(e.custom_form_data) === ORIGEN);
  // Los `elegido: false` son matrículas heredadas/erróneas que el dashboard ya
  // no muestra en ningún lado (ver CLAUDE.md): no vale la pena escribirles.
  const objetivo = enOrigen.filter((e) => e.custom_form_data?.elegido !== false);
  const noElegidos = enOrigen.filter((e) => e.custom_form_data?.elegido === false);
  const yaMigrados = (enrs || []).filter((e) =>
    fasesDeMatricula(e.custom_form_data).some((f) => f.ruta === ORIGEN) && rutaActual(e.custom_form_data) === DESTINO
  );

  console.log(`\n  En ${ORIGEN} ahora mismo: ${enOrigen.length}`);
  if (noElegidos.length) {
    console.log(`  Se omiten ${noElegidos.length} con elegido:false (matrículas heredadas, no se muestran):`);
    noElegidos.forEach((e) => console.log(`     · ${nombre(e)}`));
  }
  if (yaMigrados.length) console.log(`  Ya migrados en una corrida anterior: ${yaMigrados.length} (no se tocan)`);

  // La limpieza va aparte de las matrículas: aunque ya no quede nadie por mover,
  // puede quedar basura de actividades posteriores al corte (p. ej. si el ETL de
  // asistencia corrió con la hoja vieja después de la migración).
  if (!objetivo.length) {
    console.log(`\n  Nadie por mover: ya nadie tiene ${ORIGEN} como grupo actual.`);
    await limpiarActividadesPosteriores(cohort.id);
    console.log(COMMIT ? '\n✅ Listo.\n' : '\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  const cambios = [];
  for (const e of objetivo) {
    const cf = e.custom_form_data || {};
    const parche = cambiarDeRuta(cf, { ruta: DESTINO, desde: CORTE, motivo: MOTIVO });
    if (!parche) continue; // ya estaba en el destino
    cambios.push({ id: e.id, nombre: nombre(e), activo: cf.estado_activo !== false, parche });
  }

  console.log(`\n  Personas a mover: ${cambios.length}`);
  console.log(`  ${'Persona'.padEnd(34)} ${'Estado'.padEnd(9)} Historial resultante`);
  for (const c of cambios) {
    const linea = c.parche.historial_ruta
      .map((f) => `${f.ruta} (${f.desde || 'inicio'}→${f.hasta || 'hoy'})`)
      .join(' · ');
    console.log(`  ${c.nombre.slice(0, 33).padEnd(34)} ${(c.activo ? 'activo' : 'inactivo').padEnd(9)} ${linea}`);
  }

  await limpiarActividadesPosteriores(cohort.id);

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  // Uno por uno: el update mezcla sobre el custom_form_data de cada persona, que
  // es distinto en cada fila (retiro, riesgo, ponderados…). Un upsert en lote
  // pisaría esos campos.
  let escritos = 0;
  for (const c of cambios) {
    const actual = enOrigen.find((e) => e.id === c.id).custom_form_data || {};
    const { error } = await supabase
      .from('program_enrollments')
      .update({ custom_form_data: { ...actual, ...c.parche } })
      .eq('id', c.id);
    if (error) throw new Error(`${c.nombre}: ${error.message}`);
    escritos++;
  }
  console.log(`\n✅ ${escritos} matrículas movidas de ${ORIGEN} a ${DESTINO}.\n`);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
