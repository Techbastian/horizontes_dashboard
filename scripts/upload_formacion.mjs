import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';
const EXCEL_PATH = resolve(__dirname, '../Reportes formacion/estado_detallado_estudiantes_12mayo.xlsx');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 1. Leer Excel ──────────────────────────────────────────────────────────────
function readExcel() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  return rows.map(r => ({
    nombre:        r['Nombre']?.trim(),
    email:         r['Correo']?.trim().toLowerCase(),
    jr_sr:         r['JR_SR']?.trim(),
    ruta:          r['Ruta']?.trim(),
    progreso_ruta: parseFloat(String(r['Progreso_ruta_pct']).replace(',', '.')) || 0,
    total_pct:     parseFloat(String(r['Total_ponderado_pct']).replace(',', '.')) || 0,
    reporte_fecha: r['Reporte de'] || null,
    estado:        r['Estado']?.trim().toUpperCase(), // ACTIVO | INACTIVO
    mensaje:       r['Mensaje']?.trim(),
  }));
}

// ── 2. Obtener cohort activo ───────────────────────────────────────────────────
async function getHorizontesCohort() {
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error(`Error buscando cohort activo: ${error.message}`);
  console.log(`\n✅ Usando cohort: ${data.name} (${data.id})`);
  return data.id;
}

// ── 3. Obtener / crear cursos en education_library ─────────────────────────────
async function ensureCourses(rutasUnicas) {
  const courseMap = {}; // ruta_nombre → course_id

  for (const rutaNombre of rutasUnicas) {
    const { data: existing } = await supabase
      .from('education_library')
      .select('id')
      .eq('title', rutaNombre)
      .single();

    if (existing) {
      courseMap[rutaNombre] = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from('education_library')
        .insert({ title: rutaNombre, provider: 'Horizontes Senior' })
        .select('id')
        .single();

      if (error) throw new Error(`Error creando curso "${rutaNombre}": ${error.message}`);
      courseMap[rutaNombre] = created.id;
      console.log(`  ✨ Curso creado: ${rutaNombre}`);
    }
  }
  return courseMap;
}

// ── 4. Vincular cursos a la cohorte ───────────────────────────────────────────
async function ensureCohortCourses(cohortId, courseMap) {
  for (const courseId of Object.values(courseMap)) {
    const { data: existing } = await supabase
      .from('cohort_courses')
      .select('id')
      .eq('cohort_id', cohortId)
      .eq('course_id', courseId)
      .single();

    if (!existing) {
      const { error } = await supabase
        .from('cohort_courses')
        .insert({ cohort_id: cohortId, course_id: courseId });
      if (error) throw new Error(`Error vinculando curso a cohort: ${error.message}`);
    }
  }
}

// ── 5. Obtener candidatos por email ────────────────────────────────────────────
async function getCandidateMap(emails) {
  const { data, error } = await supabase
    .from('candidates')
    .select('id, email')
    .in('email', emails);

  if (error) throw new Error(`Error buscando candidatos: ${error.message}`);

  const map = {};
  data.forEach(c => { map[c.email.toLowerCase()] = c.id; });
  return map;
}

// ── 6. Reemplazar cohort_course_status (delete + insert) ──────────────────────
async function upsertCourseStatus(cohortId, rows, candidateMap, courseMap) {
  const records = [];
  const notFound = new Set();

  for (const row of rows) {
    const candidateId = candidateMap[row.email];
    const courseId = courseMap[row.ruta];

    if (!candidateId) { notFound.add(row.email); continue; }
    if (!courseId) continue;

    records.push({
      candidate_id:         candidateId,
      cohort_id:            cohortId,
      course_id:            courseId,
      percent_complete:     row.progreso_ruta,
      is_active_enrollment: row.estado === 'ACTIVO',
      last_activity_at:     row.reporte_fecha ? new Date(row.reporte_fecha).toISOString() : null,
      updated_at:           new Date().toISOString(),
      created_at:           new Date().toISOString(),
    });
  }

  if (notFound.size) {
    console.warn(`\n⚠️  Emails no encontrados en candidates (${notFound.size}):`);
    [...notFound].forEach(e => console.warn(`   - ${e}`));
  }

  // Borrar registros previos de esta cohorte y reinsertar
  const { error: delError } = await supabase
    .from('cohort_course_status')
    .delete()
    .eq('cohort_id', cohortId);
  if (delError) throw new Error(`Error borrando registros previos: ${delError.message}`);

  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const { error } = await supabase
      .from('cohort_course_status')
      .insert(batch);
    if (error) throw new Error(`Error en insert cohort_course_status: ${error.message}`);
  }

  return records.length;
}

// ── 7. Marcar INACTIVOS en program_enrollments ────────────────────────────────
async function updateEnrollmentStatus(cohortId, rows, candidateMap) {
  // Personas inactivas: al menos una fila con INACTIVO (todas sus rutas serán INACTIVO)
  const inactivos = new Set(
    rows.filter(r => r.estado === 'INACTIVO').map(r => candidateMap[r.email]).filter(Boolean)
  );

  let updated = 0;
  for (const candidateId of inactivos) {
    const { error } = await supabase
      .from('program_enrollments')
      .update({ status: 'inactive' })
      .eq('cohort_id', cohortId)
      .eq('candidate_id', candidateId);
    if (error) console.warn(`  ⚠️ No se pudo actualizar enrollment de ${candidateId}: ${error.message}`);
    else updated++;
  }
  return updated;
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Leyendo Excel...');
  const rows = readExcel();
  console.log(`   ${rows.length} filas leídas`);

  const emails = [...new Set(rows.map(r => r.email).filter(Boolean))];
  const rutasUnicas = [...new Set(rows.map(r => r.ruta).filter(Boolean))];
  console.log(`   ${emails.length} personas únicas | ${rutasUnicas.length} rutas únicas`);

  console.log('\n🔍 Buscando cohort Horizontes...');
  const cohortId = await getHorizontesCohort();

  console.log('\n📚 Verificando cursos en education_library...');
  const courseMap = await ensureCourses(rutasUnicas);
  console.log(`   ${Object.keys(courseMap).length} cursos listos`);

  console.log('\n🔗 Vinculando cursos a la cohorte...');
  await ensureCohortCourses(cohortId, courseMap);

  console.log('\n👤 Mapeando candidatos por email...');
  const candidateMap = await getCandidateMap(emails);
  console.log(`   ${Object.keys(candidateMap).length} / ${emails.length} candidatos encontrados`);

  console.log('\n⬆️  Subiendo progreso a cohort_course_status...');
  const uploaded = await upsertCourseStatus(cohortId, rows, candidateMap, courseMap);
  console.log(`   ✅ ${uploaded} registros subidos`);

  console.log('\n🔄 Actualizando inactivos en program_enrollments...');
  const inactivosActualizados = await updateEnrollmentStatus(cohortId, rows, candidateMap);
  console.log(`   ✅ ${inactivosActualizados} personas marcadas como inactivas`);

  console.log('\n🎉 Carga completada.');
}

main().catch(err => { console.error('\n❌ Error:', err.message); process.exit(1); });
