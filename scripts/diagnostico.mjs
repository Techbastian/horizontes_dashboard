// ============================================================================
// diagnostico.mjs — Utilidades de inspección read-only de Supabase.
// Reemplaza los antiguos scripts sueltos de scratch/ (testEnrollments, testIds,
// testJoin, testReemplazo). Todos consultan la BD sin escribir nada.
//
//   node scripts/diagnostico.mjs              → corre todos los chequeos
//   node scripts/diagnostico.mjs enrollments  → muestra enrollments de ejemplo
//   node scripts/diagnostico.mjs ids          → verifica project/cohort/enrollment ids
//   node scripts/diagnostico.mjs join         → enrollment + candidate (join)
//   node scripts/diagnostico.mjs rutas        → distribución de rutas/grupos
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lee credenciales del .env de la raíz del proyecto (clave anónima, solo lectura)
const env = readFileSync(resolve(__dirname, '../.env'), 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Los diagnósticos apuntan a Horizontes Senior. Se fija por slug porque la base
// aloja varios programas activos (Círculos de Conocimiento) y `status='active'`
// con `.single()` falla en cuanto hay más de uno.
const PROJECT_SLUG = 'horizontes-senior';
const line = (t) => console.log(`\n${'─'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`);

// ── Chequeos ────────────────────────────────────────────────────────────────
async function enrollments() {
  line('ENROLLMENTS (muestra)');
  const { data, error } = await supabase.from('program_enrollments').select('*').limit(3);
  if (error) return console.error('Error:', error.message);
  console.log(`Filas de ejemplo: ${data.length}`);
  console.dir(data, { depth: 2 });
}

async function ids() {
  line('IDs: PROJECT → COHORT → ENROLLMENT');
  const { data: proj } = await supabase.from('projects').select('id, name, status').eq('slug', PROJECT_SLUG).single();
  console.log('Proyecto:', proj);
  const { data: coh } = await supabase.from('cohorts').select('id, name, program_id').eq('program_id', proj.id).single();
  console.log('Cohorte:', coh);
  const { data: enrs } = await supabase.from('program_enrollments').select('cohort_id').limit(1);
  console.log('Enrollments apuntan a cohort_id:', enrs[0]?.cohort_id);
  console.log('¿Coincide?:', coh.id === enrs[0]?.cohort_id);
}

async function join() {
  line('ENROLLMENT + CANDIDATE (join)');
  const { data, error } = await supabase.from('program_enrollments').select(`
    id, status, custom_form_data, created_at,
    candidate:candidates(
      id, first_name, last_name, email, city, document_type, document_number, phone, gender, age
    )
  `).limit(1);
  if (error) return console.error('Error:', error.message);
  console.dir(data, { depth: 3 });
}

async function rutas() {
  line('DISTRIBUCIÓN DE RUTAS / GRUPOS');
  const { data: proj } = await supabase.from('projects').select('id').eq('slug', PROJECT_SLUG).single();
  const { data: coh } = await supabase.from('cohorts').select('id').eq('program_id', proj.id).single();

  const { data: enrs } = await supabase.from('program_enrollments').select('custom_form_data').eq('cohort_id', coh.id);
  console.log('Total enrollments:', enrs.length);
  const rutasCount = {};
  enrs.forEach(e => { const r = e.custom_form_data?.ruta_asignada || 'none'; rutasCount[r] = (rutasCount[r] || 0) + 1; });
  console.log('Rutas en enrollments:', rutasCount);

  const { data: apps } = await supabase.from('project_applications').select('custom_answers').eq('cohort_id', coh.id);
  const gruposApps = {};
  apps.forEach(a => { const g = a.custom_answers?.seguimiento_fases?.grupo_asignado || 'none'; gruposApps[g] = (gruposApps[g] || 0) + 1; });
  console.log('Grupos en applications:', gruposApps);
}

const CHECKS = { enrollments, ids, join, rutas };

async function main() {
  const arg = process.argv[2];
  const toRun = arg && CHECKS[arg] ? [arg] : Object.keys(CHECKS);
  if (arg && !CHECKS[arg]) console.log(`⚠️  Chequeo "${arg}" no existe. Disponibles: ${Object.keys(CHECKS).join(', ')}. Corriendo todos.`);
  for (const name of toRun) await CHECKS[name]();
  console.log('');
}

main().catch(err => { console.error('\n❌ Error:', err.message); process.exit(1); });
