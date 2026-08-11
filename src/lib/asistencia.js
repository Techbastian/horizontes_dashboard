// Cálculo de asistencia. Lo usan los dos programas: Horizontes Senior
// (useApplicationsData) y Círculos de Conocimiento (useCirculosData).
//
// QUÉ ACTIVIDADES EXISTEN lo define el CALENDARIO, no la tabla de asistencia:
// un evento marcado como sesión/nivelación/café ya cuenta como actividad
// esperada aunque nadie le haya tomado asistencia todavía. Antes dependía de
// que un ETL pre-creara las filas, y una sesión sin filas era invisible
// ("1 de 1 realizadas" en vez de "1 de 5").
//
// Pero el calendario NO es la única fuente: se hace la UNIÓN con lo que ya
// existe en session_attendance. Los entregables, por ejemplo, no son eventos
// de calendario (no tienen fecha) y se perderían si se reemplazara en vez de unir.

// Con extensión .js a propósito: así este módulo también se puede cargar desde
// node (scripts de verificación contra datos reales), no solo desde Vite.
import { attendanceTipo, gruposDeAsistencia, pesosDeAsistencia } from './eventos.js';

// Los pesos del total ponderado los declara cada tipo de evento (tabla
// `tipos_evento`; ver `pesosDeAsistencia`). Hoy: sesiones 35%, cafés 40%,
// entregables 25%. Se renormalizan sobre los componentes que ya tienen
// actividades ocurridas, así que en Círculos —que solo tiene sesiones— el total
// termina siendo exactamente el % de sesiones, y no hace falta que sumen 1.
//
// Las MENTORÍAS no declaran peso a propósito: se les registra asistencia como a
// una sesión, pero son acompañamiento y no formación, así que no pesan en el
// porcentaje del programa (decisión del usuario, 2026-08-04). Un bucket sin peso
// nunca entra en `parts`, y por eso un tipo nuevo tampoco se cuela en un
// porcentaje mientras nadie le ponga uno.

// La fecha es lo que hace que el Excel y el calendario hablen de la MISMA
// actividad: la app guarda "V-S08" y la matriz "Sesion 06/08", y ambas caen en
// Senior|sesion|2026-08-06. Pero las actividades SIN fecha —los entregables— no
// tienen nada que las separe entre sí: con `sin-fecha` fija, los 6 entregables
// de Senior colapsaban en uno solo (el último leído) y por persona se pisaban
// unos a otros. Sin fecha, la que distingue es la actividad.
const clave = (grupo, tipo, fecha, actividad) =>
  fecha ? `${grupo}|${tipo}|${fecha}` : `${grupo}|${tipo}|${actividad ?? 'sin-actividad'}`;
const claveDeFila = (r) => clave(r.grupo, r.tipo, r.fecha, r.actividad);

// Bogotá es UTC-5 fijo: la fecha local del evento es la que guarda session_attendance.
const fechaBogota = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
};

// Hoy en Bogotá, como 'YYYY-MM-DD'.
const hoyEnBogota = () => fechaBogota(new Date().toISOString());

// ¿La fecha de una actividad ya pasó (o es hoy)?
// Se comparan CADENAS 'YYYY-MM-DD', no objetos Date: `new Date('2026-07-23')` es
// medianoche UTC, que en Colombia (UTC-5) cae antes del fin del día 22 — comparar
// como fechas daba por ocurrida una actividad un día antes de que ocurriera.
export function yaPaso(fecha) {
  if (!fecha) return false;
  return String(fecha).slice(0, 10) <= hoyEnBogota();
}

// Orden cronológico. Con fecha manda la FECHA: es la cronología real y la tienen
// todas las actividades salvo los entregables. `orden` solo lo escribe el ETL de
// HS, así que una actividad que aún no tiene asistencia —viene solo del
// calendario— lo trae en null; ordenando por `orden` primero, ese null contaba
// como 0 y las sesiones futuras se colaban ANTES que las de mayo.
// Las que no tienen fecha (los entregables) van al final, entre ellas por `orden`.
const porOrden = (a, b) => {
  if (a.fecha && b.fecha) {
    return String(a.fecha).localeCompare(String(b.fecha)) || (a.orden ?? 0) - (b.orden ?? 0);
  }
  if (a.fecha) return -1;
  if (b.fecha) return 1;
  return (a.orden ?? 0) - (b.orden ?? 0);
};

// Actividades que el calendario espera: un evento por cada grupo al que aplica.
// Los "Compartido" (cafés de HS) se desdoblan en los tres grupos.
export function actividadesDelCalendario(eventos = [], programa) {
  const mapa = new Map();
  for (const e of eventos) {
    const tipo = attendanceTipo(e);
    if (!tipo) continue; // evaluaciones, proyectos… no llevan asistencia
    const fecha = fechaBogota(e.fecha_hora_inicio);
    for (const grupo of gruposDeAsistencia(e, programa)) {
      const k = clave(grupo, tipo, fecha, e.codigo || e.nombre);
      // Si dos eventos cayeran en la misma clave, manda el primero: la asistencia
      // se enlaza por (grupo, tipo, fecha) y no podría distinguirlos.
      if (!mapa.has(k)) {
        mapa.set(k, {
          grupo, tipo, fecha,
          codigo: e.codigo || null,
          nombre: e.nombre || null,
          eventoId: e.id,
        });
      }
    }
  }
  return mapa;
}

// El nombre del evento sin el prefijo del programa: "Círculos — Sesión 1" → "Sesión 1".
// Solo se corta con raya o guion largo, que es como se separa el prefijo; un guion
// normal puede ser parte del nombre ("Sesión 7 - Analítica").
//
// El prefijo son una o dos palabras: el programa ("Círculos — Sesión 1") o el
// módulo ("M4 — Conectar para Visualizar"). Ese límite es lo que salva a los
// nombres donde la raya separa el sufijo y no el prefijo: "Mentoría de
// seguimiento 1 — Junior" se quedaba en "Junior".
const sinPrefijo = (nombre) =>
  String(nombre).replace(/^(?:\S+\s+)?\S+\s*[—–]\s*/, '').trim() || String(nombre);

// Fecha en día/mes, que es como se habla de las sesiones ("la del 10/08").
export const ddmm = (fecha) =>
  fecha ? `${String(fecha).slice(8, 10)}/${String(fecha).slice(5, 7)}` : null;

// Cómo se llama la actividad EN PANTALLA: el nombre del evento del calendario
// más su fecha en día/mes. La clave contra la base sigue siendo `actividad`;
// esto es solo presentación.
//
// El nombre guardado en `actividad` no sirve para mostrar: según por dónde haya
// entrado el dato es un código de evento ("V-S08"), un nombre con fecha del
// Excel ("Sesion 25/05") o un identificador autogenerado cuando el evento no
// tenía código ("EVT-2b14c486"). El calendario sí tiene un nombre legible para
// todas, así que manda él y solo se cae a `actividad` cuando no hay evento
// detrás — los entregables, que no son eventos.
//
// La fecha se añade siempre que exista y no esté ya en el nombre: sin ella, dos
// sesiones del mismo módulo ("… Parte 1" / "… Parte 2") se distinguen mal, y era
// justo lo que se perdía al pasar del nombre del Excel al del calendario.
const etiquetaDe = (v) => {
  const base = v.nombre ? sinPrefijo(v.nombre) : v.actividad;
  const f = ddmm(v.fecha);
  return f && !String(base).includes(f) ? `${base} · ${f}` : base;
};

// Fallback único para la UI y los exportes, para no repetir el `||` en cada vista.
export const nombreActividad = (item) => (item && (item.etiqueta || item.actividad)) || '';

const abreviar = (t) => String(t)
  .replace(/Sesi[oó]n\s*/i, 'S')
  .replace(/Caf[eé]\s*/i, 'C')
  .replace(/Mentor[ií]a\s*/i, 'M')
  .replace(/Entregable\s*/i, 'E')
  .replace(/\s+/g, ' ')
  .trim();

const LETRA_TIPO = { sesion: 'S', cafe: 'C', mentoria: 'M', entregable: 'E' };

// Token de dos o tres caracteres: "S8", "C3", "M2".
//
// El número sale del nombre cuando el nombre lo dice ("Café de Conocimiento
// No. 3" → C3), y si no, de la POSICIÓN de la actividad dentro de su tipo y su
// grupo (`indice`, asignado en `calcularAsistencia`).
//
// Hacen falta las dos vías. Muchos nombres del calendario no traen número
// ("Storytelling con datos", "Visualización con Matplotlib") y el código tampoco
// sirve —puede ser "V-S08", "MJ-02" o no existir—, así que ahí manda la posición,
// que además es como el usuario cuenta las sesiones. Pero la posición sola se
// equivoca con los cafés: son los mismos para todos los grupos y Activación
// empieza en el Café 3, que por posición se llamaría "C1".
const RE_NUMERO = /(?:sesi[oó]n|caf[eé]|mentor[ií]a|entregable)\D{0,25}?(\d+)/i;
export function tokenCorto(item) {
  if (!item) return '';
  const letra = LETRA_TIPO[item.tipo];
  if (!letra) return abreviar(nombreActividad(item));
  const delNombre = nombreActividad(item).match(RE_NUMERO)?.[1];
  const n = delNombre || item.indice;
  return n ? `${letra}${n}` : abreviar(nombreActividad(item));
}

// Etiqueta para los sitios donde solo caben unos pocos caracteres: los cuadritos
// del perfil y el eje del gráfico por actividad. Lleva la fecha en día/mes
// porque es como se identifica una sesión al hablar de ella ("la del 10/08").
export function etiquetaCorta(item) {
  const t = tokenCorto(item);
  const f = ddmm(item?.fecha);
  return f ? `${t} · ${f}` : t;
}

// Primera fecha con registro de cada grupo. Sirve de corte: el calendario no debe
// inventar actividades de un grupo ANTERIORES a que el grupo existiera.
// Caso real: los cafés son eventos "Compartido" y se desdoblan en los tres grupos
// de HS, pero Activación arrancó el 08/07 — sin este corte aparecería como que
// faltó a los cafés 1 (21/05) y 2 (23/06), que ocurrieron antes de que el grupo
// existiera. Igual con las nivelaciones de abril, medidas por otra vía
// (`completitud_nivelacion`) y nunca registradas sesión a sesión.
function inicioPorGrupo(filas) {
  const min = new Map();
  for (const r of filas) {
    if (!r.fecha) continue;
    const actual = min.get(r.grupo);
    if (!actual || r.fecha < actual) min.set(r.grupo, r.fecha);
  }
  return min;
}

// Une lo que el calendario espera con lo que ya está registrado.
function inventarioActividades(filas, esperadas) {
  const inv = new Map();
  const inicio = inicioPorGrupo(filas);

  for (const [k, a] of esperadas) {
    // Un grupo sin ningún registro (programa nuevo) no tiene corte: se espera todo.
    const desde = inicio.get(a.grupo);
    if (desde && a.fecha && a.fecha < desde) continue;
    inv.set(k, { ...a, actividad: a.codigo || a.nombre, anyAttended: false, anyRegistrado: false, orden: null });
  }

  for (const r of filas) {
    const k = claveDeFila(r);
    if (!inv.has(k)) {
      // Sin evento en el calendario (p. ej. los entregables): la fila manda.
      inv.set(k, {
        grupo: r.grupo, tipo: r.tipo, fecha: r.fecha, actividad: r.actividad,
        codigo: null, nombre: null, eventoId: null,
        anyAttended: false, anyRegistrado: false, orden: r.orden ?? null,
      });
    }
    const v = inv.get(k);
    // El nombre real de la actividad manda sobre el código del evento.
    v.actividad = r.actividad;
    if (v.orden == null) v.orden = r.orden ?? null;
    if (r.asistio === true) v.anyAttended = true;
    if (r.asistio !== null) v.anyRegistrado = true;
  }
  // Se calcula al final, cuando `actividad` ya quedó fijada por las filas.
  for (const v of inv.values()) v.etiqueta = etiquetaDe(v);
  return inv;
}

// Actividades que YA ocurrieron: son las únicas que cuentan en el %.
//   • sesiones y cafés → su fecha ya pasó **y además hay asistencia registrada**.
//     Las futuras van en gris; y una que ya pasó pero cuyo formulario aún no se
//     carga TAMBIÉN sigue en gris, en vez de entrar al denominador con todo el
//     mundo en null y desplomar los porcentajes de un día para otro.
//   • entregables → cuentan una vez que alguien del grupo ya entregó: entregado
//     = 100%, pendiente = 0%. Se auto-activan con la primera entrega.
function calcularOcurridas(inv) {
  const set = new Set();
  for (const [k, v] of inv) {
    const ocurrio =
      v.tipo === 'entregable'
        ? v.anyAttended
        : v.fecha
          ? yaPaso(v.fecha) && v.anyRegistrado
          : v.anyAttended;
    if (ocurrio) set.add(k);
  }
  return set;
}

// % sobre las actividades que ya ocurrieron Y en las que esta persona tiene
// registro. `asistio === null` (o sin fila) significa "no se le midió", no
// "faltó": los 12 retirados de HS que nunca tuvieron seguimiento deben seguir
// mostrando "—" y no un 0% que se leería como que no fueron a nada.
// null = no hay ninguna actividad medible todavía → la UI muestra "—".
export function pctOcurridas(items) {
  const occ = items.filter((i) => i.occurred && i.asistio !== null);
  if (!occ.length) return null;
  return Math.round((occ.filter((i) => i.asistio === true).length / occ.length) * 100);
}

// A qué lista va cada actividad. Explícito por tipo: cuando el default se
// tragaba todo lo desconocido, un tipo nuevo caía en `entregables` y se colaba
// en el 25% sin que nadie lo notara.
const BUCKETS = { sesion: 'sesiones', cafe: 'cafes', mentoria: 'mentorias', entregable: 'entregables' };
// Un tipo nuevo estrena su propio bucket, con el nombre de su clave. Antes el
// default era 'entregables' y cualquier tipo desconocido se colaba en el 25%;
// ahora entra en un bucket propio, que solo pesa si su tipo declara un peso.
const bucketDe = (tipo) => BUCKETS[tipo] || tipo;

// FASES: los grupos por los que ha pasado una persona, en orden cronológico.
// Las filas de session_attendance son inmutables y conservan el grupo donde
// ocurrió la actividad, así que mover a alguien de grupo NO puede borrar su
// historia: se recorre cada fase contra las actividades de SU grupo.
// Quien nunca cambió de grupo tiene una sola fase abierta = comportamiento
// idéntico al de antes de que existieran las fases.
function normalizarFases(c) {
  const fases = (Array.isArray(c.fases) ? c.fases : []).filter((f) => f && f.ruta);
  if (!fases.length) return c.grupo ? [{ ruta: c.grupo, desde: null, hasta: null }] : [];
  return fases
    .map((f) => ({ ruta: f.ruta, desde: f.desde || null, hasta: f.hasta || null }))
    .sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));
}

// ¿Esta actividad del grupo de la fase le corresponde a la persona en esa fase?
// El corte por `desde` es lo que evita que a quien entró a Junior el 23/07 le
// aparezcan como huecos las sesiones Junior de mayo y junio.
function perteneceAFase(a, f, fila) {
  // Un registro real manda sobre la ventana: si a la persona se le midió esa
  // actividad, cuenta aunque las fechas de la fase digan otra cosa. Así una
  // fecha de corte mal puesta nunca puede esconder datos reales.
  if (fila && fila.asistio !== null) return true;
  // Los entregables no tienen fecha: solo se le esperan en su fase actual.
  if (!a.fecha) return f.hasta == null;
  if (f.desde && a.fecha < f.desde) return false;
  if (f.hasta && a.fecha > f.hasta) return false;
  return true;
}

/**
 * Punto de entrada único.
 * @param filas      filas de session_attendance de la cohorte
 * @param eventos    eventos del calendario de la cohorte
 * @param programa   slug del programa (define los grupos)
 * @param candidatos [{ candidate_id, grupo }] o [{ candidate_id, fases: [{ruta, desde, hasta}] }]
 *                   — de las matrículas; necesarios para que una actividad sin filas
 *                   aparezca igual en la fila de cada persona. `fases` manda sobre `grupo`.
 */
export function calcularAsistencia({ filas = [], eventos = [], programa, candidatos = [] }) {
  // Se leen en cada llamada, no una vez al importar: el vocabulario de tipos se
  // carga de la base al arrancar y una constante de módulo se quedaría con los
  // pesos por defecto.
  const PESOS = pesosDeAsistencia();
  const esperadas = actividadesDelCalendario(eventos, programa);
  const inv = inventarioActividades(filas, esperadas);
  const ocurridas = calcularOcurridas(inv);

  // Índice de lo registrado: clave de actividad + persona → fila.
  const registro = new Map();
  for (const r of filas) registro.set(`${claveDeFila(r)}|${r.candidate_id}`, r);

  // Actividades por grupo, ordenadas.
  const porGrupoActividades = new Map();
  for (const [k, v] of inv) {
    if (!porGrupoActividades.has(v.grupo)) porGrupoActividades.set(v.grupo, []);
    porGrupoActividades.get(v.grupo).push({ k, ...v });
  }
  // Posición dentro del tipo, ya en orden cronológico: la "Sesión 8" de Senior es
  // la octava del grupo. De aquí sale el token corto (S8/C3/M2) del perfil y del
  // eje de los gráficos.
  for (const lista of porGrupoActividades.values()) {
    lista.sort(porOrden);
    const cuenta = {};
    for (const a of lista) a.indice = cuenta[a.tipo] = (cuenta[a.tipo] || 0) + 1;
  }

  // ── Por candidato ─────────────────────────────────────────────────────────
  const porCandidato = {};
  const fasesDe = new Map(candidatos.map((c) => [c.candidate_id, normalizarFases(c)]));
  // Quien tenga filas pero no esté en la lista de matrículas igual se incluye.
  for (const r of filas) {
    if (!fasesDe.has(r.candidate_id)) fasesDe.set(r.candidate_id, [{ ruta: r.grupo, desde: null, hasta: null }]);
  }

  for (const [candidateId, fases] of fasesDe) {
    // El grupo "actual" es la última fase; con una sola fase es el de siempre.
    const g = {
      grupo: fases.length ? fases[fases.length - 1].ruta : null,
      fases: [],
      sesiones: [], cafes: [], mentorias: [], entregables: [],
    };
    // 1) Qué actividades reclama cada fase. Dos fases pueden compartir ruta (ida
    //    y vuelta Junior→Senior→Junior): cada actividad se cuenta una sola vez,
    //    en la primera fase que la reclama.
    const vistas = new Set();
    const candidatas = fases.map((f) => {
      const lista = [];
      for (const a of porGrupoActividades.get(f.ruta) || []) {
        if (vistas.has(a.k)) continue;
        const fila = registro.get(`${a.k}|${candidateId}`);
        if (!perteneceAFase(a, f, fila)) continue;
        vistas.add(a.k);
        lista.push({ a, fila });
      }
      return lista;
    });

    // 2) Las actividades sin fecha (los entregables) son de la COHORTE, no del
    //    grupo: "Entregable 1" está replicado en Junior, Senior y Activación.
    //    Quien pasó por dos grupos lo vería dos veces —"no entregó" en la fase
    //    vieja y "pendiente" en la nueva—, así que se deja uno solo: el de la
    //    última fase donde se le midió, o el de su fase actual si nunca se midió.
    //    Las actividades con fecha no se deduplican: dos grupos pueden tener
    //    sesiones distintas el mismo día y son actividades diferentes.
    const unico = new Map();
    for (const lista of candidatas) {
      for (const { a, fila } of lista) {
        if (a.fecha) continue;
        const nombre = `${a.tipo}|${a.actividad}`;
        const medida = !!fila && fila.asistio !== null;
        const previa = unico.get(nombre);
        if (!previa || medida || !previa.medida) unico.set(nombre, { clave: a.k, medida });
      }
    }

    candidatas.forEach((lista, i) => {
      const f = fases[i];
      const items = [];
      for (const { a, fila } of lista) {
        if (!a.fecha && unico.get(`${a.tipo}|${a.actividad}`)?.clave !== a.k) continue;
        const item = {
          candidate_id: candidateId,
          grupo: a.grupo,
          tipo: a.tipo,
          actividad: a.actividad,
          // Cómo mostrarla; `actividad` sigue siendo la clave contra la base.
          etiqueta: a.etiqueta,
          indice: a.indice,
          fecha: a.fecha,
          orden: a.orden,
          // Sin fila = nunca se le registró nada a esta persona en esa actividad.
          asistio: fila ? fila.asistio : null,
          observacion: fila ? fila.observacion : null,
          occurred: ocurridas.has(a.k),
        };
        items.push(item);
        // Las listas planas son la UNIÓN de las fases. No se reordenan: cada
        // fase ya viene ordenada y las fases van en orden cronológico, así que
        // concatenar da el orden correcto. Reordenar por fecha movería los
        // entregables (sin fecha) al principio.
        const bucket = bucketDe(a.tipo);
        (g[bucket] ||= []).push(item);
      }
      g.fases.push({ ...f, items });
    });

    // Un porcentaje por bucket, incluidos los de tipos que se hayan creado
    // después. Los cuatro de siempre se exponen además con nombre propio porque
    // la UI los pinta por separado.
    const pct = {};
    for (const [bucket, items] of Object.entries(g)) {
      if (bucket === 'fases' || !Array.isArray(items)) continue;
      pct[bucket] = pctOcurridas(items);
    }
    g.pctSesiones = pct.sesiones ?? null;
    g.pctCafes = pct.cafes ?? null;
    g.pctEntregables = pct.entregables ?? null;
    // Informativo: se muestra en el perfil, pero no pesa mientras el tipo
    // 'mentoria' no declare un peso (ver PESOS).
    g.pctMentorias = pct.mentorias ?? null;

    // Solo entran los buckets cuyo tipo declara un peso: uno nuevo se registra y
    // se muestra, pero no toca los porcentajes hasta que alguien se lo asigne.
    const parts = [];
    for (const [bucket, valor] of Object.entries(pct)) {
      if (valor != null && PESOS[bucket] != null) parts.push([PESOS[bucket], valor]);
    }
    const wsum = parts.reduce((s, [w]) => s + w, 0);
    g.totalPonderado = wsum
      ? Math.round(parts.reduce((s, [w, v]) => s + w * v, 0) / wsum)
      : null;

    porCandidato[candidateId] = g;
  }

  // ── Agregado por grupo, para los gráficos de barras ───────────────────────
  // Cada barra cuenta lo ocurrido EN ese grupo: quien pasó por Activación sigue
  // pesando en las barras de Activación aunque hoy sea Junior. Sale gratis
  // porque solo se cuentan filas registradas, y cada fila lleva su grupo real.
  const rutasDe = new Map([...fasesDe].map(([id, fases]) => [id, new Set(fases.map((f) => f.ruta))]));
  const porGrupo = {};
  for (const [grupo, actividades] of porGrupoActividades) {
    const construir = (tipo) =>
      actividades
        .filter((a) => a.tipo === tipo)
        .map((a) => {
          let asistieron = 0;
          let total = 0;
          for (const candidateId of rutasDe.keys()) {
            if (!rutasDe.get(candidateId).has(grupo)) continue;
            const fila = registro.get(`${a.k}|${candidateId}`);
            // `asistio` null (o sin fila) = no registrado: no suma a ningún lado.
            if (fila && fila.asistio !== null) {
              total++;
              if (fila.asistio) asistieron++;
            }
          }
          return {
            actividad: a.actividad,
            etiqueta: a.etiqueta,
            tipo: a.tipo,
            indice: a.indice,
            fecha: a.fecha,
            orden: a.orden,
            asistieron,
            total,
            occurred: ocurridas.has(a.k),
            pct: total ? Math.round((asistieron / total) * 100) : 0,
          };
        });
    // Una lista por cada clave de asistencia presente en el grupo, para que un
    // tipo nuevo también tenga sus barras sin tocar este archivo.
    porGrupo[grupo] = {};
    for (const tipo of new Set(actividades.map((a) => a.tipo))) {
      porGrupo[grupo][bucketDe(tipo)] = construir(tipo);
    }
  }

  // ── Actividades ya ocurridas sin un solo registro ─────────────────────────
  const sinCargar = [...inv.values()]
    .filter((v) => v.tipo !== 'entregable' && yaPaso(v.fecha) && !v.anyRegistrado)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  return { ocurridas, porCandidato, porGrupo, sinCargar };
}
