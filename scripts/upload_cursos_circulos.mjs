// ============================================================================
// upload_cursos_circulos.mjs — Da de alta el catálogo de cursos de Círculos de
// Conocimiento en `education_library` y los vincula a la cohorte en
// `cohort_courses`.
//
//   node scripts/upload_cursos_circulos.mjs            → dry run (no escribe)
//   node scripts/upload_cursos_circulos.mjs --commit   → escribe
//
// La fuente es `bases_de_datos/Ruta Círculos de Conocimiento.pdf`, pero el
// catálogo va como CONSTANTE aquí adentro — igual que el calendario en
// upload_eventos_circulos.mjs. Un PDF con fuentes CID no es una fuente que un
// ETL pueda releer de forma confiable, y el catálogo cambia poco: si se agrega
// o cambia un curso, se edita CURSOS y se vuelve a correr. Al ser idempotente
// (busca por título, actualiza lo que difiere) no duplica nada.
//
// ⚠️ NO carga el % de avance: eso vive en `cohort_course_status` y necesita el
// reporte de la plataforma (Learning to Earning), que a la fecha no existe para
// Círculos. `upload_formacion.mjs` es la implementación de referencia de esa
// segunda parte.
//
// Nota sobre el orden: el frontend ordena los cursos por título
// (`name.localeCompare`), así que el prefijo numérico va con dos dígitos —
// "10." tiene que quedar después de "09.", no antes de "2.".
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { credencialesServicio } from './_env.mjs';

const COHORT_SLUG = 'circulos-de-conocimiento-i-2026'; // contra cohorts.slug_application
// provider replica la convención de Horizontes Senior: el nombre del PROGRAMA,
// no el de la plataforma. Los cursos en sí son de Learning to Earning (Accenture).
const PROVIDER = 'Círculos de Conocimiento';

const COMMIT = process.argv.includes('--commit');

// ── Catálogo (Ruta de formación: Círculos de Conocimiento, 26.2h) ─────────────
// `modulo` no tiene columna en education_library; se conserva aquí porque es
// como está agrupada la ruta en el PDF y es lo que se reporta en el resumen.
const MODULOS = {
  1: '1. FUNDAMENTOS DE ANALÍTICA DE DATOS y ALFABETIZACIÓN DIGITAL',
  2: '2. ANÁLISIS Y VISUALIZACIÓN DE DATOS — SQL',
  3: '3. FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL, AUTOMATIZACIÓN BÁSICA, HERRAMIENTAS DE PRODUCTIVIDAD y HABILIDADES SOCIOEMOCIONALES',
};

const L2E = 'https://www.l2eportal.accenture.com/curso';
const PARAMS_DIGITALES = 'locale=es-ES&lang=es&type=digitales&p=12427&content-lang=es-CO';
const PARAMS_TECNICOS = 'locale=es-ES&lang=es&type=tecnicos&p=12427&content-lang=es-CO';
const PARAMS_COMPETENCIAS = 'locale=es-ES&lang=es&type=competencias&p=12427&content-lang=es-CO';

const CURSOS = [
  {
    modulo: 1, categoria: 'ALFABETIZACIÓN DIGITAL',
    titulo: 'Introducción al mundo digital', horas: 1.5,
    descripcion:
      '¿Qué es digital y qué es analógico?, ¿cómo surgió la tecnología digital y hacia dónde nos ' +
      'conduce?, ¿cuál ha sido el impacto que ha tenido en las personas, sociedad y empleo?',
    enlace: `${L2E}/mundo-digital?filters=introduccion-tecnologia-digital&idpos=158&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 1, categoria: 'FUNDAMENTOS DE ANALÍTICA DE DATOS',
    titulo: 'Fundamentos de data analytics', horas: 2.1,
    descripcion:
      'Descubre claves para comprender mejor cuál es la misión de data analytics, cómo se integra ' +
      'en el proceso completo del tratamiento y estudio de los datos, qué métodos emplea y muchos ' +
      'otros aspectos que te ayudarán a introducirte en este campo tan apasionante.',
    enlace: `${L2E}/fundamentos-dataanalytics?filters=data-analytics&idpos=393&${PARAMS_TECNICOS}`,
  },
  {
    modulo: 1, categoria: 'FUNDAMENTOS DE ANALÍTICA DE DATOS',
    titulo: 'Introducción a SQL', horas: 4.7,
    descripcion:
      'En esta lección te adentrarás en el mundo de las Bases de Datos, conocerás los tipos que ' +
      'existen y sus características. Aprenderás cómo se crean y se gestionan Bases de Datos ' +
      'Relacionales y a manejar comandos de SQL para ello.',
    enlace: `${L2E}/introduccion-sql?filters=data-analytics&idpos=393&${PARAMS_TECNICOS}`,
  },
  {
    modulo: 2, categoria: 'ANÁLISIS Y VISUALIZACIÓN DE DATOS',
    titulo: 'Consultas avanzadas con SQL', horas: 4.4,
    descripcion:
      'Adéntrate en el mundo SQL descubriendo sus operadores y cláusulas más avanzadas, con los ' +
      'que conseguirás realizar consultas más complejas, que te permitirán recopilar y almacenar ' +
      'datos para su posterior análisis.',
    enlace: `${L2E}/consultasql-dataanalytics?filters=data-analytics&idpos=393&${PARAMS_TECNICOS}`,
  },
  {
    modulo: 2, categoria: 'ANÁLISIS Y VISUALIZACIÓN DE DATOS',
    titulo: 'Métodos estadísticos en data analytics', horas: 4.6,
    descripcion: 'Conectar KPIs con decisiones de negocio, interpretar dashboards y comunicar hallazgos.',
    enlace: `${L2E}/metodosestadisticos-dataanalytics?filters=data-analytics&idpos=393&${PARAMS_TECNICOS}`,
  },
  {
    modulo: 3, categoria: 'ALFABETIZACIÓN DIGITAL',
    titulo: 'La nube', horas: 1.5,
    descripcion:
      '¿Utilizas los servicios de la nube sin saberlo?, ¿qué es la nube?, ¿para qué sirve?, ' +
      '¿qué me aporta?, ¿es segura?',
    enlace: `${L2E}/la-nube?filters=introduccion-tecnologia-digital&filters=colabora-en-red&idpos=160&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Introducción a la IA generativa', horas: 0.25,
    descripcion:
      'La inteligencia artificial generativa está transformando la forma en que creamos, ' +
      'interactuamos y resolvemos problemas en diversos campos, desde el arte y la escritura hasta ' +
      'la ciencia y la tecnología. En este curso, aprenderás qué es la IA generativa.',
    enlace: `${L2E}/introduction-gen-ai-es?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Dominando el prompting', horas: 0.3,
    descripcion:
      'Crear prompts precisos es la clave para aprovechar todo el potencial de las herramientas de ' +
      'IA generativa. Ya sea que estés generando contenido creativo, resolviendo problemas o ' +
      'desarrollando nuevas ideas.',
    enlace: `${L2E}/mastering-prompting-es?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Uso responsable de la IA generativa', horas: 0.25,
    descripcion:
      'La IA generativa ofrece oportunidades increíbles, pero un gran poder conlleva una gran ' +
      'responsabilidad. Comprender cómo utilizar esta tecnología de manera ética y reflexiva es ' +
      'fundamental para minimizar los riesgos y maximizar su impacto positivo en la sociedad.',
    enlace: `${L2E}/responsible-use-gen-ai-es?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Una visión de 360° de la IA generativa', horas: 0.35,
    descripcion:
      'Explora los orígenes de la IA generativa, las tecnologías que la han hecho posible y cómo ' +
      'los modelos Transformer la han revolucionado. Descubre su enorme potencial, sus limitaciones ' +
      'actuales y el papel vital que los seres humanos siguen desempeñando. Finalmente, aprende ' +
      'cuáles son las habilidades clave necesarias para aprovechar al máximo las herramientas de IA ' +
      'generativa.',
    enlace: `${L2E}/vision-generativa-ia?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Inteligencia artificial agéntica', horas: 0.35,
    descripcion:
      'Explora qué son los Agentes de IA, cómo funcionan y por qué están transformando la forma en ' +
      'que interactuamos con la tecnología. Descubre sus características clave, los componentes que ' +
      'los hacen posibles y aprende la diferencia entre Agentes de IA y Asistentes de IA. ' +
      'Finalmente, analiza las aplicaciones más comunes, así como las limitaciones de los Agentes ' +
      'de IA, conocimientos esenciales para ayudarte a utilizar esta tecnología de manera responsable.',
    enlace: `${L2E}/inteligencia-artificial-agencial?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Inteligencia artificial y machine learning', horas: 0.35,
    descripcion:
      'Explora qué es la inteligencia artificial y cómo funciona. Aprende sobre machine learning, ' +
      'un concepto del que quizá no hayas oído mucho, pero que es crucial para entender cómo un ' +
      'sistema de inteligencia artificial puede realmente "aprender". Por último, descubre que, ' +
      'aunque esta tecnología avanza rápidamente, no es infalible ya que la IA tiene sus límites e ' +
      'incluso puede cometer errores.',
    enlace: `${L2E}/inteligencia-artificial-aprendizaje-autom%C3%A1tico?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL',
    titulo: 'Aplicaciones de la IA en sectores clave', horas: 0.35,
    descripcion:
      'Explora cómo se está utilizando la inteligencia artificial en diversos sectores como la ' +
      'sanidad, las finanzas, el comercio minorista, los videojuegos y la robótica. Analiza casos ' +
      'prácticos reales. Descubre cómo la IA ya está transformando el mundo que nos rodea y cómo ' +
      'podemos aprender a utilizarla de la manera más eficaz y responsable.',
    enlace: `${L2E}/aplicaciones-ia-sectores-industriales-clave?filters=inteligencia-artificial&idpos=405&${PARAMS_DIGITALES}`,
  },
  {
    modulo: 3, categoria: 'AUTOMATIZACIÓN BÁSICA y HERRAMIENTAS DE PRODUCTIVIDAD',
    titulo: 'Introducción a la programación', horas: 1.2,
    descripcion:
      'En esta lección aprenderás los conceptos básicos de programación, los principios de ' +
      'desarrollo de un programa, sus fases y los diferentes lenguajes de programación. Explorarás ' +
      'el mundo de los algoritmos, sus características, estructura y formas de representación.',
    enlace: `${L2E}/introduccion-programacion?filters=programacion&idpos=275&${PARAMS_TECNICOS}`,
  },
  {
    modulo: 3, categoria: 'HABILIDADES SOCIOEMOCIONALES',
    titulo: 'Iniciativa y toma de decisiones', horas: 2,
    descripcion:
      'Ser consciente de los factores internos que influyen en la toma de decisiones y sus ' +
      'consecuencias, y lo que tienes que tener en cuenta para elegir la mejor opción. Ser ' +
      'consciente de las influencias externas y la importancia de un buen uso de la información ' +
      'para tomar una buena decisión. Seguir un proceso que te ayude en la toma de decisiones ante ' +
      'momentos de urgencia.',
    enlace: `${L2E}/iniciativa-y-toma-de-decisiones-II?filters=habilidades-basicas&filters=habilidades-para-crecer&filters=habilidades-para-destacar&filters=habilidades-para-el-empleo&idpos=193&${PARAMS_COMPETENCIAS}`,
  },
  {
    modulo: 3, categoria: 'HABILIDADES SOCIOEMOCIONALES',
    titulo: 'Creatividad e innovación - Avanzado', horas: 2,
    descripcion:
      'Ser una persona proactiva a la hora de proponer ideas en respuesta a las necesidades propias ' +
      'o del entorno. Utilizar técnicas diferentes para la generación de ideas, la mejora de las ' +
      'existentes y la innovación.',
    enlace: `${L2E}/creatividad-e-innovacion-III?filters=habilidades-basicas&filters=habilidades-para-crecer&filters=habilidades-para-destacar&filters=habilidades-para-el-empleo&idpos=192&${PARAMS_COMPETENCIAS}`,
  },
];

// El título en la base lleva el número de orden de la ruta, con dos dígitos.
const tituloEnBase = (curso, i) => `${String(i + 1).padStart(2, '0')}. ${curso.titulo}`;

// ── Supabase ─────────────────────────────────────────────────────────────────
const { url, key } = credencialesServicio();
const supabase = createClient(url, key);

async function cohorteCirculos() {
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('slug_application', COHORT_SLUG)
    .maybeSingle();
  if (error) throw new Error(`Error buscando la cohorte: ${error.message}`);
  if (!data) throw new Error(`No existe la cohorte "${COHORT_SLUG}".`);
  return data;
}

function camposDe(curso, i) {
  return {
    title: tituloEnBase(curso, i),
    description: curso.descripcion,
    duration_hours: String(curso.horas), // la columna es text, no numeric
    enrollment_link: curso.enlace,
    provider: PROVIDER,
  };
}

// Compara solo los campos que este script maneja: si alguien editó otra columna
// a mano en Supabase, no se pisa.
function diferencias(fila, campos) {
  return Object.entries(campos)
    .filter(([col, valor]) => (fila[col] ?? null) !== valor)
    .map(([col]) => col);
}

async function main() {
  console.log(COMMIT ? '🚀 MODO COMMIT — se va a escribir en Supabase\n' : '🔍 DRY RUN — no se escribe nada (usa --commit para aplicar)\n');

  const cohorte = await cohorteCirculos();
  console.log(`✅ Cohorte: ${cohorte.name} (${cohorte.id})\n`);

  const titulos = CURSOS.map((c, i) => tituloEnBase(c, i));
  const { data: existentes, error: errLib } = await supabase
    .from('education_library')
    .select('*')
    .in('title', titulos);
  if (errLib) throw new Error(`Error leyendo education_library: ${errLib.message}`);

  const porTitulo = new Map((existentes || []).map((f) => [f.title, f]));

  const altas = [];
  const cambios = [];
  const iguales = [];
  const idPorTitulo = new Map();

  for (const [i, curso] of CURSOS.entries()) {
    const campos = camposDe(curso, i);
    const fila = porTitulo.get(campos.title);
    if (!fila) {
      altas.push({ curso, campos });
    } else {
      idPorTitulo.set(campos.title, fila.id);
      const dif = diferencias(fila, campos);
      if (dif.length) cambios.push({ curso, campos, id: fila.id, dif });
      else iguales.push(campos.title);
    }
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('📚 Catálogo (Ruta de formación: Círculos de Conocimiento)');
  let moduloActual = null;
  for (const [i, curso] of CURSOS.entries()) {
    if (curso.modulo !== moduloActual) {
      moduloActual = curso.modulo;
      const horasModulo = CURSOS.filter((c) => c.modulo === moduloActual).reduce((s, c) => s + c.horas, 0);
      console.log(`\n  ${MODULOS[moduloActual]}  (${Math.round(horasModulo * 10) / 10}h)`);
    }
    const titulo = tituloEnBase(curso, i);
    const estado = porTitulo.has(titulo)
      ? (cambios.find((c) => c.campos.title === titulo) ? '✏️  actualizar' : '✓  sin cambios')
      : '✨ alta       ';
    console.log(`    ${estado}  ${titulo.padEnd(48)} ${String(curso.horas).padStart(5)}h  · ${curso.categoria}`);
  }
  const horasTotal = CURSOS.reduce((s, c) => s + c.horas, 0);
  console.log(`\n  TOTAL: ${CURSOS.length} cursos · ${Math.round(horasTotal * 10) / 10}h`);
  console.log(`\n  ${altas.length} altas · ${cambios.length} actualizaciones · ${iguales.length} sin cambios`);
  for (const c of cambios) console.log(`     ✏️  ${c.campos.title} → cambia: ${c.dif.join(', ')}`);

  if (!COMMIT) {
    console.log('\n🔍 DRY RUN: no se escribió nada. Repite con --commit para aplicar.');
    return;
  }

  // ── Escritura ──────────────────────────────────────────────────────────────
  if (altas.length) {
    const { data, error } = await supabase
      .from('education_library')
      .insert(altas.map((a) => a.campos))
      .select('id, title');
    if (error) throw new Error(`Error creando cursos: ${error.message}`);
    data.forEach((f) => idPorTitulo.set(f.title, f.id));
    console.log(`\n✨ ${data.length} cursos creados`);
  }

  for (const c of cambios) {
    const { error } = await supabase.from('education_library').update(c.campos).eq('id', c.id);
    if (error) throw new Error(`Error actualizando "${c.campos.title}": ${error.message}`);
  }
  if (cambios.length) console.log(`✏️  ${cambios.length} cursos actualizados`);

  // Vínculo curso ↔ cohorte, idempotente.
  const { data: yaVinculados, error: errCC } = await supabase
    .from('cohort_courses')
    .select('course_id')
    .eq('cohort_id', cohorte.id);
  if (errCC) throw new Error(`Error leyendo cohort_courses: ${errCC.message}`);

  const vinculados = new Set((yaVinculados || []).map((v) => v.course_id));
  const nuevos = [...idPorTitulo.values()]
    .filter((id) => !vinculados.has(id))
    .map((course_id) => ({ cohort_id: cohorte.id, course_id }));

  if (nuevos.length) {
    const { error } = await supabase.from('cohort_courses').insert(nuevos);
    if (error) throw new Error(`Error vinculando cursos a la cohorte: ${error.message}`);
  }
  console.log(`🔗 ${nuevos.length} vínculos nuevos en cohort_courses (${vinculados.size} ya existían)`);

  console.log('\n🎉 Catálogo cargado.');
  console.log('   Falta el % de avance por persona (cohort_course_status): necesita el reporte');
  console.log('   de la plataforma Learning to Earning, que aún no existe para Círculos.');
}

main().catch((err) => { console.error('\n❌ Error:', err.message); process.exit(1); });
