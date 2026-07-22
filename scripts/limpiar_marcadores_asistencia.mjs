// ============================================================================
// limpiar_marcadores_asistencia.mjs — Pone en `null` la asistencia de las
// actividades que TODAVÍA NO HAN OCURRIDO.
//
//   node scripts/limpiar_marcadores_asistencia.mjs            → DRY RUN
//   node scripts/limpiar_marcadores_asistencia.mjs --commit   → escribe
//
// POR QUÉ: el Excel de seguimiento de Horizontes Senior trae "No" escrito en los
// cafés que aún no ocurren, y el ETL lo guardaba como `asistio = false`. Para el
// dashboard eso es un dato ("faltaron todos"), no un marcador, así que el día que
// llega la fecha la actividad entra al denominador con 0% y hunde el promedio del
// grupo sin que nadie haya faltado. `null` = no registrado, que es lo correcto.
//
// SEGURIDAD: solo toca filas de actividades con fecha ESTRICTAMENTE futura y en
// las que NADIE está marcado como asistente. Si alguien ya figura presente, la
// actividad tiene datos reales y no se toca. Nunca modifica actividades pasadas.
//
// El origen ya está corregido en upload_asistencia.mjs (ver esFutura), así que
// esto es para los datos que quedaron cargados de antes.
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';

const COHORTES = [
  ['Horizontes Senior', '3e8e4b55-b201-4a4e-90ae-ca5dab1c50e0'],
  ['Círculos de Conocimiento', '386dcf50-e269-4b5b-b248-aaa754dbd0aa'],
];

// Actividades YA OCURRIDAS que el equipo confirmó que están sin cargar, no que
// tuvieron cero asistencia. El script NO puede deducirlas solo: una sesión a la
// que de verdad no fue nadie se ve exactamente igual. Por eso van a mano, con
// fecha de confirmación, y solo se tocan las que estén listadas aquí.
//   Clave: `${grupo}|${tipo}|${fecha}` dentro de la cohorte indicada.
const SIN_CARGAR_CONFIRMADAS = {
  '3e8e4b55-b201-4a4e-90ae-ca5dab1c50e0': [
    // Confirmado por el usuario el 2026-07-22: las nivelaciones 4 y 5 de Activación
    // aún no tienen la asistencia cargada (las sesiones 1-3 tuvieron 15-16 de 20).
    'Activación|sesion|2026-07-21',
    'Activación|sesion|2026-07-22',
  ],
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
      .select('id, grupo, tipo, actividad, fecha, asistio')
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

  for (const [nombre, cohortId] of COHORTES) {
    const filas = await traerTodo(cohortId);

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
      // Futuras sin nadie presente: marcador evidente.
      if (esFutura(v.fecha) && !v.algunoAsistio) return true;
      // Pasadas: solo las confirmadas a mano.
      return confirmadas.has(`${v.grupo}|${v.tipo}|${v.fecha}`);
    });

    console.log(`\n  ── ${nombre}`);
    if (!aLimpiar.length) {
      console.log(`     nada que limpiar (${act.size} actividades revisadas)`);
      continue;
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
  }

  console.log(`\n  Total de filas a poner en null: ${totalIds.length}`);

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }
  if (!totalIds.length) {
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
  console.log(`\n✅ ${totalIds.length} filas puestas en null.\n`);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
