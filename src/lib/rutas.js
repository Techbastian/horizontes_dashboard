// HISTORIAL DE RUTA: por qué grupos ha pasado una persona y desde cuándo.
// Vive en `program_enrollments.custom_form_data.historial_ruta`.
//
// Existe porque la asistencia se calcula contra el grupo de la persona, mientras
// que las filas de `session_attendance` son inmutables y guardan el grupo del
// momento en que ocurrió la actividad. Sin historial, mover a alguien de
// Activación a Junior le borraba de la vista sus sesiones de Activación (la
// búsqueda pasaba a preguntar por `Junior|…`) y le abría huecos en sesiones
// Junior de mayo y junio, a las que no pudo asistir porque aún no estaba ahí.
//
// Forma:
//   historial_ruta: [
//     { ruta: 'Activación', desde: '2026-07-08', hasta: '2026-07-22', motivo: '…' },
//     { ruta: 'Junior',     desde: '2026-07-23', hasta: null,         motivo: '…' },
//   ]
//
// Quien nunca cambió de grupo NO tiene `historial_ruta`: se deriva una sola fase
// abierta desde `ruta_asignada` y todo se comporta igual que antes. Los campos
// legacy (`ruta_asignada`, `ruta_inicial`, `cambio_nivel`) se siguen escribiendo
// derivados del historial, para que el badge y el bloque "Historial" del modal
// no dependan de que la persona ya tenga fases.
//
// Con extensión .js y sin JSX a propósito: los scripts ETL también lo importan.
import { bogotaPlusDays } from './bogotaTime.js';

/** Fases de una matrícula, en orden cronológico. `[]` si no tiene ruta alguna. */
export function fasesDeMatricula(cf) {
  const hist = (Array.isArray(cf?.historial_ruta) ? cf.historial_ruta : []).filter((f) => f?.ruta);
  if (hist.length) {
    return hist
      .map((f) => ({
        ruta: f.ruta,
        desde: f.desde || null,
        hasta: f.hasta || null,
        motivo: f.motivo || null,
      }))
      .sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));
  }
  return cf?.ruta_asignada ? [{ ruta: cf.ruta_asignada, desde: null, hasta: null, motivo: null }] : [];
}

/** Grupo actual: la última fase. Cae a `ruta_asignada` si no hay historial. */
export function rutaActual(cf) {
  const fases = fasesDeMatricula(cf);
  return fases.length ? fases[fases.length - 1].ruta : (cf?.ruta_asignada || null);
}

/** ¿Pasó por más de un grupo? Decide si la UI segmenta por fases o no. */
export const tieneVariasFases = (cf) => fasesDeMatricula(cf).length > 1;

/**
 * En qué grupo estaba la persona en una fecha dada ('YYYY-MM-DD'), o `null` si
 * no cae en ninguna fase. Lo usan los ETL para etiquetar cada fila de
 * `session_attendance` con el grupo donde REALMENTE ocurrió la actividad: quien
 * pasó de Activación a Junior el 23/07 hizo las sesiones de julio como
 * Activación, pero el Café 3 (23/07) ya como Junior. Sin esto, el grupo saldría
 * de la hoja del Excel y la actividad quedaría colgando de la fase equivocada.
 */
export function grupoEnFecha(cf, fecha) {
  if (!fecha) return null; // los entregables no tienen fecha: no se puede ubicar
  // SIN historial real no hay respuesta: la fase derivada de `ruta_asignada` es
  // abierta por los dos lados y contestaría "su ruta de hoy" para CUALQUIER
  // fecha, incluso anterior a que la tuviera. Eso reescribiría el pasado de
  // quien cambia de grupo por otra vía (p. ej. el Excel lo pasa de Junior a
  // Senior) y duplicaría sus filas en los dos grupos. Ya pasó una vez.
  if (!Array.isArray(cf?.historial_ruta) || !cf.historial_ruta.length) return null;
  const f = String(fecha).slice(0, 10);
  for (const fase of fasesDeMatricula(cf)) {
    if (fase.desde && f < fase.desde) continue;
    if (fase.hasta && f > fase.hasta) continue;
    return fase.ruta;
  }
  return null;
}

// Texto de `cambio_nivel`, que es lo que lee HistoryBadge en FormationPage.
// Ojo con el orden: el badge prueba /Ascendió/ antes que /activación/, así que
// venir de Activación se resuelve aquí primero para que muestre "⚡ Activación".
function etiquetaCambio(anterior, nueva) {
  if (!anterior || anterior === nueva) return null;
  if (anterior === 'Activación') return `Pasó de Activación a ${nueva}`;
  if (nueva === 'Senior') return `Ascendió a Senior desde ${anterior}`;
  if (nueva === 'Junior') return `Descendió a Junior desde ${anterior}`;
  return `Cambió de ${anterior} a ${nueva}`;
}

/**
 * Mueve a alguien de grupo preservando su historia.
 * Cierra la fase abierta el día ANTES de `desde` (así las ventanas no se solapan
 * y ninguna actividad cae en dos fases) y abre la nueva.
 *
 * @param cf     custom_form_data actual de la matrícula
 * @param nueva  grupo destino
 * @param desde  'YYYY-MM-DD' en que empieza a contar el grupo nuevo
 * @param motivo texto libre, opcional
 * @returns los campos a mezclar en custom_form_data, o `null` si no hay cambio
 */
export function cambiarDeRuta(cf, { ruta: nueva, desde, motivo = null }) {
  const fases = fasesDeMatricula(cf);
  const anterior = fases.length ? fases[fases.length - 1].ruta : null;
  if (!nueva || anterior === nueva) return null;

  const historial = fases.map((f) => ({ ...f }));
  if (historial.length) {
    const abierta = historial[historial.length - 1];
    // Una fase que empezó el mismo día (o después) que la nueva nunca ocurrió:
    // se descarta en vez de dejarla con un rango invertido.
    if (abierta.desde && desde && abierta.desde >= desde) historial.pop();
    else abierta.hasta = desde ? bogotaPlusDays(desde, -1) : null;
  }
  historial.push({ ruta: nueva, desde: desde || null, hasta: null, motivo });

  return {
    historial_ruta: historial,
    ruta_asignada: nueva,
    ruta_inicial: historial[0].ruta,
    cambio_nivel: etiquetaCambio(anterior, nueva) || cf?.cambio_nivel || null,
    motivo_cambio: motivo || cf?.motivo_cambio || null,
  };
}
