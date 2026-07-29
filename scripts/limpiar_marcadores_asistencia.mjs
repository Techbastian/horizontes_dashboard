// ============================================================================
// limpiar_marcadores_asistencia.mjs — Deja `session_attendance` con datos de
// verdad y nada más. Hace dos cosas, las dos con dry run:
//
//   FASE 1 · pone en `null` la asistencia de actividades que TODAVÍA NO OCURREN.
//   FASE 2 · BORRA las filas vacías de actividades sin un solo registro.
//
//   node scripts/limpiar_marcadores_asistencia.mjs            → DRY RUN
//   node scripts/limpiar_marcadores_asistencia.mjs --commit   → escribe
//
// POR QUÉ LA FASE 1: el Excel de seguimiento de Horizontes Senior trae "No"
// escrito en los cafés que aún no ocurren, y el ETL lo guardaba como
// `asistio = false`. Para el dashboard eso es un dato ("faltaron todos"), no un
// marcador, así que el día que llega la fecha la actividad entra al denominador
// con 0% y hunde el promedio del grupo sin que nadie haya faltado. `null` = no
// registrado, que es lo correcto.
//
// POR QUÉ LA FASE 2: los ETL creaban una fila con `asistio = null` por cada
// persona × sesión futura, porque antes una sesión sin filas era invisible. Ya
// no: qué actividades existen lo define el CALENDARIO (ver la regla de
// "ocurridas vs pendientes" en CLAUDE.md), así que esas filas no aportan nada y
// solo engordan la tabla — 1.052 de las 1.315 de Círculos, al 2026-07-29.
//
// SEGURIDAD, fase 1: solo toca filas de actividades con fecha ESTRICTAMENTE
// futura y en las que NADIE está marcado como asistente. Si alguien ya figura
// presente, la actividad tiene datos reales y no se toca.
//
// SEGURIDAD, fase 2: solo borra una fila si (a) está en `null` y sin
// observación, (b) NINGUNA fila de esa actividad tiene dato ni excusa, (c) la
// actividad está respaldada por un evento del calendario — que es lo que la
// mantiene visible en el dashboard después de borrarla — y (d) su `actividad`
// ya es el código de ese evento. Las actividades sin evento (los entregables,
// que no tienen fecha) nunca se tocan: sin filas desaparecerían. La condición
// (d) deja fuera a Horizontes Senior a propósito, ver el comentario en la fase 2.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import { actividadesDelCalendario } from '../src/lib/asistencia.js';
import { PROGRAMA_HS, PROGRAMA_CIRCULOS } from '../src/lib/eventos.js';

const COMMIT = process.argv.includes('--commit');


// El slug del programa define el vocabulario de grupos, y con él a qué grupos se
// desdobla cada evento (los cafés "Compartido" de HS van a los tres).
const COHORTES = [
  ['Horizontes Senior', '3e8e4b55-b201-4a4e-90ae-ca5dab1c50e0', PROGRAMA_HS],
  ['Círculos de Conocimiento', '386dcf50-e269-4b5b-b248-aaa754dbd0aa', PROGRAMA_CIRCULOS],
];

// Actividades YA OCURRIDAS que el equipo confirmó que están sin cargar, no que
// tuvieron cero asistencia. El script NO puede deducirlas solo: una sesión a la
// que de verdad no fue nadie se ve exactamente igual. Por eso van a mano, con
// fecha de confirmación, y solo se tocan las que estén listadas aquí.
//   Clave: `${grupo}|${tipo}|${fecha}` dentro de la cohorte indicada.
const SIN_CARGAR_CONFIRMADAS = {
  // Vacío a propósito. Aquí estuvieron las nivelaciones 4 y 5 de Activación
  // ('Activación|sesion|2026-07-21' y '…07-22'), confirmadas sin cargar el
  // 2026-07-22; la matriz del 28/07 las trajo (13 y 14 asistentes, 13 excusas) y
  // esto habría puesto en null 40 registros reales. Una entrada aquí caduca en
  // cuanto llega el dato: revísala contra la base antes de correr con --commit.
};

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

// Comparación por cadena 'YYYY-MM-DD' contra hoy en Bogotá (UTC-5 fijo). Comparar
// objetos Date daba un día de error: `new Date('2026-07-23')` es medianoche UTC,
// anterior al fin del 22 en Colombia.
const hoyBogota = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const esFutura = (f) => Boolean(f) && String(f).slice(0, 10) > hoyBogota;

async function traerTodo(cohortId) {
  let filas = [];
  let p = 0;
  let mas = true;
  while (mas) {
    const { data, error } = await supabase
      .from('session_attendance')
      .select('id, grupo, tipo, actividad, fecha, asistio, observacion')
      .eq('cohort_id', cohortId)
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (error) throw error;
    if (data?.length) {
      filas = filas.concat(data);
      if (data.length < 1000) mas = false;
      else p++;
    } else mas = false;
  }
  return filas;
}

async function main() {
  console.log(`\n${'='.repeat(76)}`);
  console.log(`  MARCADORES DE ASISTENCIA — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`${'='.repeat(76)}`);

  let totalIds = [];
  let idsABorrar = [];

  for (const [nombre, cohortId, programa] of COHORTES) {
    const filas = await traerTodo(cohortId);

    // El calendario: es lo que mantiene visible una actividad sin filas.
    const { data: eventos, error: evErr } = await supabase
      .from('eventos')
      .select('id, nombre, codigo, grupo, tipo, fecha_hora_inicio')
      .eq('cohort_id', cohortId);
    if (evErr) throw evErr;
    // Mismas claves `grupo|tipo|fecha` que usa el dashboard para cruzarlos.
    const enCalendario = actividadesDelCalendario(eventos || [], programa);

    // Agrupar por actividad para poder mirar si alguien asistió.
    const act = new Map();
    for (const r of filas) {
      const k = `${r.grupo}|${r.tipo}|${r.fecha}`;
      if (!act.has(k)) {
        act.set(k, { grupo: r.grupo, tipo: r.tipo, actividad: r.actividad, fecha: r.fecha, filas: [], algunoAsistio: false });
      }
      const v = act.get(k);
      v.filas.push(r);
      if (r.asistio === true) v.algunoAsistio = true;
    }

    const confirmadas = new Set(SIN_CARGAR_CONFIRMADAS[cohortId] || []);
    const aLimpiar = [...act.values()].filter((v) => {
      if (!v.filas.some((r) => r.asistio !== null)) return false; // ya está en null
      // Nadie presente es la condición de fondo en los dos casos: si alguien
      // figura asistiendo, la actividad tiene datos reales y no se toca. Faltaba
      // en la rama de las confirmadas, y por eso una entrada que ya se había
      // cargado habría borrado 40 registros (2026-07-29).
      if (v.algunoAsistio) return false;
      // Futuras sin nadie presente: marcador evidente.
      if (esFutura(v.fecha)) return true;
      // Pasadas: solo las confirmadas a mano.
      return confirmadas.has(`${v.grupo}|${v.tipo}|${v.fecha}`);
    });

    console.log(`\n  ── ${nombre}`);
    // Sin `continue` aunque no haya nada en la fase 1: la fase 2 va después y se
    // la saltaba (por eso Círculos, que tenía 1.052 filas vacías, no reportaba nada).
    if (!aLimpiar.length) {
      console.log(`     fase 1: nada que poner en null (${act.size} actividades revisadas)`);
    }
    for (const v of aLimpiar) {
      const cambian = v.filas.filter((r) => r.asistio !== null);
      console.log(`     ${v.fecha} · ${v.grupo.padEnd(11)} ${v.tipo.padEnd(7)} "${v.actividad}" → ${cambian.length} filas a null`);
      totalIds = totalIds.concat(cambian.map((r) => r.id));
    }

    // Aviso: actividades pasadas donde nadie asistió. No se tocan (podría ser
    // real), pero casi siempre significan "aún no se ha cargado".
    const sospechosas = [...act.values()].filter(
      (v) => v.fecha && !esFutura(v.fecha) && !v.algunoAsistio && v.filas.length > 3 &&
        !confirmadas.has(`${v.grupo}|${v.tipo}|${v.fecha}`) &&
        v.filas.some((r) => r.asistio !== null)
    );
    if (sospechosas.length) {
      console.log(`\n     ⚠️  actividades YA OCURRIDAS con cero asistentes (NO se tocan, revísalas):`);
      sospechosas.forEach((v) =>
        console.log(`         ${v.fecha} · ${v.grupo} · "${v.actividad}" → 0 de ${v.filas.length}`)
      );
    }

    // ── FASE 2 · filas vacías de actividades sin un solo registro ────────────
    const vacias = [...act.values()].filter((v) => {
      if (!v.fecha) return false;                                  // entregables: no están en el calendario
      const delCalendario = enCalendario.get(`${v.grupo}|${v.tipo}|${v.fecha}`);
      if (!delCalendario) return false;
      // La fila vacía solo sobra si su `actividad` ya es el código del evento
      // (Círculos). En Horizontes Senior las actividades llevan el nombre del
      // Excel ("Café 4") y esa fila es justo lo que hace que la captura desde la
      // app edite la misma fila que luego pisa el ETL, que no escribe evento_id:
      // borrarla dejaría a la app estrenando "C4" y al Excel creando "Café 4"
      // aparte, dos filas para el mismo café (ver CLAUDE.md, contrato ETL↔app).
      if (v.actividad !== delCalendario.codigo) return false;
      // Basta un dato o una excusa en cualquier fila para dejar la actividad entera.
      return v.filas.every((r) => r.asistio === null && !String(r.observacion || '').trim());
    });

    if (vacias.length) {
      console.log(`\n     🧹 filas vacías a BORRAR (la actividad sigue visible por el calendario):`);
      for (const v of vacias) {
        console.log(`         ${v.fecha} · ${v.grupo.padEnd(11)} ${v.tipo.padEnd(7)} "${v.actividad}" → ${v.filas.length} filas`);
        idsABorrar = idsABorrar.concat(v.filas.map((r) => r.id));
      }
    }
  }

  console.log(`\n  Fase 1 · filas a poner en null: ${totalIds.length}`);
  console.log(`  Fase 2 · filas a borrar       : ${idsABorrar.length}`);

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }
  if (!totalIds.length && !idsABorrar.length) {
    console.log('\n✅ Nada que hacer.\n');
    return;
  }

  for (let i = 0; i < totalIds.length; i += 200) {
    const lote = totalIds.slice(i, i + 200);
    const { error } = await supabase
      .from('session_attendance')
      .update({ asistio: null })
      .in('id', lote);
    if (error) throw error;
  }
  if (totalIds.length) console.log(`\n✅ ${totalIds.length} filas puestas en null.`);

  for (let i = 0; i < idsABorrar.length; i += 200) {
    const lote = idsABorrar.slice(i, i + 200);
    const { error } = await supabase
      .from('session_attendance')
      .delete()
      .in('id', lote);
    if (error) throw error;
  }
  if (idsABorrar.length) console.log(`✅ ${idsABorrar.length} filas vacías borradas.`);
  console.log('');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
