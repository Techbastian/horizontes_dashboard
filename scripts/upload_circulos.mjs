// ============================================================================
// upload_circulos.mjs — Carga los participantes de Círculos de Conocimiento
// desde el formulario de HubSpot (Convocatoria C) a la cohorte del programa.
//
//   node scripts/upload_circulos.mjs            → DRY RUN (no escribe nada)
//   node scripts/upload_circulos.mjs --commit   → escribe en Supabase
//
// Fuente: bases_de_datos/Circulos de conocimiento.xls (271 filas × 73 columnas)
//
// CLAVE: las 271 filas son 263 personas únicas y 249 YA EXISTEN en `candidates`
// (son en su mayoría postulantes de Horizontes Senior que no quedaron). Este
// script NO da de alta 263 personas: vincula las existentes a la nueva cohorte
// y solo crea las 14 que de verdad no están. Cargarlo como altas masivas
// duplicaría personas en la tabla que comparten todos los módulos.
//
// El documento NO es clave confiable (13 de 263 vienen mal digitados), así que
// la identidad se resuelve en cascada de 4 niveles — ver resolverIdentidad().
//
// Escribe en: candidates (solo enriquece campos vacíos), socio_demographic_data,
// project_applications y program_enrollments. Es idempotente: se puede correr
// varias veces sin duplicar.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const SUPABASE_URL = 'https://rbhgyrxblkzxwfrrcavh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaGd5cnhibGt6eHdmcnJjYXZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExNjkyMSwiZXhwIjoyMDkxNjkyOTIxfQ.TMsipnArxDstVFPcARN4-knhQy03mo4Gt1n1ylSpRVg';
const EXCEL_PATH = resolve(__dirname, '../bases_de_datos/Circulos de conocimiento.xls');

const COHORT_ID = '386dcf50-e269-4b5b-b248-aaa754dbd0aa'; // Círculos de Conocimiento I
const ANIO_ACTUAL = 2026;
const RUTA = 'Círculos'; // valor de custom_form_data.ruta_asignada (lo usa el modal de asistencia)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Utilidades de normalización ─────────────────────────────────────────────
const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const normDoc = (d) => String(d ?? '').replace(/\D/g, '').replace(/^0+/, '');
const lcMail = (e) => String(e ?? '').toLowerCase().trim();
const localPart = (e) => lcMail(e).split('@')[0].replace(/[.\-_+]/g, '');
const normPhone = (p) => String(p ?? '').replace(/\D/g, '').slice(-10);

// Los fijos vienen del formulario como " +57 604 2502366". La base guarda los
// teléfonos en dígitos ("3052428604"), así que se quita el indicativo de país.
function limpiarTelefono(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  return d.length > 10 && d.startsWith('57') ? d.slice(2) : d;
}

// El formulario repite el primer nombre en el segundo, y a veces el primer
// apellido ya contiene al segundo:
//   N1="Sandra Maria" N2="Sandra Maria" · A1="Perez Bedoya" A2="Bedoya"
// Sin esto el nombre_completo quedaría "Sandra Maria Sandra Maria Perez Bedoya
// Bedoya", que es justo lo que muestran el dashboard y el modal de asistencia.
function unirSinRepetir(primero, segundo) {
  const a = clean(primero).replace(/\bN\/A\b/gi, '').trim();
  const b = clean(segundo).replace(/\bN\/A\b/gi, '').trim();
  if (!a) return b;
  if (!b) return a;
  const na = a.toLowerCase(), nb = b.toLowerCase();
  if (na === nb || na.endsWith(` ${nb}`)) return a;
  return `${a} ${b}`;
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'na']);
const tokensNombre = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));

function scoreNombre(a, b) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  sa.forEach((t) => { if (sb.has(t)) inter++; });
  return inter / Math.min(sa.size, sb.size);
}

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

// El formulario trae la fecha como d/m/yy (año de 2 dígitos). Regla de siglo:
// yy > 26 → 19yy, si no → 20yy. Reconcilia 265 de 271 con la edad declarada.
function parseFechaNacimiento(valor) {
  const m = clean(valor).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const [, d, mes, yy] = m;
  const anio = Number(yy) > (ANIO_ACTUAL % 100) ? 1900 + Number(yy) : 2000 + Number(yy);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Decisión del usuario: la edad SIEMPRE se calcula desde birth_date; la columna
// "Edad" del formulario se ignora (trae errores, p. ej. una persona con "16").
function edadDesdeFecha(iso) {
  if (!iso) return null;
  const nac = new Date(iso + 'T12:00:00Z');
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - nac.getUTCFullYear();
  const mes = hoy.getUTCMonth() - nac.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoy.getUTCDate() < nac.getUTCDate())) edad--;
  return edad;
}

// El formulario antepone un código al municipio: "3. Medellín" → "Medellín".
const limpiarMunicipio = (v) => clean(v).replace(/^\d+\.\s*/, '');

// `candidates.city` es compartida con los demás programas, así que se alinea a la
// grafía que ya existe allí para no partir los agrupamientos (aunque "Itagí" esté
// mal escrito en la base). La caracterización de Círculos guarda aparte, en
// custom_answers, el nombre correcto tal como viene del formulario.
const CIUDAD_ALIAS = {
  'Otro Municipio de Antioquia': 'Otro Municipio De Antioquia',
  'Otro Fuera de Antioquia': 'Otro Fuera De Antioquia',
  'Itagüí': 'Itagí',
};
const ciudadParaCandidates = (m) => CIUDAD_ALIAS[m] ?? m;

const partirMulti = (v) => clean(v).split(';').map((s) => s.trim()).filter(Boolean);

// Vocabularios: se traducen a los valores que YA usa la base, para no crear
// variantes nuevas que rompan los agrupamientos de los gráficos.
const TIPO_DOC = {
  'cédula de ciudadanía': 'Cédula de Ciudadanía',
  'cédula de extranjería': 'Cédula de Extranjería',
  pasaporte: 'Pasaporte',
};
const ESCOLARIDAD = {
  profesional: 'Profesional',
  tecnólogo: 'Tecnológico',
  especialista: 'Especialización',
  'bachiller (completo)': 'Media Bachiller',
  'bachiller (incompleto)': 'Media Bachiller',
  'técnica laboral': 'Técnico',
  'técnica profesional': 'Técnico',
  maestría: 'Maestría',   // no existía en la base; nivel legítimo, se agrega
  doctor: 'Doctorado',    // idem
  ninguno: 'Ninguno',
};
const mapear = (tabla, valor, fallback = null) => tabla[clean(valor).toLowerCase()] ?? fallback;

// "Vacío" para efectos del enriquecimiento: null, cadena vacía, 0 en edad, y los
// marcadores de "no sé" que ya existen en la base.
const estaVacio = (v) =>
  v === null || v === undefined || (typeof v === 'string' && (v.trim() === '' || v.trim() === 'Sin información')) ||
  (typeof v === 'number' && v === 0);

// ── 1. Lectura y deduplicación del Excel ────────────────────────────────────
function leerExcel() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });

  const porDoc = new Map();
  const duplicados = [];
  filas.forEach((r, i) => {
    const doc = normDoc(r['Número de documento de identidad']);
    if (!doc) return;
    const fecha = clean(r['Conversion Date']);
    const previo = porDoc.get(doc);
    if (!previo) return void porDoc.set(doc, { fila: i + 2, fecha, r, doc });
    // Se queda la inscripción más reciente.
    duplicados.push({ doc, descartada: previo.fecha < fecha ? previo.fila : i + 2, conservada: previo.fecha < fecha ? i + 2 : previo.fila });
    if (previo.fecha < fecha) porDoc.set(doc, { fila: i + 2, fecha, r, doc });
  });

  return { total: filas.length, personas: [...porDoc.values()], duplicados };
}

// Convierte una fila cruda del formulario al modelo que usa el resto del script.
function normalizar({ fila, r, doc }) {
  const nombres = unirSinRepetir(r['Primer nombre'], r['Segundo nombre']);
  const apellidos = unirSinRepetir(r['Primer apellido'], r['Segundo apellido']);
  const birthDate = parseFechaNacimiento(r['Fecha de nacimiento']);

  return {
    fila,
    doc,
    docCrudo: clean(r['Número de documento de identidad']),
    tipoDoc: mapear(TIPO_DOC, r['Tipo de documento'], clean(r['Tipo de documento'])),
    nombres, apellidos,
    nombreCompleto: `${nombres} ${apellidos}`.replace(/\s+/g, ' ').trim(),
    email: lcMail(r['Correo']),
    emailConfirma: lcMail(r['Confirma el correo']),
    celular: limpiarTelefono(r['Celular']) || '',
    fijo: limpiarTelefono(r['Teléfono fijo']),
    birthDate,
    edad: edadDesdeFecha(birthDate),
    edadDeclarada: Number(clean(r['Edad&#xa0;'])) || null,
    sexo: clean(r['Sexo']),
    orientacion: clean(r['Identidad de genero']),
    escolaridad: mapear(ESCOLARIDAD, r['Nivel de escolaridad'], 'Sin información'),
    escolaridadCruda: clean(r['Nivel de escolaridad']),
    municipio: limpiarMunicipio(r['Municipio de residencia']),
    departamento: clean(r['Departamento de residencia']),
    comuna: clean(r['Comuna o corregimiento de residencia']),
    barrio: clean(r['Barrio de residencia']),
    direccion: clean(r['Dirección']),
    estrato: clean(r['Estrato de la vivienda']),
    estadoCivil: clean(r['Estado civil']),
    cabezaHogar: clean(r['¿Es usted cabeza de hogar?']),
    etnia: clean(r['¿Pertenece a algún grupo étnico?']),
    discapacidad: clean(r['¿Cuenta usted con alguna de estas discapacidades?']),
    poblacion: clean(r['¿Es usted parte de alguna de estas poblaciones?']),
    victima: clean(r['¿Ha sido declarado víctima en alguno de estos casos?']),
    empleado: clean(r['¿Es usted empleado?']),
    empresa: clean(r['Nombre de la empresa donde labora']),
    cargo: clean(r['Cargo']) || clean(r['¿Cuál otro cargo?']),
    estudia: clean(r['¿Esta estudiando actualmente?']),
    idiomas: partirMulti(r['Idioma']),
    nivelesIdioma: Object.fromEntries(
      ['Inglés', 'Español', 'Francés', 'Chino', 'Hindi', 'Árabe']
        .map((i) => [i, clean(r[`${i} | Nivel de idioma`])])
        .filter(([, v]) => v)
    ),
    habilidades: partirMulti(r['Selecciona las habilidades técnicas que tienes']),
    powerSkills: partirMulti(r['¿Cuáles son tus soft skills o "power skills"?']),
    linkedin: clean(r['URL de LinkedIn']),
    hubspot: {
      conversion_id: clean(r['Conversion ID']),
      conversion_date: clean(r['Conversion Date']),
      contact_id: clean(r['Contact ID']),
    },
  };
}

// ── 2. Resolución de identidad (cascada de 4 niveles) ───────────────────────
// El documento del formulario viene mal digitado en 13 de 263 casos, así que no
// alcanza con cruzar por documento: sin el nivel 3 se duplicarían 3 personas
// que ya existen (mismo teléfono y nombre, documento a 1 dígito, correo nuevo).
function resolverIdentidad(p, indice) {
  const porDoc = indice.porDoc.get(p.doc);
  if (porDoc) return { candidato: porDoc, nivel: 1, evidencia: 'documento exacto' };

  const porMail = indice.porMail.get(p.email);
  if (porMail) {
    return {
      candidato: porMail, nivel: 2,
      evidencia: `correo exacto (documento difiere: excel ${p.doc} ≠ base ${normDoc(porMail.document_number)})`,
    };
  }

  const tel = normPhone(p.celular), tel2 = normPhone(p.fijo);
  const tokens = tokensNombre(p.nombreCompleto);
  for (const c of indice.todos) {
    const cTel = normPhone(c.phone), cTel2 = normPhone(c.secundary_phone);
    const coincideTel = (tel && (cTel === tel || cTel2 === tel)) || (tel2 && (cTel === tel2 || cTel2 === tel2));
    if (!coincideTel) continue;
    const score = scoreNombre(tokens, tokensNombre(`${c.first_name} ${c.last_name}`));
    if (score < 0.9) continue;
    const dist = distancia(p.doc, normDoc(c.document_number));
    if (dist > 2) continue;
    return {
      candidato: c, nivel: 3,
      evidencia: `teléfono + nombre ${Math.round(score * 100)}% (documento a distancia ${dist}: excel ${p.doc} ≠ base ${normDoc(c.document_number)})`,
    };
  }

  return { candidato: null, nivel: 4, evidencia: 'sin coincidencia — alta nueva' };
}

// ── 3. Construcción de los payloads ─────────────────────────────────────────
function candidatoNuevo(p) {
  return {
    first_name: p.nombres,
    last_name: p.apellidos || p.nombres,
    document_type: p.tipoDoc,
    document_number: p.doc,
    phone: p.celular || p.fijo || '',
    email: p.email,
    city: ciudadParaCandidates(p.municipio) || 'Sin información',
    address: p.direccion || 'Sin información',
    secundary_phone: p.fijo || null,
    birth_date: p.birthDate,
    age: p.edad,
    gender: p.sexo,
    education_level: p.escolaridad,
    acquisition_channel: 'Formulario Círculos de Conocimiento',
  };
}

// Enriquecimiento conservador: solo rellena lo que está vacío. Nunca pisa un
// dato bueno del registro que la persona ya tenía por Horizontes Senior.
function parcheCandidato(existente, p) {
  const posibles = {
    birth_date: p.birthDate,
    age: p.edad,
    gender: p.sexo,
    education_level: p.escolaridad,
    city: p.municipio,
    address: p.direccion,
    secundary_phone: p.fijo,
    phone: p.celular,
  };
  const parche = {};
  for (const [col, valor] of Object.entries(posibles)) {
    if (valor && estaVacio(existente[col])) parche[col] = valor;
  }
  return parche;
}

function socioNuevo(p) {
  return {
    gender_identity: p.sexo,
    sexual_orientation: p.orientacion,
    ethnicity: p.etnia,
    marital_status: p.estadoCivil,
    // Mismo patrón que Horizontes Senior: los tres campos concatenados.
    vulnerability_status: [p.poblacion, p.victima, p.discapacidad].filter(Boolean).join(', '),
  };
}

function parcheSocio(existente, p) {
  const parche = {};
  for (const [col, valor] of Object.entries(socioNuevo(p))) {
    if (valor && estaVacio(existente[col])) parche[col] = valor;
  }
  return parche;
}

function customAnswers(p) {
  return {
    programa: 'Círculos de Conocimiento',
    origen: 'Formulario HubSpot — Convocatoria C',
    caracterizacion: {
      // El sexo se guarda aquí además de en socio_demographic_data: ese campo es
      // compartido y para los que venían de HS conserva el valor heredado, que en
      // algunos casos contradice lo que la persona declaró en este formulario.
      // Para caracterizar Círculos manda lo que se respondió en Círculos.
      sexo: p.sexo,
      identidad_genero: p.orientacion,
      estrato: p.estrato,
      departamento: p.departamento,
      municipio: p.municipio,
      comuna: p.comuna,
      barrio: p.barrio,
      estado_civil: p.estadoCivil,
      cabeza_de_hogar: p.cabezaHogar,
      grupo_etnico: p.etnia,
      discapacidad: p.discapacidad,
      poblacion: p.poblacion,
      victima: p.victima,
      escolaridad: p.escolaridad,
      escolaridad_formulario: p.escolaridadCruda,
      empleado: p.empleado,
      empresa: p.empresa,
      cargo: p.cargo,
      estudia_actualmente: p.estudia,
      idiomas: p.idiomas,
      niveles_idioma: p.nivelesIdioma,
      habilidades_tecnicas: p.habilidades,
      power_skills: p.powerSkills,
      linkedin: p.linkedin,
    },
    hubspot: p.hubspot,
    documento_formulario: p.docCrudo, // se conserva aunque no se pise el de la base
  };
}

function customFormData(p) {
  return {
    nombre_completo: p.nombreCompleto,
    cedula: p.doc,
    elegido: true,
    estado_activo: true,
    ruta_asignada: RUTA,
    programa: 'Círculos de Conocimiento',
  };
}

// ── 4. Carga de la foto actual de la base ───────────────────────────────────
async function traerTodo(tabla, columnas, filtro) {
  let acc = [], page = 0;
  while (true) {
    let q = supabase.from(tabla).select(columnas).range(page * 1000, (page + 1) * 1000 - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (!data?.length) break;
    acc = acc.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return acc;
}

// Nota: `socio_demographic_data.id` y `program_enrollments.id` son bigint
// `generated always as identity`. Aunque el spec de PostgREST los reporta como
// "sin default", Postgres RECHAZA que se les pase un valor explícito
// ("cannot insert a non-DEFAULT value into column id"). Por eso el id se omite
// en ambos inserts y lo genera la base.

// ── 5. Main ─────────────────────────────────────────────────────────────────
const linea = (t) => console.log(`\n${'─'.repeat(74)}\n  ${t}\n${'─'.repeat(74)}`);

async function main() {
  console.log('='.repeat(74));
  console.log(`  CÍRCULOS DE CONOCIMIENTO — ${COMMIT ? '🔴 COMMIT (escribe en Supabase)' : '🟢 DRY RUN (no escribe)'}`);
  console.log('='.repeat(74));

  const { total, personas, duplicados } = leerExcel();
  const gente = personas.map(normalizar);
  console.log(`\n📄 Filas leídas: ${total}  →  personas únicas: ${gente.length}  (duplicados colapsados: ${duplicados.length})`);

  const { data: cohorte, error: cohErr } = await supabase
    .from('cohorts').select('id, name').eq('id', COHORT_ID).single();
  if (cohErr) throw new Error(`No se encontró la cohorte ${COHORT_ID}: ${cohErr.message}`);
  console.log(`✅ Cohorte destino: ${cohorte.name} (${cohorte.id})`);

  const candidatos = await traerTodo('candidates',
    'id, first_name, last_name, email, document_number, phone, secundary_phone, birth_date, age, gender, education_level, city, address');
  const indice = {
    todos: candidatos,
    porDoc: new Map(candidatos.map((c) => [normDoc(c.document_number), c]).filter(([k]) => k)),
    porMail: new Map(candidatos.map((c) => [lcMail(c.email), c]).filter(([k]) => k)),
  };
  console.log(`✅ Candidatos en la base: ${candidatos.length}`);

  const apps = await traerTodo('project_applications', 'id, candidate_id', (q) => q.eq('cohort_id', COHORT_ID));
  const enrs = await traerTodo('program_enrollments', 'id, candidate_id', (q) => q.eq('cohort_id', COHORT_ID));
  const appPorCand = new Map(apps.map((a) => [a.candidate_id, a.id]));
  const enrPorCand = new Set(enrs.map((e) => e.candidate_id));
  console.log(`✅ Ya en la cohorte: ${apps.length} postulaciones, ${enrs.length} matrículas`);

  // ── Planificación ─────────────────────────────────────────────────────────
  const plan = {
    candCrear: [], candEnriquecer: [], candSinCambio: [],
    socioCrear: [], socioEnriquecer: [],
    appCrear: [], appActualizar: [],
    enrCrear: [], enrExiste: [],
  };
  const alertas = { nivel2: [], nivel3: [], edadDistinta: [], fechaIncoherente: [], correoNoCoincide: [] };

  for (const p of gente) {
    const { candidato, nivel, evidencia } = resolverIdentidad(p, indice);
    p._match = candidato;
    p._nivel = nivel;

    if (nivel === 2) alertas.nivel2.push({ p, evidencia });
    if (nivel === 3) alertas.nivel3.push({ p, evidencia });
    if (p.edadDeclarada && p.edad && Math.abs(p.edadDeclarada - p.edad) > 1)
      alertas.fechaIncoherente.push(p);
    if (p.emailConfirma && p.email !== p.emailConfirma) alertas.correoNoCoincide.push(p);

    if (!candidato) {
      plan.candCrear.push(p);
    } else {
      const parche = parcheCandidato(candidato, p);
      if (Object.keys(parche).length) plan.candEnriquecer.push({ p, candidato, parche });
      else plan.candSinCambio.push(p);
      if (candidato.age && p.edad && Math.abs(candidato.age - p.edad) > 1)
        alertas.edadDistinta.push({ p, base: candidato.age, calculada: p.edad });
      // Si la postulación ya existe se refresca su caracterización, para que una
      // corrección del formulario o del mapeo se pueda reaplicar corriendo el ETL.
      if (appPorCand.has(candidato.id)) plan.appActualizar.push({ p, appId: appPorCand.get(candidato.id) });
      else plan.appCrear.push(p);
      if (enrPorCand.has(candidato.id)) plan.enrExiste.push(p); else plan.enrCrear.push(p);
    }
  }
  // Los nuevos siempre necesitan postulación y matrícula.
  plan.appCrear.push(...plan.candCrear);
  plan.enrCrear.push(...plan.candCrear);

  // socio_demographic_data de los ya existentes
  const idsExistentes = gente.filter((p) => p._match).map((p) => p._match.id);
  const socios = idsExistentes.length
    ? await traerTodo('socio_demographic_data',
        'id, candidate_id, gender_identity, sexual_orientation, ethnicity, marital_status, vulnerability_status')
    : [];
  const socioPorCand = new Map(socios.map((s) => [s.candidate_id, s]));
  for (const p of gente) {
    if (!p._match) { plan.socioCrear.push(p); continue; }
    const existente = socioPorCand.get(p._match.id);
    if (!existente) { plan.socioCrear.push(p); continue; }
    const parche = parcheSocio(existente, p);
    if (Object.keys(parche).length) plan.socioEnriquecer.push({ p, existente, parche });
  }

  // ── Reporte ───────────────────────────────────────────────────────────────
  linea('RESOLUCIÓN DE IDENTIDAD');
  const porNivel = [1, 2, 3, 4].map((n) => gente.filter((p) => p._nivel === n).length);
  console.log(`  Nivel 1 · documento exacto ............ ${porNivel[0]}`);
  console.log(`  Nivel 2 · correo exacto ............... ${porNivel[1]}   (documento mal digitado en el Excel)`);
  console.log(`  Nivel 3 · teléfono + nombre ........... ${porNivel[2]}   (documento Y correo distintos)`);
  console.log(`  Nivel 4 · alta nueva .................. ${porNivel[3]}`);

  linea('PLAN DE ESCRITURA');
  console.log(`  candidates            crear ${String(plan.candCrear.length).padStart(4)} · enriquecer ${String(plan.candEnriquecer.length).padStart(4)} · sin cambio ${plan.candSinCambio.length}`);
  console.log(`  socio_demographic     crear ${String(plan.socioCrear.length).padStart(4)} · enriquecer ${String(plan.socioEnriquecer.length).padStart(4)}`);
  console.log(`  project_applications  crear ${String(plan.appCrear.length).padStart(4)} · refrescar caracterización ${plan.appActualizar.length}`);
  console.log(`  program_enrollments   crear ${String(plan.enrCrear.length).padStart(4)} · ya existen ${plan.enrExiste.length}`);

  if (duplicados.length) {
    linea(`DUPLICADOS EN EL EXCEL (${duplicados.length}) — se conserva la inscripción más reciente`);
    duplicados.forEach((d) => console.log(`  doc ${d.doc}: se usa la fila ${d.conservada}, se descarta la ${d.descartada}`));
  }

  if (alertas.nivel2.length) {
    linea(`⚠ DOCUMENTO DISCREPANTE — match por correo (${alertas.nivel2.length})`);
    console.log('  El documento de la base NO se toca. Revisa cuál es el correcto:');
    alertas.nivel2.forEach(({ p, evidencia }) => console.log(`  fila ${p.fila} · ${p.nombreCompleto}\n     ${evidencia}`));
  }

  if (alertas.nivel3.length) {
    linea(`⚠ DOCUMENTO Y CORREO DISCREPANTES — match por teléfono + nombre (${alertas.nivel3.length})`);
    console.log('  Sin este nivel se habrían duplicado estas personas:');
    alertas.nivel3.forEach(({ p, evidencia }) => console.log(`  fila ${p.fila} · ${p.nombreCompleto}\n     ${evidencia}`));
  }

  if (alertas.fechaIncoherente.length) {
    linea(`⚠ EDAD DECLARADA ≠ FECHA DE NACIMIENTO (${alertas.fechaIncoherente.length}) — manda la fecha`);
    alertas.fechaIncoherente.forEach((p) =>
      console.log(`  fila ${p.fila} · ${p.nombreCompleto}: nac ${p.birthDate} → ${p.edad} años (el formulario decía ${p.edadDeclarada})`));
  }

  if (alertas.edadDistinta.length) {
    linea(`ℹ EDAD EN LA BASE ≠ CALCULADA (${alertas.edadDistinta.length}) — no se toca (solo se enriquece lo vacío)`);
    alertas.edadDistinta.forEach(({ p, base, calculada }) =>
      console.log(`  fila ${p.fila} · ${p.nombreCompleto}: base ${base} vs calculada ${calculada}`));
  }

  if (alertas.correoNoCoincide.length) {
    linea(`ℹ CORREO ≠ CONFIRMACIÓN (${alertas.correoNoCoincide.length}) — se usa el campo "Correo"`);
    alertas.correoNoCoincide.forEach((p) => console.log(`  fila ${p.fila} · ${p.email}  ≠  ${p.emailConfirma}`));
  }

  if (plan.candCrear.length) {
    linea(`ALTAS NUEVAS (${plan.candCrear.length})`);
    plan.candCrear.forEach((p) => console.log(`  fila ${String(p.fila).padStart(4)} · ${p.doc.padEnd(12)} ${p.nombreCompleto} — ${p.email}`));
  }

  if (plan.candEnriquecer.length) {
    linea(`CAMPOS A ENRIQUECER (${plan.candEnriquecer.length} personas)`);
    const conteo = {};
    plan.candEnriquecer.forEach(({ parche }) => Object.keys(parche).forEach((k) => (conteo[k] = (conteo[k] || 0) + 1)));
    Object.entries(conteo).sort((a, b) => b[1] - a[1]).forEach(([col, n]) => console.log(`  ${String(n).padStart(4)}  ${col}`));
    console.log('\n  Ejemplos:');
    plan.candEnriquecer.slice(0, 5).forEach(({ p, parche }) =>
      console.log(`    ${p.nombreCompleto}: ${JSON.stringify(parche)}`));
  }

  // Municipios que no existen tal cual en la base (posibles variantes ortográficas)
  const ciudadesBase = new Set(candidatos.map((c) => clean(c.city)).filter(Boolean));
  const municipiosNuevos = [...new Set(gente.map((p) => ciudadParaCandidates(p.municipio)))]
    .filter((m) => m && !ciudadesBase.has(m));
  if (municipiosNuevos.length) {
    linea('ℹ MUNICIPIOS QUE NO COINCIDEN CON NINGUNO EXISTENTE');
    console.log('  (revisa si son variantes ortográficas de uno que ya está)');
    municipiosNuevos.forEach((m) => console.log(`  · ${m}`));
  }

  if (!COMMIT) {
    console.log('\n🟢 DRY RUN completado. Nada se escribió. Ejecuta con --commit para aplicar.\n');
    return;
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  linea('ESCRIBIENDO EN SUPABASE');

  // 1) Altas de candidates
  for (const p of plan.candCrear) {
    const { data, error } = await supabase.from('candidates').insert(candidatoNuevo(p)).select('id').single();
    if (error) throw new Error(`alta candidate ${p.nombreCompleto}: ${error.message}`);
    p._match = { id: data.id };
    console.log(`  + candidate ${p.nombreCompleto} (${data.id})`);
  }

  // 2) Enriquecimiento de candidates
  for (const { p, candidato, parche } of plan.candEnriquecer) {
    const { error } = await supabase.from('candidates').update(parche).eq('id', candidato.id);
    if (error) throw new Error(`enriquecer ${p.nombreCompleto}: ${error.message}`);
  }
  console.log(`  ~ ${plan.candEnriquecer.length} candidates enriquecidos`);

  // 3) socio_demographic_data (id lo genera la base)
  const socioInserts = plan.socioCrear.map((p) => ({ candidate_id: p._match.id, ...socioNuevo(p) }));
  for (let i = 0; i < socioInserts.length; i += 200) {
    const { error } = await supabase.from('socio_demographic_data').insert(socioInserts.slice(i, i + 200));
    if (error) throw new Error(`socio insert: ${error.message}`);
  }
  for (const { existente, parche } of plan.socioEnriquecer) {
    const { error } = await supabase.from('socio_demographic_data').update(parche).eq('id', existente.id);
    if (error) throw new Error(`socio update: ${error.message}`);
  }
  console.log(`  + ${socioInserts.length} socio creados · ~ ${plan.socioEnriquecer.length} enriquecidos`);

  // 4) project_applications (id uuid con default → se omite)
  const appInserts = plan.appCrear.map((p) => ({
    cohort_id: COHORT_ID,
    candidate_id: p._match.id,
    status: 'accepted',
    current_step: 'postulacion',
    custom_answers: customAnswers(p),
  }));
  const appIdPorCand = new Map();
  for (let i = 0; i < appInserts.length; i += 200) {
    const { data, error } = await supabase.from('project_applications').insert(appInserts.slice(i, i + 200)).select('id, candidate_id');
    if (error) throw new Error(`application insert: ${error.message}`);
    data.forEach((a) => appIdPorCand.set(a.candidate_id, a.id));
  }
  console.log(`  + ${appInserts.length} postulaciones`);

  // 4b) Refresco de la caracterización de las postulaciones que ya existían.
  for (const { p, appId } of plan.appActualizar) {
    const { error } = await supabase
      .from('project_applications')
      .update({ custom_answers: customAnswers(p) })
      .eq('id', appId);
    if (error) throw new Error(`refrescar caracterización ${p.nombreCompleto}: ${error.message}`);
  }
  console.log(`  ~ ${plan.appActualizar.length} caracterizaciones refrescadas`);

  // 5) program_enrollments (id lo genera la base)
  const enrInserts = plan.enrCrear.map((p) => ({
    cohort_id: COHORT_ID,
    candidate_id: p._match.id,
    application_id: appIdPorCand.get(p._match.id) ?? null,
    status: 'active',
    custom_form_data: customFormData(p),
    enrolled_at: new Date().toISOString(),
  }));
  for (let i = 0; i < enrInserts.length; i += 200) {
    const { error } = await supabase.from('program_enrollments').insert(enrInserts.slice(i, i + 200));
    if (error) throw new Error(`enrollment insert: ${error.message}`);
  }
  console.log(`  + ${enrInserts.length} matrículas`);

  console.log('\n🔴 COMMIT completado.\n');
}

main().catch((e) => { console.error('\n❌ ', e.message); process.exit(1); });
