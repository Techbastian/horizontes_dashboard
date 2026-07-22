// ============================================================================
// upload_eventos_circulos.mjs — Carga el calendario de Círculos de Conocimiento
// en la tabla `eventos`.
//
//   node scripts/upload_eventos_circulos.mjs            → DRY RUN (no escribe nada)
//   node scripts/upload_eventos_circulos.mjs --commit   → escribe en Supabase
//
// Va aparte de upload_eventos.mjs a propósito: ese parsea el cronograma V9 de
// Horizontes Senior y tiene fijada la cohorte de HS. Aquí no hay Excel — son
// fechas confirmadas por el usuario (2026-07-22), así que la fuente de verdad
// es esta lista. Cuando se definan más sesiones, se agregan abajo y se re-corre.
//
// Idempotente: upsert por (cohort_id, codigo). No toca eventos creados a mano
// desde la UI, que van sin código.
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';

// Cohorte "Círculos de Conocimiento I". Explícita, nunca por status='active':
// la base aloja dos programas activos (ver CLAUDE.md).
const COHORT_ID = '386dcf50-e269-4b5b-b248-aaa754dbd0aa';

// Círculos no está subdividido: los 263 participantes son un solo grupo.
const GRUPO = 'Círculos';

// Todas las sesiones van 8:00–10:00 a.m. hora Bogotá (confirmado 2026-07-22).
const HORA_INICIO = '08:00';
const HORA_FIN = '10:00';

// Bogotá es UTC-5 fijo, sin horario de verano: el offset se escribe literal.
const bogotaIso = (fecha, hora) => `${fecha}T${hora}:00-05:00`;

// ── Calendario ──────────────────────────────────────────────────────────────
// `tipo` incluye 'sesion' para que el evento habilite "Tomar asistencia" en la
// UI (ver attendanceTipo en src/lib/eventos.js); 'evento' en la apertura es
// descriptivo. Sin 'sesion' el botón de asistencia no aparece.
// La apertura ES la sesión 1 y su asistencia se suma a las otras cuatro, así que
// va numerada dentro de la serie y no como un evento aparte.
const CALENDARIO = [
  {
    codigo: 'C-S01',
    nombre: 'Círculos — Sesión 1 (apertura)',
    descripcion: 'Encuentro de apertura del programa.',
    fecha: '2026-07-21',
    tipo: ['sesion', 'evento'],
  },
  { codigo: 'C-S02', nombre: 'Círculos — Sesión 2', fecha: '2026-07-29', tipo: ['sesion'] },
  { codigo: 'C-S03', nombre: 'Círculos — Sesión 3', fecha: '2026-08-06', tipo: ['sesion'] },
  { codigo: 'C-S04', nombre: 'Círculos — Sesión 4', fecha: '2026-08-11', tipo: ['sesion'] },
  { codigo: 'C-S05', nombre: 'Círculos — Sesión 5', fecha: '2026-08-18', tipo: ['sesion'] },
];

// Códigos de una numeración anterior (la apertura iba como 'C-AP', fuera de la
// serie). Se borran para no dejar el evento duplicado en el calendario. Es seguro
// porque `session_attendance.evento_id` es ON DELETE SET NULL.
const CODIGOS_OBSOLETOS = ['C-AP'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: coh, error: cohErr } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', COHORT_ID)
    .single();
  if (cohErr) throw new Error(`No se encontró la cohorte ${COHORT_ID}: ${cohErr.message}`);

  const eventos = CALENDARIO.map((e) => ({
    cohort_id: COHORT_ID,
    nombre: e.nombre,
    descripcion: e.descripcion ?? null,
    grupo: GRUPO,
    codigo: e.codigo,
    tipo: e.tipo,
    fecha_hora_inicio: bogotaIso(e.fecha, HORA_INICIO),
    fecha_hora_fin: bogotaIso(e.fecha, HORA_FIN),
  }));

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  EVENTOS DE CÍRCULOS — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`  Cohorte: ${coh.name}`);
  console.log(`${'='.repeat(72)}\n`);

  // Se avisa cuáles ya existen para que quede claro qué crea y qué actualiza.
  const { data: previos, error: pErr } = await supabase
    .from('eventos')
    .select('codigo')
    .eq('cohort_id', COHORT_ID)
    .in('codigo', CALENDARIO.map((e) => e.codigo));
  if (pErr) throw pErr;
  const yaExisten = new Set((previos || []).map((p) => p.codigo));

  const fecha = (iso) =>
    new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium' });
  const hora = (iso) =>
    new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
  for (const e of eventos) {
    const marca = yaExisten.has(e.codigo) ? '~ actualiza' : '+ crea     ';
    console.log(
      `  ${marca} ${e.codigo.padEnd(6)} ${fecha(e.fecha_hora_inicio).padEnd(16)} ` +
        `${hora(e.fecha_hora_inicio)}–${hora(e.fecha_hora_fin)}  [${e.tipo.join(',')}]  ${e.nombre}`
    );
  }
  console.log(`\n  ${eventos.length - yaExisten.size} nuevos · ${yaExisten.size} actualizados`);

  // Obsoletos: se avisa cuántos hay antes de borrarlos, y si alguno ya tiene
  // asistencia registrada se aborta en vez de dejar filas huérfanas en silencio.
  const { data: obsoletos } = await supabase
    .from('eventos')
    .select('id, codigo, nombre')
    .eq('cohort_id', COHORT_ID)
    .in('codigo', CODIGOS_OBSOLETOS);

  if (obsoletos?.length) {
    const { count: conAsistencia } = await supabase
      .from('session_attendance')
      .select('*', { count: 'exact', head: true })
      .in('evento_id', obsoletos.map((o) => o.id));
    console.log(`\n  🗑️  ${obsoletos.length} evento(s) de numeración anterior a eliminar:`);
    obsoletos.forEach((o) => console.log(`       ${o.codigo} · ${o.nombre}`));
    if (conAsistencia) {
      throw new Error(
        `${conAsistencia} filas de asistencia apuntan a esos eventos. ` +
          'Reasígnalas antes de borrarlos (o quítalos de CODIGOS_OBSOLETOS).'
      );
    }
    console.log('       (sin asistencia registrada: se pueden borrar sin perder nada)');
  }

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  const { error: uErr } = await supabase
    .from('eventos')
    .upsert(eventos, { onConflict: 'cohort_id,codigo' });
  if (uErr) throw uErr;
  console.log(`\n✅ Upsert de ${eventos.length} eventos completado.`);

  if (obsoletos?.length) {
    const { error: dErr } = await supabase
      .from('eventos')
      .delete()
      .in('id', obsoletos.map((o) => o.id));
    if (dErr) throw dErr;
    console.log(`🗑️  ${obsoletos.length} evento(s) obsoleto(s) eliminado(s).`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
