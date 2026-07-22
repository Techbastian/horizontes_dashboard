// Cálculo de asistencia a partir de las filas de `session_attendance`.
//
// Vive aquí porque lo usan los dos programas: Horizontes Senior (useApplicationsData)
// y Círculos de Conocimiento (useCirculosData). Antes estaba embebido en el hook de
// HS; duplicarlo habría hecho que los porcentajes de los dos programas se fueran
// separando con cada ajuste.
//
// Nada de esto depende del programa: opera sobre las filas que se le pasen, que ya
// vienen acotadas por `cohort_id` desde cada hook.

// Pesos del total ponderado (Horizontes Senior). Se renormalizan sobre los
// componentes que ya tienen actividades ocurridas, así que en Círculos —que solo
// tiene sesiones— el total termina siendo exactamente el % de sesiones.
const PESOS = { sesiones: 0.35, cafes: 0.4, entregables: 0.25 };

const claveActividad = (r) => `${r.grupo}|${r.tipo}|${r.actividad}`;

// Orden cronológico. En HS el ETL numera las actividades con `orden`; la captura
// desde la app lo deja en null (todo Círculos), así que la fecha desempata.
const porOrden = (a, b) =>
  (a.orden ?? 0) - (b.orden ?? 0) ||
  String(a.fecha || '').localeCompare(String(b.fecha || ''));

// Actividades que YA ocurrieron (son las únicas que cuentan en el %). Una actividad
// "ocurrió" si:
//   • sesiones y cafés → tienen fecha y esa fecha ya pasó (o es hoy); las futuras van
//     en gris y NO entran ni al numerador ni al denominador.
//   • entregables → cuentan una vez que el grupo ya arrancó a entregar (al menos
//     alguien entregó): entregado = 100%, pendiente = 0%. Mientras nadie del grupo
//     haya entregado, el entregable se excluye para no penalizar por algo que aún no
//     aplica; se auto-activa con la primera entrega.
//   • fallback sin fecha → si al menos alguien asistió.
export function calcularOcurridas(filas) {
  const agg = {};
  filas.forEach((r) => {
    const k = claveActividad(r);
    if (!agg[k]) agg[k] = { tipo: r.tipo, fecha: r.fecha, anyAttended: false };
    if (r.asistio === true) agg[k].anyAttended = true;
  });
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const set = new Set();
  Object.entries(agg).forEach(([k, v]) => {
    const ocurrio =
      v.tipo === 'entregable'
        ? v.anyAttended
        : v.fecha
          ? new Date(v.fecha) <= hoy
          : v.anyAttended;
    if (ocurrio) set.add(k);
  });
  return set;
}

// % contando solo actividades ocurridas. null = aún no ocurre ninguna → la UI
// muestra "—" en vez de 0%, que se leería como "no asistió a nada".
export function pctOcurridas(items) {
  const occ = items.filter((i) => i.occurred);
  if (!occ.length) return null;
  return Math.round((occ.filter((i) => i.asistio === true).length / occ.length) * 100);
}

// Asistencia por candidato, con flag `occurred` por actividad y porcentajes ajustados.
// → { [candidate_id]: { grupo, sesiones[], cafes[], entregables[], pct*, totalPonderado } }
export function calcularAsistenciaPorCandidato(filas, ocurridas) {
  const map = {};
  filas.forEach((r) => {
    if (!map[r.candidate_id]) {
      map[r.candidate_id] = { grupo: r.grupo, sesiones: [], cafes: [], entregables: [] };
    }
    const bucket = r.tipo === 'sesion' ? 'sesiones' : r.tipo === 'cafe' ? 'cafes' : 'entregables';
    map[r.candidate_id][bucket].push({ ...r, occurred: ocurridas.has(claveActividad(r)) });
  });

  Object.values(map).forEach((g) => {
    ['sesiones', 'cafes', 'entregables'].forEach((k) => g[k].sort(porOrden));
    g.pctSesiones = pctOcurridas(g.sesiones);
    g.pctCafes = pctOcurridas(g.cafes);
    g.pctEntregables = pctOcurridas(g.entregables);

    // Renormaliza los pesos sobre los componentes que sí tienen actividades ocurridas.
    const parts = [];
    if (g.pctSesiones != null) parts.push([PESOS.sesiones, g.pctSesiones]);
    if (g.pctCafes != null) parts.push([PESOS.cafes, g.pctCafes]);
    if (g.pctEntregables != null) parts.push([PESOS.entregables, g.pctEntregables]);
    const wsum = parts.reduce((s, [w]) => s + w, 0);
    g.totalPonderado = wsum
      ? Math.round(parts.reduce((s, [w, v]) => s + w * v, 0) / wsum)
      : null;
  });
  return map;
}

// Asistencia agregada por grupo, para los gráficos de barras.
// → { [grupo]: { sesiones: [{actividad, fecha, asistieron, total, pct, occurred}], cafes: [...] } }
export function calcularAsistenciaPorGrupo(filas, ocurridas) {
  const grupos = {};
  filas.forEach((r) => {
    if (r.tipo !== 'sesion' && r.tipo !== 'cafe') return;
    grupos[r.grupo] = grupos[r.grupo] || { sesion: {}, cafe: {} };
    const bucket = grupos[r.grupo][r.tipo];
    if (!bucket[r.actividad]) {
      bucket[r.actividad] = {
        actividad: r.actividad,
        fecha: r.fecha,
        orden: r.orden,
        asistieron: 0,
        total: 0,
      };
    }
    // `asistio` null = no registrado: no suma ni al numerador ni al denominador.
    if (r.asistio !== null) {
      bucket[r.actividad].total++;
      if (r.asistio) bucket[r.actividad].asistieron++;
    }
  });

  const construir = (grupo, tipo, obj) =>
    Object.values(obj)
      .sort(porOrden)
      .map((s) => ({
        ...s,
        occurred: ocurridas.has(`${grupo}|${tipo}|${s.actividad}`),
        pct: s.total ? Math.round((s.asistieron / s.total) * 100) : 0,
      }));

  const out = {};
  Object.entries(grupos).forEach(([grupo, tipos]) => {
    out[grupo] = {
      sesiones: construir(grupo, 'sesion', tipos.sesion),
      cafes: construir(grupo, 'cafe', tipos.cafe),
    };
  });
  return out;
}
