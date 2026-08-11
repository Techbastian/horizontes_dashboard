// Configuración compartida del calendario de Eventos: grupos y tipos.
// La usan EventsPage (filtros, colores, badges) y EventEditorModal (selectores).

// El vocabulario de grupos depende del PROGRAMA; no es global. Horizontes Senior
// se divide en rutas (Junior/Senior/Activación) más los eventos compartidos entre
// las tres, mientras que Círculos de Conocimiento es un grupo único: sus 263
// participantes no están subdivididos (decisión del usuario, 2026-07-22).
export const PROGRAMA_HS = 'horizontes-senior';
export const PROGRAMA_CIRCULOS = 'circulos-de-conocimiento';

const GRUPOS_POR_PROGRAMA = {
  [PROGRAMA_HS]: ['Junior', 'Senior', 'Activación', 'Compartido'],
  [PROGRAMA_CIRCULOS]: ['Círculos'],
};

// Grupos con participantes: excluye "Compartido", que se desglosa en los demás.
const PARTICIPANTES_POR_PROGRAMA = {
  [PROGRAMA_HS]: ['Junior', 'Senior', 'Activación'],
  [PROGRAMA_CIRCULOS]: ['Círculos'],
};

// Ante un slug desconocido se cae a Horizontes Senior: es el programa base y deja
// el calendario usable, en vez de dejarlo sin grupos y sin poder crear eventos.
export const gruposDe = (programa) =>
  GRUPOS_POR_PROGRAMA[programa] || GRUPOS_POR_PROGRAMA[PROGRAMA_HS];

export const gruposParticipantesDe = (programa) =>
  PARTICIPANTES_POR_PROGRAMA[programa] || PARTICIPANTES_POR_PROGRAMA[PROGRAMA_HS];

// ¿La lista de posibles asistentes de un evento debe excluir a los inactivos?
//
// Solo en Horizontes Senior. Ahí `estado_activo:false` significa lo que parece
// —la persona salió del programa: 30 de 140, todas con retiro o marcadas
// INACTIVO en la matriz— y listarlas al tomar asistencia estorba.
//
// En Círculos NO, aunque 198 de 263 estén en `estado_activo:false`: ahí esa
// bandera la escribe `upload_registro_circulos.mjs` con el registro en la
// plataforma de formación (`registro_plataforma`), así que significa "todavía
// no se registró en Learning to Earning", no "se retiró". Nadie tiene retiro y
// 57 de esas personas ya asistieron a sesiones; filtrarlas dejaría el listado
// en 65 y sin poder marcar a quien sí va. Si algún día Círculos separa el
// registro en plataforma del estado en el programa, esto se revisa.
const SOLO_ACTIVOS_POR_PROGRAMA = {
  [PROGRAMA_HS]: true,
  [PROGRAMA_CIRCULOS]: false,
};

export const soloActivosEnAsistencia = (programa) =>
  SOLO_ACTIVOS_POR_PROGRAMA[programa] ?? SOLO_ACTIVOS_POR_PROGRAMA[PROGRAMA_HS];

// Clase CSS por grupo (colores definidos en index.css).
export const GRUPO_CLASS = {
  Junior: 'grp-junior', // violeta
  Senior: 'grp-senior', // teal
  Activación: 'grp-activacion', // ámbar
  Compartido: 'grp-compartido', // gris
  Círculos: 'grp-circulos', // azul
};

// ── Vocabulario de tipos de evento ─────────────────────────────────────────
//
// La fuente de verdad es la tabla `tipos_evento` (scripts/migracion_tipos_evento.sql),
// para poder dar de alta tipos nuevos desde el calendario sin tocar código. Lo de
// abajo es el respaldo: es exactamente lo que la tabla trae de semilla, y es lo
// que rige mientras la migración no se haya corrido y cuando estos módulos se
// importan desde node (los ETL, que no siempre tienen por qué consultarla).
//
// Cada tipo declara:
//   • tipoAsistencia — bajo qué clave se guarda en `session_attendance.tipo`.
//     null = no se le toma asistencia. Varios tipos pueden compartir clave:
//     'nivelacion' apunta a 'sesion' porque las nivelaciones de Activación se
//     registraron y cuentan como sesiones.
//   • peso — fracción del total ponderado. Solo cuenta en la fila canónica (la
//     que cumple value === tipoAsistencia); null = se registra pero no pesa.
//   • prioridad — con qué clave se queda un evento que trae varios tipos: gana
//     la menor. De ahí que 'mentoria' vaya de última (ver `attendanceTipo`).
const TIPOS_POR_DEFECTO = [
  { value: 'sesion', label: 'Sesión', tipoAsistencia: 'sesion', peso: 0.35, prioridad: 20, orden: 10, enCalendario: true },
  { value: 'cafe', label: 'Café', tipoAsistencia: 'cafe', peso: 0.4, prioridad: 10, orden: 20, enCalendario: true },
  // El `value` sigue siendo 'nivelacion': está guardado en `eventos.tipo` de 13
  // eventos y cambiarlo los dejaría sin tipo. Solo cambia la etiqueta visible,
  // que es lo que el programa decidió dejar de llamar "nivelación".
  { value: 'nivelacion', label: 'Formación en Platzi', tipoAsistencia: 'sesion', peso: null, prioridad: 30, orden: 30, enCalendario: true },
  // Acompañamiento en grupo. Puede ir junto a 'sesion' o solo, y eso decide si
  // cuenta para el porcentaje del programa — ver `attendanceTipo`.
  { value: 'mentoria', label: 'Mentoría', tipoAsistencia: 'mentoria', peso: null, prioridad: 90, orden: 40, enCalendario: true },
  // No es una actividad de calendario (los entregables no tienen fecha): está
  // aquí solo para declarar su peso en el total ponderado.
  { value: 'entregable', label: 'Entregable', tipoAsistencia: 'entregable', peso: 0.25, prioridad: 950, orden: 950, enCalendario: false },
  { value: 'evaluacion', label: 'Evaluación', tipoAsistencia: null, peso: null, prioridad: 100, orden: 100, enCalendario: true },
  { value: 'proyecto', label: 'Proyecto', tipoAsistencia: null, peso: null, prioridad: 100, orden: 110, enCalendario: true },
  { value: 'evento', label: 'Evento', tipoAsistencia: null, peso: null, prioridad: 100, orden: 120, enCalendario: true },
  { value: 'correo', label: 'Correo', tipoAsistencia: null, peso: null, prioridad: 100, orden: 200, enCalendario: true },
  { value: 'mensaje', label: 'Mensaje', tipoAsistencia: null, peso: null, prioridad: 100, orden: 210, enCalendario: true },
  { value: 'llamada', label: 'Llamada', tipoAsistencia: null, peso: null, prioridad: 100, orden: 220, enCalendario: true },
];

// Registro vivo. Es estado a nivel de módulo, que en esta app funciona porque el
// único punto de carga (`cargarTiposEvento`) se resuelve ANTES de que se calcule
// nada: los dos hooks de datos lo esperan dentro de su propio fetch, y
// `useApplicationsData` bloquea el render de toda la app hasta terminar. Si
// algún día se llamara después del primer cálculo, habría que subirlo a props
// como el resto del estado.
let TIPOS = TIPOS_POR_DEFECTO;

// Reemplaza el vocabulario con el de la base. Se ignoran las filas sin `value`
// para que una fila a medio escribir no tumbe el calendario.
export function aplicarTipos(filas) {
  const limpias = (filas || [])
    .filter((f) => f && (f.valor || f.value))
    .map((f) => ({
      value: f.valor ?? f.value,
      label: f.etiqueta ?? f.label ?? (f.valor ?? f.value),
      tipoAsistencia: f.tipo_asistencia ?? f.tipoAsistencia ?? null,
      peso: f.peso == null ? null : Number(f.peso),
      prioridad: Number(f.prioridad ?? 100),
      orden: Number(f.orden ?? 100),
      enCalendario: (f.en_calendario ?? f.enCalendario) !== false,
      activo: (f.activo ?? true) !== false,
    }))
    .filter((f) => f.activo);
  if (limpias.length) TIPOS = limpias;
  return TIPOS;
}

export const tiposEvento = () => TIPOS;

// Los que se ofrecen al crear un evento, en su orden.
export const tiposDeCalendario = () =>
  TIPOS.filter((t) => t.enCalendario).sort((a, b) => a.orden - b.orden);

export const tipoLabel = (v) => TIPOS.find((t) => t.value === v)?.label || v;

// Peso de cada bucket del total ponderado, tomado de la fila canónica de cada
// clave de asistencia: { sesiones: 0.35, cafes: 0.4, entregables: 0.25 }.
// Las claves sin peso (mentorías) sencillamente no aparecen.
const BUCKET_DE_CLAVE = { sesion: 'sesiones', cafe: 'cafes', mentoria: 'mentorias', entregable: 'entregables' };
export function pesosDeAsistencia() {
  const pesos = {};
  for (const t of TIPOS) {
    if (t.peso == null || t.tipoAsistencia !== t.value) continue;
    pesos[BUCKET_DE_CLAVE[t.value] || t.value] = t.peso;
  }
  return pesos;
}

// Mapea el tipo[] de un evento a la clave de session_attendance
// ('cafe' | 'sesion' | 'mentoria' | la de un tipo nuevo), o null si el evento no
// lleva asistencia (evaluación, proyecto, evento…).
//
// Con varios tipos gana el de menor `prioridad`, y ahí está lo que distingue los
// dos usos de 'mentoria':
//   • junto a 'sesion'  → cuenta como sesión y entra en el % de asistencia.
//     Así están las sesiones 2 a 5 de Círculos, que SON mentorías pero son la
//     formación misma del programa.
//   • 'mentoria' a secas → clave propia: se le toma asistencia igual que a una
//     sesión, pero NO entra en ningún porcentaje (decisión del usuario,
//     2026-08-04). Así están las mentorías de seguimiento de Horizontes Senior,
//     que son acompañamiento y no formación.
// De ahí que 'mentoria' tenga la prioridad más alta: quien traiga 'sesion'
// explícito gana, y los datos ya guardados de Círculos no cambian de clave.
export function attendanceTipo(event) {
  const t = Array.isArray(event?.tipo) ? event.tipo : [];
  let mejor = null;
  for (const valor of t) {
    const def = TIPOS.find((x) => x.value === valor);
    if (!def?.tipoAsistencia) continue;
    if (!mejor || def.prioridad < mejor.prioridad) mejor = def;
  }
  return mejor ? mejor.tipoAsistencia : null;
}

// Grupos a mostrar en el panel de asistencia de un evento.
// "Compartido" (cafés de HS) → los 3 grupos en pestañas; el resto → su propio
// grupo. En Círculos no hay compartidos: siempre cae en la rama del grupo único.
export function gruposDeAsistencia(event, programa) {
  if (event?.grupo === 'Compartido') return gruposParticipantesDe(programa);
  return event?.grupo ? [event.grupo] : [];
}
