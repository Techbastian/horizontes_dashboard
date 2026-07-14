// Configuración compartida del calendario de Eventos: grupos y tipos.
// La usan EventsPage (filtros, colores, badges) y EventEditorModal (selectores).

export const GRUPOS = ['Junior', 'Senior', 'Activación', 'Compartido'];

// Clase CSS por grupo (colores definidos en index.css).
export const GRUPO_CLASS = {
  Junior: 'grp-junior', // violeta
  Senior: 'grp-senior', // teal
  Activación: 'grp-activacion', // ámbar
  Compartido: 'grp-compartido', // gris
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

// Grupos concretos con participantes (excluye "Compartido", que se desglosa).
export const GRUPOS_PARTICIPANTES = ['Junior', 'Senior', 'Activación'];

// Mapea el tipo[] de un evento al tipo de session_attendance ('cafe' | 'sesion')
// o null si el evento no lleva asistencia (evaluación, proyecto, evento…).
export function attendanceTipo(event) {
  const t = Array.isArray(event?.tipo) ? event.tipo : [];
  if (t.includes('cafe')) return 'cafe';
  if (t.includes('sesion') || t.includes('nivelacion')) return 'sesion';
  return null;
}

// Grupos a mostrar en el panel de asistencia de un evento.
// "Compartido" (cafés) → los 3 grupos en pestañas; el resto → su propio grupo.
export function gruposDeAsistencia(event) {
  if (event?.grupo === 'Compartido') return GRUPOS_PARTICIPANTES;
  return event?.grupo ? [event.grupo] : [];
}
