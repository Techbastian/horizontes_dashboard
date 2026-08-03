// Tasas del funnel de selección.
//
// Vive aquí, en plain .js, porque la usan dos consumidores que no deben
// desincronizarse: el gráfico de /  (FunnelChart) y el informe ejecutivo en PDF.
// Cuando cada uno la calculaba por su cuenta decían cosas distintas del mismo
// dato: la pantalla medía cada paso contra el de arriba —y por eso Senior salía
// como % de Junior, 66%, un número sin significado— y el informe dividía todo
// entre el total de postulaciones.
//
// La regla: por defecto un paso se mide contra el anterior, que es lo natural en
// un embudo. Un paso puede fijar su propio `base` cuando NO es consecutivo del
// de arriba — Junior y Senior son dos RAMAS paralelas del mismo grupo, así que
// las dos se miden contra los elegibles y nunca una contra otra.

/**
 * Añade a cada paso su `base` y su `tasa` (entero, en %).
 * El primer paso es el 100% de referencia.
 */
export function conTasas(data = []) {
  return data.map((paso, i) => {
    const base = paso.base ?? (i > 0 ? data[i - 1].value : 0);
    return {
      ...paso,
      base,
      tasa: i > 0 && base > 0 ? Math.round((paso.value / base) * 100) : 100,
    };
  });
}
