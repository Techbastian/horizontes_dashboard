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
import { attendanceTipo, gruposDeAsistencia } from './eventos.js';

// Pesos del total ponderado (Horizontes Senior). Se renormalizan sobre los
// componentes que ya tienen actividades ocurridas, así que en Círculos —que solo
// tiene sesiones— el total termina siendo exactamente el % de sesiones.
const PESOS = { sesiones: 0.35, cafes: 0.4, entregables: 0.25 };

const clave = (grupo, tipo, fecha) => `${grupo}|${tipo}|${fecha ?? 'sin-fecha'}`;
const claveDeFila = (r) => clave(r.grupo, r.tipo, r.fecha);

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

// Orden cronológico. En HS el ETL numera las actividades con `orden`; la captura
// desde la app lo deja en null, así que la fecha desempata.
const porOrden = (a, b) =>
  (a.orden ?? 0) - (b.orden ?? 0) ||
  String(a.fecha || '').localeCompare(String(b.fecha || ''));

// Actividades que el calendario espera: un evento por cada grupo al que aplica.
// Los "Compartido" (cafés de HS) se desdoblan en los tres grupos.
export function actividadesDelCalendario(eventos = [], programa) {
  const mapa = new Map();
  for (const e of eventos) {
    const tipo = attendanceTipo(e);
    if (!tipo) continue; // evaluaciones, proyectos… no llevan asistencia
    const fecha = fechaBogota(e.fecha_hora_inicio);
    for (const grupo of gruposDeAsistencia(e, programa)) {
      const k = clave(grupo, tipo, fecha);
      // Si dos eventos cayeran en la misma clave, manda el primero: la asistencia
      // se enlaza por (grupo, tipo, fecha) y no podría distinguirlos.
      if (!mapa.has(k)) {
        mapa.set(k, {
          grupo, tipo, fecha,
          etiqueta: e.codigo || e.nombre,
          eventoId: e.id,
        });
      }
    }
  }
  return mapa;
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
    inv.set(k, { ...a, actividad: a.etiqueta, anyAttended: false, anyRegistrado: false, orden: null });
  }

  for (const r of filas) {
    const k = claveDeFila(r);
    if (!inv.has(k)) {
      // Sin evento en el calendario (p. ej. los entregables): la fila manda.
      inv.set(k, {
        grupo: r.grupo, tipo: r.tipo, fecha: r.fecha, actividad: r.actividad,
        etiqueta: r.actividad, eventoId: null,
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

const bucketDe = (tipo) => (tipo === 'sesion' ? 'sesiones' : tipo === 'cafe' ? 'cafes' : 'entregables');

/**
 * Punto de entrada único.
 * @param filas      filas de session_attendance de la cohorte
 * @param eventos    eventos del calendario de la cohorte
 * @param programa   slug del programa (define los grupos)
 * @param candidatos [{ candidate_id, grupo }] — de las matrículas; necesarios para
 *                   que una actividad sin filas aparezca igual en la fila de cada persona
 */
export function calcularAsistencia({ filas = [], eventos = [], programa, candidatos = [] }) {
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
  for (const lista of porGrupoActividades.values()) lista.sort(porOrden);

  // ── Por candidato ─────────────────────────────────────────────────────────
  const porCandidato = {};
  const grupoDe = new Map(candidatos.map((c) => [c.candidate_id, c.grupo]));
  // Quien tenga filas pero no esté en la lista de matrículas igual se incluye.
  for (const r of filas) if (!grupoDe.has(r.candidate_id)) grupoDe.set(r.candidate_id, r.grupo);

  for (const [candidateId, grupo] of grupoDe) {
    const actividades = porGrupoActividades.get(grupo) || [];
    const g = { grupo, sesiones: [], cafes: [], entregables: [] };

    for (const a of actividades) {
      const fila = registro.get(`${a.k}|${candidateId}`);
      g[bucketDe(a.tipo)].push({
        candidate_id: candidateId,
        grupo: a.grupo,
        tipo: a.tipo,
        actividad: a.actividad,
        fecha: a.fecha,
        orden: a.orden,
        // Sin fila = nunca se le registró nada a esta persona en esa actividad.
        asistio: fila ? fila.asistio : null,
        observacion: fila ? fila.observacion : null,
        occurred: ocurridas.has(a.k),
      });
    }

    g.pctSesiones = pctOcurridas(g.sesiones);
    g.pctCafes = pctOcurridas(g.cafes);
    g.pctEntregables = pctOcurridas(g.entregables);

    const parts = [];
    if (g.pctSesiones != null) parts.push([PESOS.sesiones, g.pctSesiones]);
    if (g.pctCafes != null) parts.push([PESOS.cafes, g.pctCafes]);
    if (g.pctEntregables != null) parts.push([PESOS.entregables, g.pctEntregables]);
    const wsum = parts.reduce((s, [w]) => s + w, 0);
    g.totalPonderado = wsum
      ? Math.round(parts.reduce((s, [w, v]) => s + w * v, 0) / wsum)
      : null;

    porCandidato[candidateId] = g;
  }

  // ── Agregado por grupo, para los gráficos de barras ───────────────────────
  const porGrupo = {};
  for (const [grupo, actividades] of porGrupoActividades) {
    const construir = (tipo) =>
      actividades
        .filter((a) => a.tipo === tipo)
        .map((a) => {
          let asistieron = 0;
          let total = 0;
          for (const candidateId of grupoDe.keys()) {
            if (grupoDe.get(candidateId) !== grupo) continue;
            const fila = registro.get(`${a.k}|${candidateId}`);
            // `asistio` null (o sin fila) = no registrado: no suma a ningún lado.
            if (fila && fila.asistio !== null) {
              total++;
              if (fila.asistio) asistieron++;
            }
          }
          return {
            actividad: a.actividad,
            fecha: a.fecha,
            orden: a.orden,
            asistieron,
            total,
            occurred: ocurridas.has(a.k),
            pct: total ? Math.round((asistieron / total) * 100) : 0,
          };
        });
    porGrupo[grupo] = { sesiones: construir('sesion'), cafes: construir('cafe') };
  }

  // ── Actividades ya ocurridas sin un solo registro ─────────────────────────
  const sinCargar = [...inv.values()]
    .filter((v) => v.tipo !== 'entregable' && yaPaso(v.fecha) && !v.anyRegistrado)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  return { ocurridas, porCandidato, porGrupo, sinCargar };
}
