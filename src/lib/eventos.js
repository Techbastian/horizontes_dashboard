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
