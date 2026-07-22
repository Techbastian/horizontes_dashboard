import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';

const COHORT_SLUG   = 'horizontes-senior-2026'; // cohorte destino: Horizontes Senior
const LISTA_PATH    = resolve(__dirname, '../Reportes formacion/Lista definitva.xlsx');
const ESTADO_PATH   = resolve(__dirname, '../Reportes formacion/estado_detallado_estudiantes_07mayo.xlsx');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const normalizeDoc = (d) => String(d ?? '').replace(/[.\s,\-]/g, '').trim();
const normalizeEmail = (e) => String(e ?? '').toLowerCase().trim();

// ── 1. Leer Lista definitiva ───────────────────────────────────────────────────
function readListaDefinitiva() {
  const wb = XLSX.readFile(LISTA_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  return rows
    .filter(r => r['Documento'])
    .map(r => ({
      doc:      normalizeDoc(r['Documento']),
      name:     String(r['Nombre Completo'] ?? '').trim(),
      email:    normalizeEmail(r['Correo Electrónico']),
      phone:    String(r['Teléfono'] ?? '').trim(),
      isActive: String(r['Estado'] ?? '').trim().toUpperCase() === 'ACTIVO',
    }));
}

// ── 2. Leer estado detallado → email → track ──────────────────────────────────
function readEstadoDetallado() {
  const wb = XLSX.readFile(ESTADO_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  const map = {};
  rows.forEach(r => {
    const email = normalizeEmail(r['Correo']);
    const jrsr  = String(r['JR_SR'] ?? '').trim();
    if (email && jrsr && !map[email]) map[email] = jrsr;
  });
  return map; // email → 'Jr' | 'Sr'
}

// ── 3. Obtener la cohorte de Horizontes Senior ────────────────────────────────
// Fijada por slug: la base aloja varios programas (Círculos de Conocimiento) y
// `status='active'` sin orden no garantiza cuál de las cohortes devuelve.
async function getCohortId() {
  const { data, error } = await supabase
    .from('cohorts').select('id, name').eq('slug_application', COHORT_SLUG).limit(1).single();
  if (error) throw new Error(`No se encontró la cohorte "${COHORT_SLUG}": ${error.message}`);
  console.log(`✅ Cohorte: ${data.name} (${data.id})`);
  return data.id;
}

// ── 4. Cargar candidatos de Supabase → map por doc Y por email (fallback) ─────
async function getCandidateMaps() {
  const byDoc = {}, byEmail = {};
  let page = 0;
  const size = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('candidates')
      .select('id, email, document_number')
      .range(page * size, (page + 1) * size - 1);
    if (error) throw new Error(`Error candidates: ${error.message}`);
    data.forEach(c => {
      const entry = { id: c.id, currentEmail: normalizeEmail(c.email) };
      byDoc[normalizeDoc(c.document_number)] = entry;
      byEmail[normalizeEmail(c.email)]       = entry;
    });
    if (data.length < size) break;
    page++;
  }
  return { byDoc, byEmail };
}

// ── 5. Cargar matrículas existentes → set de candidate_ids ───────────────────
async function getEnrolledSet(cohortId) {
  const { data, error } = await supabase
    .from('program_enrollments')
    .select('id, candidate_id, status, custom_form_data')
    .eq('cohort_id', cohortId);
  if (error) throw new Error(`Error enrollments: ${error.message}`);

  const map = {};
  data.forEach(e => { map[e.candidate_id] = e; });
  return map; // candidate_id → enrollment record
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Leyendo archivos...');
  const lista   = readListaDefinitiva();
  const trackMap = readEstadoDetallado();
  console.log(`   Lista definitiva: ${lista.length} personas`);
  console.log(`   Estado detallado: ${Object.keys(trackMap).length} emails con track`);

  console.log('\n🔍 Conectando a Supabase...');
  const cohortId              = await getCohortId();
  const { byDoc, byEmail }    = await getCandidateMaps();
  const enrolledMap           = await getEnrolledSet(cohortId);

  const report = {
    emailsActualizados: [],
    matriculasCreadas:  [],
    estadoActualizado:  [],
    sinTrack:           [],
    noEncontrados:      [],
    conflictosEmail:    [],
  };

  console.log('\n⚙️  Procesando 120 personas...\n');

  for (const person of lista) {
    const candidate = byDoc[person.doc] || byEmail[person.email];

    if (!candidate) {
      report.noEncontrados.push({ doc: person.doc, name: person.name });
      continue;
    }

    const { id: candidateId, currentEmail } = candidate;
    const track = trackMap[person.email]; // Jr | Sr | undefined

    // ── A. Actualizar email si cambió ─────────────────────────────────────────
    if (person.email && person.email !== currentEmail) {
      const { error } = await supabase
        .from('candidates')
        .update({ email: person.email })
        .eq('id', candidateId);

      if (error) {
        report.conflictosEmail.push({ doc: person.doc, name: person.name, newEmail: person.email, error: error.message });
      } else {
        report.emailsActualizados.push({ name: person.name, old: currentEmail, new: person.email });
      }
    }

    const enrollment = enrolledMap[candidateId];

    // ── B. Ya tiene matrícula → actualizar estado_activo ──────────────────────
    if (enrollment) {
      const currentActive = enrollment.custom_form_data?.estado_activo;
      if (currentActive !== person.isActive) {
        const { error } = await supabase
          .from('program_enrollments')
          .update({
            status: person.isActive ? 'active' : 'inactive',
            custom_form_data: {
              ...(enrollment.custom_form_data || {}),
              estado_activo: person.isActive,
            },
          })
          .eq('id', enrollment.id);

        if (!error) report.estadoActualizado.push({ name: person.name, isActive: person.isActive });
      }
      continue;
    }

    // ── C. Sin matrícula (Reemplazo) → crear enrollment ──────────────────────
    if (!track) {
      report.sinTrack.push({ doc: person.doc, name: person.name, email: person.email });
      continue;
    }

    const ruta = track === 'Sr' ? 'Senior' : 'Junior';

    const { error } = await supabase
      .from('program_enrollments')
      .insert({
        cohort_id:        cohortId,
        candidate_id:     candidateId,
        status:           person.isActive ? 'active' : 'inactive',
        enrolled_at:      new Date().toISOString(),
        custom_form_data: {
          estado_activo:   person.isActive,
          ruta_asignada:   ruta,
          nombre_completo: person.name,
        },
      });

    if (error) {
      report.conflictosEmail.push({ doc: person.doc, name: person.name, error: error.message });
    } else {
      report.matriculasCreadas.push({ name: person.name, ruta, isActive: person.isActive });
    }
  }

  // ── REPORTE ────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════');
  console.log('📊 REPORTE FINAL');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Correos actualizados:    ${report.emailsActualizados.length}`);
  report.emailsActualizados.forEach(e => console.log(`   ${e.name}: ${e.old} → ${e.new}`));

  console.log(`\n✅ Matrículas creadas:      ${report.matriculasCreadas.length}`);
  report.matriculasCreadas.forEach(e => console.log(`   ${e.name} → ${e.ruta} (${e.isActive ? 'Activo' : 'Inactivo'})`));

  console.log(`\n✅ Estado actualizado:      ${report.estadoActualizado.length}`);
  report.estadoActualizado.forEach(e => console.log(`   ${e.name} → ${e.isActive ? 'Activo' : 'Inactivo'}`));

  if (report.sinTrack.length) {
    console.log(`\n⚠️  Sin track (no están en estado detallado): ${report.sinTrack.length}`);
    report.sinTrack.forEach(e => console.log(`   ${e.name} (${e.email})`));
  }
  if (report.noEncontrados.length) {
    console.log(`\n⚠️  No encontrados en Supabase: ${report.noEncontrados.length}`);
    report.noEncontrados.forEach(e => console.log(`   ${e.name} — doc: ${e.doc}`));
  }
  if (report.conflictosEmail.length) {
    console.log(`\n❌ Conflictos/errores: ${report.conflictosEmail.length}`);
    report.conflictosEmail.forEach(e => console.log(`   ${e.name}: ${e.error}`));
  }

  console.log('\n🎉 Sincronización completada.');
}

main().catch(err => { console.error('\n❌ Error fatal:', err.message); process.exit(1); });
