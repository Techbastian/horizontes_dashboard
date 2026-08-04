// ============================================================================
// upload_eventos.mjs — Refleja TODO el cronograma de formación en la tabla
// `eventos` (calendario del dashboard), por grupo, con código y tipo.
//
//   node scripts/upload_eventos.mjs            → DRY RUN (no escribe nada)
//   node scripts/upload_eventos.mjs --commit   → escribe en Supabase
//
// Fuentes de verdad:
//   • Junior / Senior  → bases_de_datos/V9_CronogramaFormación_H_S.xlsx
//                        (hojas "Cronograma Junior" y "Cronograma Senior")
//   • Activación       → 5 nivelaciones propias (NO están en el cronograma
//                        oficial; fechas confirmadas por el usuario). A partir
//                        del Café 3 (23/07) Activación se fusiona con Junior.
//   • Compartidos      → Evento inicial, evaluación asíncrona, 6 cafés y cierre
//                        (un solo registro con grupo='Compartido').
//
// Idempotente: upsert por (cohort_id, codigo). No toca eventos manuales
// (codigo NULL). Borra los 2 eventos de prueba históricos por id (solo --commit).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const EXCEL_PATH = resolve(__dirname, '../bases_de_datos/V9_CronogramaFormación_H_S.xlsx');
const COHORT_ID = '3e8e4b55-b201-4a4e-90ae-ca5dab1c50e0'; // Cohorte 1 - 2026

// Eventos de prueba históricos a eliminar (por id, para no tocar eventos manuales).
const TEST_EVENT_IDS = [
  '12f8616e-5423-4265-baac-304d794b0758', // "Evento de prueba"
  '9c59c1b5-46ce-411b-b1f6-1ad54420b80b', // "Primer Café del Conocimiento" (dup de C1)
];

// Activación: 5 nivelaciones propias. Fechas y horario confirmados por el
// usuario (8:00–10:00 a.m.). Tras estas sesiones el grupo continúa con el
// cronograma Junior (desde el Café 3 del 23/07).
const ACTIVACION_HORA_INICIO = '08:00';
const ACTIVACION_HORA_FIN = '10:00';
const ACTIVACION_FECHAS = ['2026-07-08', '2026-07-15', '2026-07-16', '2026-07-21', '2026-07-22'];

// Mentorías de seguimiento. El cronograma V9 las lista en el resumen de horas
// (M-J01/M-J02 en Junior, M-S01/M-S02 en Senior · 3 h en total) pero SIN fecha, y
// además con la nota "Mentorías post-programa eliminadas": el parser no puede
// sacarlas de ahí. Van aquí con las fechas que confirma el usuario, igual que las
// nivelaciones de Activación.
//
// Llevan tipo ['mentoria'] A SECAS, sin 'sesion'. Eso ya no significa "sin
// asistencia": desde el 2026-08-04 `attendanceTipo` les da su propio tipo
// 'mentoria', así que SÍ se les toma asistencia como a una sesión —el botón
// aparece en el calendario— pero NO entran en el % de asistencia del programa,
// porque son acompañamiento y no formación (decisión del usuario). Si alguna
// debiera contar, se le agrega 'sesion' y pasa a pesar como tal; así están las
// sesiones 2 a 5 de Círculos, que son mentorías pero son el programa mismo.
const MENTORIAS = [
  { codigo: 'M-J01', grupo: 'Junior', fecha: '2026-07-29', inicio: '16:00', fin: '17:30' },
];

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

// ── Utilidades ──────────────────────────────────────────────────────────────
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// "08/04/2026" → "2026-04-08"
function dmyToIsoDate(dmy) {
  const m = String(dmy).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// Parsea "9:00 – 10:30 a.m.", "6:00 – 8:00 p.m.", "8:30 – 12:00 m." → [ [h,m], [h,m] ]
function parseHorario(h) {
  const s = String(h);
  if (/as[ií]ncrona|todo el d[ií]a/i.test(s)) return { allDay: true };
  const m = s.match(/(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|m\.?)/i);
  if (!m) return null;
  let h1 = +m[1], mi1 = +m[2], h2 = +m[3], mi2 = +m[4];
  const suf = m[5].toLowerCase().replace(/[.\s]/g, '');
  if (suf === 'pm') { if (h1 < 12) h1 += 12; if (h2 < 12) h2 += 12; }
  else if (suf === 'am') { if (h1 === 12) h1 = 0; if (h2 === 12) h2 = 0; }
  // 'm' = mediodía: la hora fin es 12:00; la de inicio queda como AM.
  return { start: [h1, mi1], end: [h2, mi2] };
}

// (fecha ISO "YYYY-MM-DD", [h,m]) → "YYYY-MM-DDTHH:MM:00-05:00" (Bogotá, UTC-5, sin DST)
function bogotaIso(dateIso, [h, mi]) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dateIso}T${p(h)}:${p(mi)}:00-05:00`;
}

function horarioToIso(dateIso, horario) {
  const parsed = parseHorario(horario);
  if (!parsed) return null;
  if (parsed.allDay) {
    return { inicio: `${dateIso}T00:00:00-05:00`, fin: `${dateIso}T23:59:00-05:00`, allDay: true };
  }
  return { inicio: bogotaIso(dateIso, parsed.start), fin: bogotaIso(dateIso, parsed.end), allDay: false };
}

// ── Clasificación de código → grupo / código normalizado / tipo ─────────────
function classify(rawCode) {
  const code = clean(rawCode).toUpperCase();
  if (code === 'EV-00') return { grupo: 'Compartido', codigo: 'EV-00', tipo: ['evento'] };
  if (code === 'CIERRE') return { grupo: 'Compartido', codigo: 'CIERRE', tipo: ['evento'] };
  if (/^EVAL-[JS]$/.test(code)) return { grupo: 'Compartido', codigo: 'EVAL', tipo: ['evaluacion'] };
  const cafe = code.match(/^C(\d)-[JS]$/);
  if (cafe) return { grupo: 'Compartido', codigo: `C${cafe[1]}`, tipo: ['cafe'] };
  const grupo = code.includes('-J') ? 'Junior' : code.includes('-S') ? 'Senior' : null;
  if (!grupo) return null;
  if (/^N-[JS]\d+$/.test(code)) return { grupo, codigo: code, tipo: ['nivelacion'] };
  if (/^V-[JS]\d+$/.test(code)) return { grupo, codigo: code, tipo: ['sesion'] };
  if (/^PF-[JS]$/.test(code)) return { grupo, codigo: code, tipo: ['proyecto'] };
  return null;
}

// Nombre legible por evento.
function buildNombre(codigo, grupo, modulo) {
  const cafe = codigo.match(/^C(\d)$/);
  if (cafe) return `Café de Conocimiento No. ${cafe[1]}`;
  if (codigo === 'EV-00') return 'Evento Inicial Virtual';
  if (codigo === 'EVAL') return 'Jornada de Evaluación de Progreso (asíncrona)';
  if (codigo === 'CIERRE') return 'Evento de Cierre y Certificación';
  if (codigo === 'PF-J') return 'Presentación Proyecto Final — Junior';
  if (codigo === 'PF-S') return 'Presentación Proyecto Final — Senior';
  return clean(modulo) || codigo;
}

function buildDescripcion(contenido, observaciones) {
  const c = String(contenido ?? '').trim();
  const o = String(observaciones ?? '').trim();
  if (c && o) return `${c}\n\nObservaciones: ${o}`;
  return c || o || null;
}

// ── Parseo de una hoja de cronograma ────────────────────────────────────────
const CODE_RE = /^(EV-00|CIERRE|EVAL-[JS]|C\d-[JS]|N-[JS]\d+|V-[JS]\d+|PF-[JS])$/;

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1, raw: false });
  const out = [];
  for (const r of rows) {
    const code = clean(r?.[0]).toUpperCase();
    if (!CODE_RE.test(code)) continue; // salta secciones, festivos "—", resúmenes
    const cls = classify(code);
    if (!cls) continue;
    const fecha = dmyToIsoDate(r[1]);
    if (!fecha) continue;
    const times = horarioToIso(fecha, r[3]);
    if (!times) continue;
    out.push({
      cohort_id: COHORT_ID,
      grupo: cls.grupo,
      codigo: cls.codigo,
      tipo: cls.tipo,
      nombre: buildNombre(cls.codigo, cls.grupo, r[7]),
      descripcion: buildDescripcion(r[8], r[10]),
      evidencia_url: null,
      fecha_hora_inicio: times.inicio,
      fecha_hora_fin: times.fin,
    });
  }
  return out;
}

// ── Construcción del set completo de eventos ────────────────────────────────
function buildEventos() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const junior = parseSheet(wb.Sheets['Cronograma Junior']);
  const senior = parseSheet(wb.Sheets['Cronograma Senior']);

  // Dedupe por codigo: los compartidos aparecen en ambas hojas.
  const byCodigo = new Map();
  for (const ev of [...junior, ...senior]) {
    if (!byCodigo.has(ev.codigo)) byCodigo.set(ev.codigo, ev);
  }

  // Activación: 5 nivelaciones propias.
  ACTIVACION_FECHAS.forEach((fecha, i) => {
    const codigo = `N-A0${i + 1}`;
    byCodigo.set(codigo, {
      cohort_id: COHORT_ID,
      grupo: 'Activación',
      codigo,
      tipo: ['nivelacion'],
      nombre: `Nivelación Activación — Sesión ${i + 1}`,
      descripcion: 'Sesión de nivelación del grupo de Activación. A partir del Café 3 (23/07) el grupo se fusiona con Junior y sigue el cronograma Junior.',
      evidencia_url: null,
      fecha_hora_inicio: bogotaIso(fecha, ACTIVACION_HORA_INICIO.split(':').map(Number)),
      fecha_hora_fin: bogotaIso(fecha, ACTIVACION_HORA_FIN.split(':').map(Number)),
    });
  });

  // Mentorías de seguimiento (fechas confirmadas por el usuario, no van en el Excel).
  for (const m of MENTORIAS) {
    const orden = MENTORIAS.filter((x) => x.grupo === m.grupo).indexOf(m) + 1;
    byCodigo.set(m.codigo, {
      cohort_id: COHORT_ID,
      grupo: m.grupo,
      codigo: m.codigo,
      tipo: ['mentoria'],
      nombre: `Mentoría de seguimiento ${orden} — ${m.grupo}`,
      descripcion: 'Acompañamiento de seguimiento (Fase 4). Se registra la asistencia, pero no cuenta para el porcentaje de asistencia del programa.',
      evidencia_url: null,
      fecha_hora_inicio: bogotaIso(m.fecha, m.inicio.split(':').map(Number)),
      fecha_hora_fin: bogotaIso(m.fecha, m.fin.split(':').map(Number)),
    });
  }

  return [...byCodigo.values()].sort(
    (a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio)
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const eventos = buildEventos();

  const porGrupo = eventos.reduce((acc, e) => ((acc[e.grupo] = (acc[e.grupo] || 0) + 1), acc), {});
  console.log(`\n${COMMIT ? '🟢 COMMIT' : '🟡 DRY RUN'} — ${eventos.length} eventos del cronograma`);
  console.log('Por grupo:', porGrupo, '\n');

  const fmt = (iso) =>
    new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
  for (const e of eventos) {
    console.log(
      `  ${String(e.codigo).padEnd(7)} ${String(e.grupo).padEnd(11)} ${fmt(e.fecha_hora_inicio)}–${new Date(
        e.fecha_hora_fin
      ).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}  [${e.tipo.join(
        ','
      )}]  ${e.nombre}`
    );
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN) No se escribió nada. Corre con --commit para aplicar.');
    return;
  }

  // 1) Borrar eventos de prueba históricos (por id, seguro).
  const { data: existentes, error: eErr } = await supabase
    .from('eventos')
    .select('id, nombre')
    .in('id', TEST_EVENT_IDS);
  if (eErr) throw eErr;
  if (existentes?.length) {
    const { error: dErr } = await supabase.from('eventos').delete().in('id', TEST_EVENT_IDS);
    if (dErr) throw dErr;
    console.log(`\n🗑️  Eliminados ${existentes.length} eventos de prueba: ${existentes.map((x) => x.nombre).join(', ')}`);
  }

  // 2) Upsert idempotente por (cohort_id, codigo).
  const { error: uErr } = await supabase.from('eventos').upsert(eventos, { onConflict: 'cohort_id,codigo' });
  if (uErr) throw uErr;
  console.log(`\n✅ Upsert de ${eventos.length} eventos completado.`);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
