// Vocabulario y helpers de retención. Plain .js: lo comparten la UI y —cuando
// haga falta— los scripts de node.
//
// Las SEIS categorías son vocabulario compartido con scripts/upload_retiros.mjs,
// que las clasifica desde la plantilla de PQRS. RetirosPage agrupa por este
// campo: una categoría inventada en un solo lado queda fuera de los gráficos.
import { nombreActividad } from './asistencia.js';

export const CATEGORIAS_RETIRO = [
  'Situación laboral',
  'Salud',
  'Metodología / contenido',
  'Sin contacto',
  'Tiempo / disponibilidad',
  'Voluntario / personal',
];

// Etiqueta para quien está inactivo pero nadie ha dicho por qué. NO es una
// séptima categoría del vocabulario: es la ausencia de clasificación, y existe
// justamente para que esos casos se vean y se puedan clasificar, en vez de
// desaparecer del tablero (que es lo que pasaba antes).
export const SIN_CLASIFICAR = 'Sin clasificar';

export const COLORES_CATEGORIA = {
  'Metodología / contenido': '#7c3aed',
  'Sin contacto': '#64748b',
  'Situación laboral': '#3b82f6',
  'Tiempo / disponibilidad': '#f59e0b',
  Salud: '#ef4444',
  'Voluntario / personal': '#0d9488',
  [SIN_CLASIFICAR]: '#94a3b8',
};

export const colorCategoria = (c) => COLORES_CATEGORIA[c] || '#64748b';

// Canales por los que llega una novedad de riesgo. Mismos que usa la plantilla
// de PQRS, para que lo registrado en la app y lo importado se lean igual.
export const CANALES_RIESGO = ['Llamada', 'WhatsApp', 'Correo', 'Sesión', 'Café', 'Otro'];

/**
 * Contexto de asistencia de una persona: sirve para entender un retiro sin
 * motivo escrito ("faltó a las últimas 3, la última excusa fue…") y para
 * priorizar a quién llamar.
 * @param att entrada de attendanceByCandidate (o undefined)
 */
export function contextoAsistencia(att) {
  const items = [...(att?.sesiones || []), ...(att?.cafes || [])]
    .filter((i) => i.occurred && i.asistio !== null);
  if (!items.length) return { medidas: 0, faltasSeguidas: 0, ultimaExcusa: null, ultimaActividad: null };

  let faltasSeguidas = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].asistio === false) faltasSeguidas++;
    else break;
  }

  // La excusa más reciente, venga de la actividad que venga.
  const conExcusa = items.filter((i) => i.observacion && String(i.observacion).trim());
  const ultima = conExcusa.length ? conExcusa[conExcusa.length - 1] : null;

  return {
    medidas: items.length,
    asistio: items.filter((i) => i.asistio === true).length,
    faltasSeguidas,
    ultimaExcusa: ultima ? { texto: ultima.observacion, actividad: nombreActividad(ultima), fecha: ultima.fecha } : null,
    ultimaActividad: items[items.length - 1] || null,
  };
}

/** Todas las excusas registradas de una persona, en orden cronológico. */
export function excusasDe(att) {
  // Aquí sí entran las mentorías: una excusa vale lo mismo venga de donde venga.
  // En `contextoAsistencia` no, porque las faltas seguidas son señal de riesgo
  // sobre lo obligatorio y la mentoría es acompañamiento.
  return [...(att?.sesiones || []), ...(att?.cafes || []), ...(att?.mentorias || []), ...(att?.entregables || [])]
    .filter((i) => i.observacion && String(i.observacion).trim())
    .map((i) => ({
      actividad: nombreActividad(i),
      fecha: i.fecha,
      grupo: i.grupo,
      tipo: i.tipo,
      asistio: i.asistio,
      texto: String(i.observacion).trim(),
    }));
}
