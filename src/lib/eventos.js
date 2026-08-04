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

// Vocabulario de tipos: actividades + comunicaciones. Un evento puede tener 1 o más.
export const TIPO_OPCIONES = [
  { value: 'sesion', label: 'Sesión' },
  { value: 'cafe', label: 'Café' },
  // El `value` sigue siendo 'nivelacion': está guardado en `eventos.tipo` de 13
  // eventos y cambiarlo los dejaría sin tipo. Solo cambia la etiqueta visible,
  // que es lo que el programa decidió dejar de llamar "nivelación".
  { value: 'nivelacion', label: 'Formación en Platzi' },
  // Acompañamiento en grupo. Puede ir junto a 'sesion' o solo, y eso decide si
  // cuenta para el porcentaje del programa — ver `attendanceTipo`.
  { value: 'mentoria', label: 'Mentoría' },
  { value: 'evaluacion', label: 'Evaluación' },
  { value: 'proyecto', label: 'Proyecto' },
  { value: 'evento', label: 'Evento' },
  { value: 'correo', label: 'Correo' },
  { value: 'mensaje', label: 'Mensaje' },
  { value: 'llamada', label: 'Llamada' },
];

const TIPO_LABEL = Object.fromEntries(TIPO_OPCIONES.map((t) => [t.value, t.label]));
export const tipoLabel = (v) => TIPO_LABEL[v] || v;

// Mapea el tipo[] de un evento al tipo de session_attendance
// ('cafe' | 'sesion' | 'mentoria') o null si el evento no lleva asistencia
// (evaluación, proyecto, evento…).
//
// El orden importa y es lo que distingue los dos usos de 'mentoria':
//   • junto a 'sesion'  → cuenta como sesión y entra en el % de asistencia.
//     Así están las sesiones 2 a 5 de Círculos, que SON mentorías pero son la
//     formación misma del programa.
//   • 'mentoria' a secas → tipo propio: se le toma asistencia igual que a una
//     sesión, pero NO entra en ningún porcentaje (decisión del usuario,
//     2026-08-04). Así están las mentorías de seguimiento de Horizontes Senior,
//     que son acompañamiento y no formación.
// De ahí que 'mentoria' se evalúe de último: quien traiga 'sesion' explícito
// gana, y los datos ya guardados de Círculos no cambian de tipo.
export function attendanceTipo(event) {
  const t = Array.isArray(event?.tipo) ? event.tipo : [];
  if (t.includes('cafe')) return 'cafe';
  if (t.includes('sesion') || t.includes('nivelacion')) return 'sesion';
  if (t.includes('mentoria')) return 'mentoria';
  return null;
}

// Grupos a mostrar en el panel de asistencia de un evento.
// "Compartido" (cafés de HS) → los 3 grupos en pestañas; el resto → su propio
// grupo. En Círculos no hay compartidos: siempre cae en la rama del grupo único.
export function gruposDeAsistencia(event, programa) {
  if (event?.grupo === 'Compartido') return gruposParticipantesDe(programa);
  return event?.grupo ? [event.grupo] : [];
}
