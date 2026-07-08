// ============================================================================
// upload_asistencia.mjs — Sincroniza asistencia sesión por sesión + rutas +
// historial de transiciones desde la Matriz Maestra de Horizontes Senior.
//
//   node scripts/upload_asistencia.mjs            → DRY RUN (no escribe nada)
//   node scripts/upload_asistencia.mjs --commit   → escribe en Supabase
//
// Fuentes de verdad:
//   • Grupo actual + asistencia  → hoja de "Seguimiento progreso {grupo}"
//   • Ruta inicial / historial   → hoja "Matriz Maestra"
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';
const EXCEL_PATH = resolve(__dirname, '../bases_de_datos/Horizontes_Senior_Matriz_Maestra_VF.xlsx');
const YEAR = 2026;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const norm = (d) => String(d ?? '').replace(/\D/g, '').trim();
const lc = (s) => String(s ?? '').toLowerCase().trim();

// ── Parseo de una hoja de seguimiento ──────────────────────────────────────
function parseAttendanceValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isNaN(n)) return n > 0;
  const s = lc(v);
  if (['sí', 'si', 'asistió', 'asistio', 'entregó', 'entrego', 'x', 'true'].includes(s)) return true;
  if (['no', 'no asistió', 'no asistio', 'no entregó', 'false'].includes(s)) return false;
  return null;
}

function extractDate(label) {
  const m = String(label).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = String(m[1]).padStart(2, '0');
  const month = String(m[2]).padStart(2, '0');
  return `${YEAR}-${month}-${day}`;
}

function parseSeguimiento(wb, sheetName, grupo, headerRange = 0) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, range: headerRange });
  const people = [];
  for (const r of rows) {
    const doc = norm(r['Número de Documento']);
    if (!doc) continue;
    const sesiones = [], cafes = [], entregables = [];
    let obs = null;
    for (const [col, val] of Object.entries(r)) {
      if (/^__empty/i.test(col)) continue;
      if (/^sesi[oó]n/i.test(col)) {
        sesiones.push({ actividad: col.trim(), fecha: extractDate(col), asistio: parseAttendanceValue(val) });
      } else if (/^caf[eé]/i.test(col)) {
        cafes.push({ actividad: col.trim(), fecha: null, asistio: parseAttendanceValue(val) });
      } else if (/^entregable/i.test(col)) {
        entregables.push({ actividad: col.trim(), fecha: null, asistio: parseAttendanceValue(val) });
      } else if (/^observaci/i.test(col) && val) {
        obs = String(val).trim();
      }
    }
    const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isNaN(n) ? null : n; };
    people.push({
      doc,
      email: lc(r['Correo Electrónico']),
      name: (r['Nombre Completo'] || '').trim(),
      grupo,
      sesiones, cafes, entregables,
      observacion: obs,
      pond_sesiones: num(r['Ponderado Asistencia sesiones 35%']),
      pond_cafes: num(r['Ponderado asistencia cafés 40%']),
      pond_entregables: num(r['Ponderado entregables 25%']),
      total_ponderado: num(r['Total ponderado']),
    });
  }
  return people;
}

// ── Parseo Matriz Maestra (historial) ──────────────────────────────────────
function parseMatriz(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Matriz Maestra'], { defval: null });
  const map = new Map();
  for (const r of rows) {
    const doc = norm(r['Número de Documento']);
    if (!doc) continue;
    map.set(doc, {
      doc,
      name: (r['Nombre Completo'] || '').trim(),
      email: lc(r['Correo Electrónico']),
      seleccionado: lc(r['Resultado de Selección Final']) === 'seleccionado',
      ruta_inicial: (r['Ruta Asignada al Inicio de la Nivelación'] || '').trim(),
      ruta_definitiva_matriz: (r['Ruta definitiva'] || '').trim(),
      clasificacion: (r['Clasificación Final'] || '').trim(),
      cambio_nivel_texto: (r['Cambio de Nivel durante la Nivelación'] || '').trim(),
      elegible_ascenso: (r['Elegible para Ascenso a Senior'] || '').trim(),
      reasignada_senior: r['Reasignadas a ruta Senior'] === true,
      completitud: r['Porcentaje de Completitud en Nivelación'],
      como_seleccionado: (r['Cómo Fue Seleccionado'] || '').trim(),
    });
  }
  return map;
}

// ── Derivar historial de la persona ────────────────────────────────────────
function derivarHistorial(grupoActual, m) {
  const inicial = m?.ruta_inicial && m.ruta_inicial !== 'No aplica' ? m.ruta_inicial : null;
  let cambio_nivel = 'Sin cambio';
  let historia = '';
  if (grupoActual === 'Activación') {
    cambio_nivel = 'Ingresó por estrategia de activación';
    historia = 'Ingresó al programa mediante la estrategia de activación.';
  } else if (grupoActual === 'Inactivo') {
    cambio_nivel = `Inactivo${inicial ? ` (era ${inicial})` : ''}`;
    historia = `Se retiró del programa${inicial ? ` (venía de ${inicial})` : ''}.`;
  } else if (inicial && inicial !== grupoActual) {
    if (inicial === 'Junior' && grupoActual === 'Senior') {
      cambio_nivel = 'Ascendió de Junior a Senior';
      historia = m?.elegible_ascenso?.startsWith('Sí')
        ? 'Ascendió a Senior tras completar el 100% como Junior.'
        : 'Reasignado a la ruta Senior durante la nivelación.';
    } else if (inicial === 'Senior' && grupoActual === 'Junior') {
      cambio_nivel = 'Descendió de Senior a Junior';
      historia = m?.cambio_nivel_texto || 'Reubicado en Junior por completitud menor al 60%.';
    } else {
      cambio_nivel = `Cambió de ${inicial} a ${grupoActual}`;
      historia = m?.cambio_nivel_texto || '';
    }
  } else {
    historia = `Se mantuvo en la ruta ${grupoActual}.`;
  }
  return { ruta_inicial: inicial, cambio_nivel, historia, completitud_nivelacion: m?.completitud ?? null };
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  CARGA DE ASISTENCIA — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`${'='.repeat(70)}\n`);

  const wb = XLSX.readFile(EXCEL_PATH);
  const jr = parseSeguimiento(wb, 'Seguimiento progreso Junior', 'Junior', 0);
  const sr = parseSeguimiento(wb, 'Seguimiento progreso Senior', 'Senior', 0);
  const act = parseSeguimiento(wb, 'Seguimiento progreso grupo de a', 'Activación', 1);
  const matriz = parseMatriz(wb);
  console.log(`📄 Hojas: Junior=${jr.length}  Senior=${sr.length}  Activación=${act.length}  | Matriz=${matriz.size} personas`);

  const enSeguimiento = [...jr, ...sr, ...act];
  const docsSeguimiento = new Set(enSeguimiento.map(p => p.doc));

  // Cohort activo
  const { data: cohort } = await supabase.from('cohorts').select('id,name').eq('status', 'active')
    .order('created_at', { ascending: false }).limit(1).single();
  console.log(`✅ Cohort: ${cohort.name} (${cohort.id})`);
  const cohortId = cohort.id;

  // Candidatos (por doc y email)
  const allDocs = [...new Set([...enSeguimiento.map(p => p.doc)])];
  const allEmails = [...new Set(enSeguimiento.map(p => p.email).filter(Boolean))];
  const candByDoc = new Map(), candByEmail = new Map();
  for (let i = 0; i < allDocs.length; i += 300) {
    const { data } = await supabase.from('candidates').select('id,document_number,email').in('document_number', allDocs.slice(i, i + 300));
    (data || []).forEach(c => { candByDoc.set(norm(c.document_number), c.id); if (c.email) candByEmail.set(lc(c.email), c.id); });
  }
  for (let i = 0; i < allEmails.length; i += 300) {
    const { data } = await supabase.from('candidates').select('id,email').in('email', allEmails.slice(i, i + 300));
    (data || []).forEach(c => { if (c.email) candByEmail.set(lc(c.email), c.id); });
  }
  const resolveCandidate = (p) => candByDoc.get(p.doc) || candByEmail.get(p.email) || null;

  // Enrollments actuales
  const { data: enrs } = await supabase.from('program_enrollments')
    .select('id,candidate_id,status,custom_form_data, candidates(document_number,email)').eq('cohort_id', cohortId);
  const enrByCand = new Map((enrs || []).map(e => [e.candidate_id, e]));

  // ── Construir plan ────────────────────────────────────────────────────────
  const plan = { insertEnrollments: [], updateEnrollments: [], attendanceRows: [], sinCandidato: [], sinCambio: 0 };

  for (const p of enSeguimiento) {
    const candidateId = resolveCandidate(p);
    if (!candidateId) { plan.sinCandidato.push(p); continue; }
    const m = matriz.get(p.doc);
    const hist = derivarHistorial(p.grupo, m);

    const custom = {
      cedula: p.doc,
      nombre_completo: p.name,
      ruta_asignada: p.grupo,
      estado_activo: true,
      ...hist,
      motivo_cambio: m?.cambio_nivel_texto || null,
      como_seleccionado: m?.como_seleccionado || null,
      pond_sesiones: p.pond_sesiones,
      pond_cafes: p.pond_cafes,
      pond_entregables: p.pond_entregables,
      total_ponderado: p.total_ponderado,
    };
    const attendance_percentage = p.pond_sesiones != null ? Math.round(p.pond_sesiones * 100) : null;

    const existing = enrByCand.get(candidateId);
    if (existing) {
      plan.updateEnrollments.push({ id: existing.id, candidateId, grupo: p.grupo, custom: { ...(existing.custom_form_data || {}), ...custom }, attendance_percentage, status: 'active' });
    } else {
      plan.insertEnrollments.push({ candidateId, grupo: p.grupo, custom, attendance_percentage, doc: p.doc, name: p.name });
    }

    // Filas de asistencia
    const push = (tipo, arr) => arr.forEach((a, i) => plan.attendanceRows.push({
      cohort_id: cohortId, candidate_id: candidateId, grupo: p.grupo,
      tipo, actividad: a.actividad, fecha: a.fecha, orden: i + 1, asistio: a.asistio,
      observacion: tipo === 'sesion' ? p.observacion : null,
    }));
    push('sesion', p.sesiones); push('cafe', p.cafes); push('entregable', p.entregables);
  }

  // Todo enrollment que NO está en una hoja de seguimiento → INACTIVO
  // (confirmado por el equipo: solo continúan quienes están en las matrices de seguimiento).
  //   • inactivosMatriz  → clasificados 'Inactivo' en la matriz
  //   • sinSeguimiento   → seleccionados/enrolled pero fuera de las hojas
  //   • noEnMatriz       → en BD pero sin registro en la matriz (ej. DANIRA)
  const inactivosMatriz = [], sinSeguimiento = [], noEnMatriz = [];
  for (const e of (enrs || [])) {
    const doc = norm(e.custom_form_data?.cedula ?? e.candidates?.document_number);
    if (docsSeguimiento.has(doc)) continue; // en hoja → activo, ya procesado arriba
    const m = matriz.get(doc);
    const rutaPrevia = e.custom_form_data?.ruta_asignada || (m?.ruta_inicial && m.ruta_inicial !== 'No aplica' ? m.ruta_inicial : null) || null;
    const hist = derivarHistorial('Inactivo', m);
    const row = {
      id: e.id, doc, name: m?.name || e.custom_form_data?.nombre_completo, grupoPrevio: rutaPrevia,
      custom: {
        ...(e.custom_form_data || {}),
        ruta_asignada: rutaPrevia, estado_activo: false, ...hist,
        motivo_cambio: m
          ? (/inactivo/i.test(m.clasificacion) || /inactivo/i.test(m.ruta_definitiva_matriz)
              ? (m.cambio_nivel_texto || 'Clasificado como inactivo en la matriz.')
              : 'No continúa: no figura en las matrices de seguimiento activas.')
          : 'No figura en la matriz maestra.',
      },
    };
    if (!m) noEnMatriz.push(row);
    else if (/inactivo/i.test(m.clasificacion) || /inactivo/i.test(m.ruta_definitiva_matriz)) inactivosMatriz.push(row);
    else sinSeguimiento.push(row);
  }
  const inactivos = [...inactivosMatriz, ...sinSeguimiento, ...noEnMatriz];

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(70)}\n  RESUMEN DEL PLAN\n${'─'.repeat(70)}`);
  const byGrupo = (arr) => { const g = {}; arr.forEach(x => g[x.grupo] = (g[x.grupo] || 0) + 1); return JSON.stringify(g); };
  console.log(`  Enrollments a ACTUALIZAR (en hoja):     ${plan.updateEnrollments.length}  ${byGrupo(plan.updateEnrollments)}`);
  console.log(`  Enrollments a CREAR (Activación nuevos): ${plan.insertEnrollments.length}  ${byGrupo(plan.insertEnrollments)}`);
  console.log(`  Marcar INACTIVOS (total):                ${inactivos.length}`);
  console.log(`     ├─ clasificados 'Inactivo' en matriz: ${inactivosMatriz.length}`);
  inactivosMatriz.forEach(x => console.log(`       • ${x.doc} ${x.name} (era ${x.grupoPrevio})`));
  console.log(`     ├─ sin hoja de seguimiento:           ${sinSeguimiento.length}`);
  sinSeguimiento.forEach(x => console.log(`       • ${x.doc} ${x.name} (era ${x.grupoPrevio})`));
  console.log(`     └─ no figuran en la matriz:           ${noEnMatriz.length}`);
  noEnMatriz.forEach(x => console.log(`       • ${x.doc} ${x.name} (era ${x.grupoPrevio})`));
  console.log(`  Filas de asistencia a cargar:             ${plan.attendanceRows.length}`);
  if (plan.sinCandidato.length) {
    console.log(`  ⚠️  En hoja pero SIN candidato en BD:      ${plan.sinCandidato.length}`);
    plan.sinCandidato.forEach(p => console.log(`       • ${p.doc} ${p.name} ${p.email}`));
  }

  const transiciones = plan.updateEnrollments.filter(u => u.custom.cambio_nivel && u.custom.cambio_nivel !== 'Sin cambio');
  console.log(`\n  Transiciones detectadas: ${transiciones.length}`);
  const tg = {}; transiciones.forEach(t => tg[t.custom.cambio_nivel] = (tg[t.custom.cambio_nivel] || 0) + 1);
  Object.entries(tg).forEach(([k, v]) => console.log(`       ${v}\t${k}`));

  if (!COMMIT) {
    console.log(`\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n`);
    return;
  }

  // ── Escritura ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(70)}\n  ESCRIBIENDO EN SUPABASE...\n${'─'.repeat(70)}`);

  // 1. Crear enrollments Activación
  for (const ins of plan.insertEnrollments) {
    const { error } = await supabase.from('program_enrollments').insert({
      cohort_id: cohortId, candidate_id: ins.candidateId, status: 'active',
      custom_form_data: ins.custom, attendance_percentage: ins.attendance_percentage, enrolled_at: new Date().toISOString(),
    });
    if (error) console.warn(`   ⚠️ insert ${ins.doc}: ${error.message}`);
  }
  console.log(`   ✅ ${plan.insertEnrollments.length} enrollments de Activación creados`);

  // 2. Actualizar enrollments (activos)
  let upd = 0;
  for (const u of plan.updateEnrollments) {
    const { error } = await supabase.from('program_enrollments')
      .update({ custom_form_data: u.custom, attendance_percentage: u.attendance_percentage, status: u.status })
      .eq('id', u.id);
    if (error) console.warn(`   ⚠️ update ${u.candidateId}: ${error.message}`); else upd++;
  }
  console.log(`   ✅ ${upd} enrollments actualizados`);

  // 3. Inactivos
  let ina = 0;
  for (const x of inactivos) {
    const { error } = await supabase.from('program_enrollments')
      .update({ custom_form_data: x.custom, status: 'inactive' }).eq('id', x.id);
    if (error) console.warn(`   ⚠️ inactivo ${x.doc}: ${error.message}`); else ina++;
  }
  console.log(`   ✅ ${ina} marcados inactivos`);

  // 4. session_attendance (si la tabla existe)
  const { error: tableErr } = await supabase.from('session_attendance').select('id', { head: true, count: 'exact' });
  if (tableErr) {
    console.log(`\n   ⚠️  Tabla session_attendance NO existe todavía — omito la carga de asistencia detallada.`);
    console.log(`       Ejecuta scripts/migracion_session_attendance.sql en el SQL Editor y vuelve a correr con --commit.`);
  } else {
    await supabase.from('session_attendance').delete().eq('cohort_id', cohortId);
    for (let i = 0; i < plan.attendanceRows.length; i += 200) {
      const batch = plan.attendanceRows.slice(i, i + 200);
      const { error } = await supabase.from('session_attendance').insert(batch);
      if (error) console.warn(`   ⚠️ asistencia batch ${i}: ${error.message}`);
    }
    console.log(`   ✅ ${plan.attendanceRows.length} filas de asistencia cargadas`);
  }

  console.log(`\n🎉 Carga completada.\n`);
}

main().catch(err => { console.error('\n❌ Error:', err.message); process.exit(1); });
