// ============================================================================
// upload_registro_circulos.mjs — Marca quién de Círculos de Conocimiento ya se
// registró en la plataforma de formación, y ajusta su estado en el programa.
//
//   node scripts/upload_registro_circulos.mjs            → DRY RUN (no escribe)
//   node scripts/upload_registro_circulos.mjs --commit   → escribe en Supabase
//
// FUENTE: bases_de_datos/Informe_Usuarios_circulos_activos.xlsx, hoja
// "Circulos de conocimiento" (el cruce ya viene hecho en el archivo). Trae dos
// columnas de estado que NO dicen lo mismo:
//   • "Estado registro"   → 65 Registrado / 198 No registrado. Confirmado por
//                           coincidencia de CORREO. Es la que manda aquí.
//   • "Estado registro 2" → separa de los "No registrado" a 59 personas que sí
//                           aparecen en la plataforma por NOMBRE pero con otro
//                           correo. Ni confirmadas ni descartadas.
//
// Decisión del usuario (2026-07-29): activos = solo los confirmados. Los otros
// 198 pasan a inactivos. El valor exacto de las DOS columnas se guarda en
// custom_form_data (`registro_plataforma`, `registro_plataforma_detalle`) para
// no perder el matiz: cuando se verifiquen los correos de esos 59, se re-corre
// y varios volverán a activos.
//
// NO escribe ningún objeto `retiro`: no haberse registrado en la plataforma no
// es un retiro del programa, y mezclarlos ensuciaría la lectura de retención.
//
// Identidad: los 263 emparejan por documento (verificado antes de escribir);
// queda el correo como respaldo por si el reporte cambia de fuente.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const EXCEL_PATH = resolve(__dirname, '../bases_de_datos/Informe_Usuarios_circulos_activos.xlsx');
const HOJA = 'Circulos de conocimiento';
const COHORT_ID = '386dcf50-e269-4b5b-b248-aaa754dbd0aa'; // Círculos de Conocimiento I

// El valor que cuenta como "registrado". Se compara en minúsculas y sin espacios.
const VALOR_REGISTRADO = 'registrado';

const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

const normDoc = (d) => String(d ?? '').replace(/\D/g, '').replace(/^0+/, '');
const lcMail = (e) => String(e ?? '').toLowerCase().trim();
const limpio = (v) => String(v ?? '').trim();

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  REGISTRO EN PLATAFORMA — CÍRCULOS — ${COMMIT ? '🔴 COMMIT (escribe en producción)' : '🟢 DRY RUN (no escribe)'}`);
  console.log(`${'='.repeat(70)}\n`);

  const wb = XLSX.readFile(EXCEL_PATH);
  if (!wb.Sheets[HOJA]) throw new Error(`El archivo no tiene la hoja "${HOJA}"`);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[HOJA], { defval: null });
  console.log(`📄 ${filas.length} filas en la hoja "${HOJA}"`);

  const porDoc = new Map(), porMail = new Map();
  for (const r of filas) {
    const estado = limpio(r['Estado registro']);
    const detalle = limpio(r['Estado registro 2']);
    const info = {
      nombre: limpio(r['Nombre completo']),
      estado,
      detalle,
      registrado: estado.toLowerCase() === VALOR_REGISTRADO,
    };
    const d = normDoc(r['Número documento']);
    if (d) porDoc.set(d, info);
    const m = lcMail(r['Correo']);
    if (m) porMail.set(m, info);
  }

  const resumen = {};
  for (const i of porDoc.values()) resumen[i.detalle || i.estado] = (resumen[i.detalle || i.estado] || 0) + 1;
  console.log('   Estado según el reporte:');
  for (const [k, n] of Object.entries(resumen).sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)} × ${k}`);

  const { data: enrs, error } = await supabase
    .from('program_enrollments')
    .select('id, status, custom_form_data, candidate:candidates(id, document_number, email)')
    .eq('cohort_id', COHORT_ID);
  if (error) throw error;
  console.log(`\n🗂️  ${enrs.length} matrículas en la cohorte`);

  const plan = [];
  const sinDatoEnReporte = [];
  for (const e of enrs) {
    const cf = e.custom_form_data || {};
    const doc = normDoc(cf.cedula || e.candidate?.document_number);
    const mail = lcMail(e.candidate?.email);
    const info = (doc && porDoc.get(doc)) || (mail && porMail.get(mail)) || null;
    const nombre = cf.nombre_completo || info?.nombre || '(sin nombre)';

    if (!info) { sinDatoEnReporte.push(nombre); continue; }

    const activoAhora = cf.estado_activo !== false && e.status !== 'inactive';
    const cambiaEstado = activoAhora !== info.registrado;
    const cambiaRegistro = cf.registro_plataforma !== info.estado || cf.registro_plataforma_detalle !== info.detalle;
    if (!cambiaEstado && !cambiaRegistro) continue;

    plan.push({
      id: e.id,
      nombre,
      de: activoAhora ? 'activo' : 'inactivo',
      a: info.registrado ? 'activo' : 'inactivo',
      cambiaEstado,
      custom: {
        ...cf,
        estado_activo: info.registrado,
        registro_plataforma: info.estado,
        registro_plataforma_detalle: info.detalle,
      },
      status: info.registrado ? 'active' : 'inactive',
    });
  }

  const aInactivo = plan.filter((p) => p.cambiaEstado && p.a === 'inactivo');
  const aActivo = plan.filter((p) => p.cambiaEstado && p.a === 'activo');
  console.log(`\n${'─'.repeat(70)}\n  RESUMEN DEL PLAN\n${'─'.repeat(70)}`);
  console.log(`  Matrículas a actualizar:        ${plan.length}`);
  console.log(`     pasan a INACTIVO:            ${aInactivo.length}`);
  console.log(`     pasan a ACTIVO:              ${aActivo.length}`);
  console.log(`     solo se les anota el estado: ${plan.length - aInactivo.length - aActivo.length}`);
  if (sinDatoEnReporte.length) {
    console.log(`  ⚠️  Matriculados que NO están en el reporte: ${sinDatoEnReporte.length}`);
    sinDatoEnReporte.forEach((n) => console.log(`       • ${n} (se deja como está)`));
  }
  if (aActivo.length) {
    console.log(`\n  Vuelven a activo:`);
    aActivo.forEach((p) => console.log(`       • ${p.nombre}`));
  }

  if (!COMMIT) {
    console.log(`\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.`);
    return;
  }

  console.log(`\n${'─'.repeat(70)}\n  ESCRIBIENDO EN SUPABASE...\n${'─'.repeat(70)}`);
  let n = 0;
  for (const p of plan) {
    const { error: upErr } = await supabase
      .from('program_enrollments')
      .update({ custom_form_data: p.custom, status: p.status })
      .eq('id', p.id);
    if (upErr) throw new Error(`Error actualizando ${p.nombre}: ${upErr.message}`);
    n++;
  }
  console.log(`   ✅ ${n} matrículas actualizadas`);
  console.log(`\n🎉 Listo.`);
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
