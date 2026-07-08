// ============================================================================
// upload_retiros.mjs — Carga motivos de retiro y casos en riesgo desde la
// Plantilla de Trazabilidad de PQRS a program_enrollments.custom_form_data.
//   node scripts/upload_retiros.mjs           → DRY RUN
//   node scripts/upload_retiros.mjs --commit   → escribe
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');
const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';
const EXCEL = resolve(__dirname, '../bases_de_datos/Plantilla de Trazabilidad de PQRS_HorizontesSenior.xlsx');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const norm = d => String(d ?? '').replace(/\D/g, '').trim();
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const serialToISO = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) { const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; }
  const n = Number(v); if (Number.isNaN(n)) return null;
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
};

// Clasificador de motivo (6 categorías). Override por cédula para exactitud + fallback por palabras clave.
const OVERRIDE = {
  '42773214': 'Metodología / contenido', '71622291': 'Metodología / contenido', '71696530': 'Metodología / contenido',
  '98554420': 'Sin contacto', '8154553': 'Sin contacto',
  '42781983': 'Situación laboral', '71663501': 'Situación laboral',
  '71681050': 'Tiempo / disponibilidad', '43115601': 'Tiempo / disponibilidad',
  '30578539': 'Salud',
  '25164198': 'Voluntario / personal', '78698795': 'Voluntario / personal',
};
function clasificar(doc, texto) {
  if (OVERRIDE[doc]) return OVERRIDE[doc];
  const t = (texto || '').toLowerCase();
  if (/empleo|labora|trabajo|proyecto empresarial|fumigaci|contrat/.test(t)) return 'Situación laboral';
  if (/salud|médic|medic|ojo|tratamiento|incapacit|visual|enferm/.test(t)) return 'Salud';
  if (/método|metodolog|denso|no.?práctic|temática|ritmo|adaptar|ansiedad|contenido/.test(t)) return 'Metodología / contenido';
  if (/no responde|sin respuesta|no.*contact|no.?aceptó|invitaci/.test(t)) return 'Sin contacto';
  if (/tiempo|disponibilidad|no.?alcanz|agenda|compromiso/.test(t)) return 'Tiempo / disponibilidad';
  return 'Voluntario / personal';
}

function readRetiros(wb) {
  return XLSX.utils.sheet_to_json(wb.Sheets['Casos de abandono'], { defval: null })
    .filter(r => r.nombre)
    .map(r => ({
      doc: norm(r['Cédula']), nombre: clean(r.nombre), nivel: clean(r.Nivel),
      motivo: clean(r['Razón de abandono']), categoria: clasificar(norm(r['Cédula']), r['Razón de abandono']),
      fecha: serialToISO(r['Fecha de notificación']), evidencia: r['Link evidencias'] || null,
    }));
}
function readRiesgo(wb) {
  return XLSX.utils.sheet_to_json(wb.Sheets['Personas en riesgo de deserción'], { defval: null })
    .filter(r => r.Nombre)
    .map(r => ({
      doc: norm(r['Cédula']), nombre: clean(r.Nombre),
      situacion: clean(r.Caso), canal: clean(r['Canal de respuesta']),
      fecha: serialToISO(r['Fecha de recepcion '] ?? r['Fecha de recepcion']),
    }));
}

async function main() {
  console.log(`\n${'='.repeat(66)}\n  RETIROS — ${COMMIT ? '🔴 COMMIT' : '🟢 DRY RUN'}\n${'='.repeat(66)}`);
  const wb = XLSX.readFile(EXCEL);
  const retiros = readRetiros(wb);
  const riesgo = readRiesgo(wb);
  console.log(`Casos de abandono: ${retiros.length} | En riesgo: ${riesgo.length}`);

  const { data: cohort } = await supabase.from('cohorts').select('id').eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();
  const cohortId = cohort.id;
  const { data: enrs } = await supabase.from('program_enrollments').select('id,custom_form_data,candidates(document_number,email)').eq('cohort_id', cohortId);
  const enrByDoc = new Map();
  for (const e of enrs) { const d = norm(e.custom_form_data?.cedula ?? e.candidates?.document_number); if (d) enrByDoc.set(d, e); }

  const updates = new Map(); // enrollmentId -> merged custom
  const sinMatch = [];
  const catCount = {};

  for (const r of retiros) {
    catCount[r.categoria] = (catCount[r.categoria] || 0) + 1;
    const e = enrByDoc.get(r.doc);
    if (!e) { sinMatch.push(`RETIRO ${r.doc} ${r.nombre}`); continue; }
    const base = updates.get(e.id) || { ...(e.custom_form_data || {}) };
    base.retiro = { categoria: r.categoria, motivo: r.motivo, fecha: r.fecha, nivel: r.nivel, evidencia: r.evidencia };
    base.estado_activo = false;
    updates.set(e.id, base);
  }
  for (const r of riesgo) {
    const e = enrByDoc.get(r.doc);
    if (!e) { sinMatch.push(`RIESGO ${r.doc} ${r.nombre}`); continue; }
    const base = updates.get(e.id) || { ...(e.custom_form_data || {}) };
    base.en_riesgo = true;
    base.riesgo_situacion = r.situacion;
    base.riesgo_canal = r.canal;
    base.riesgo_fecha = r.fecha;
    updates.set(e.id, base);
  }

  console.log(`\nDistribución de categorías:`); Object.entries(catCount).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`   ${v}  ${k}`));
  console.log(`\nEnrollments a actualizar: ${updates.size}`);
  if (sinMatch.length) { console.log(`⚠️ Sin match en enrollments (${sinMatch.length}):`); sinMatch.forEach(x => console.log(`   - ${x}`)); }

  if (!COMMIT) { console.log(`\n🟢 DRY RUN. Nada escrito.\n`); return; }

  let ok = 0;
  for (const [id, custom] of updates) {
    const { error } = await supabase.from('program_enrollments').update({ custom_form_data: custom }).eq('id', id);
    if (error) console.warn(`   ⚠️ ${id}: ${error.message}`); else ok++;
  }
  console.log(`\n✅ ${ok} enrollments actualizados con retiro/riesgo.\n`);
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
