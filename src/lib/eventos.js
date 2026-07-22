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
  { value: 'nivelacion', label: 'Nivelación' },
  { value: 'evaluacion', label: 'Evaluación' },
  { value: 'proyecto', label: 'Proyecto' },
  { value: 'evento', label: 'Evento' },
  { value: 'correo', label: 'Correo' },
  { value: 'mensaje', label: 'Mensaje' },
  { value: 'llamada', label: 'Llamada' },
];

const TIPO_LABEL = Object.fromEntries(TIPO_OPCIONES.map((t) => [t.value, t.label]));
export const tipoLabel = (v) => TIPO_LABEL[v] || v;

// Mapea el tipo[] de un evento al tipo de session_attendance ('cafe' | 'sesion')
// o null si el evento no lleva asistencia (evaluación, proyecto, evento…).
export function attendanceTipo(event) {
  const t = Array.isArray(event?.tipo) ? event.tipo : [];
  if (t.includes('cafe')) return 'cafe';
  if (t.includes('sesion') || t.includes('nivelacion')) return 'sesion';
  return null;
}

// Grupos a mostrar en el panel de asistencia de un evento.
// "Compartido" (cafés de HS) → los 3 grupos en pestañas; el resto → su propio
// grupo. En Círculos no hay compartidos: siempre cae en la rama del grupo único.
export function gruposDeAsistencia(event, programa) {
  if (event?.grupo === 'Compartido') return gruposParticipantesDe(programa);
  return event?.grupo ? [event.grupo] : [];
}
