// Carga y alta del vocabulario de tipos de evento (tabla `tipos_evento`).
//
// El vocabulario vive en `src/lib/eventos.js`, que es plain .js sin acceso a
// Supabase para que los ETL de node lo puedan importar. Este módulo es el puente:
// trae las filas de la base y se las entrega a `aplicarTipos`.
//
// La migración `scripts/migracion_tipos_evento.sql` la corre el usuario a mano
// (el MCP de Supabase no tiene permisos DDL), así que TODO aquí funciona también
// sin la tabla: si la consulta falla, se sigue con el respaldo del código, que es
// exactamente la semilla de esa migración.
import { supabase } from './supabase';
import { aplicarTipos, tiposEvento } from './eventos';

let promesa = null;

// Se cachea la promesa, no el resultado: los dos hooks de datos la esperan a la
// vez al arrancar y así la consulta se hace una sola vez.
export function cargarTiposEvento({ recargar = false } = {}) {
  if (recargar) promesa = null;
  if (!promesa) {
    promesa = (async () => {
      const { data, error } = await supabase.from('tipos_evento').select('*').order('orden');
      if (error || !data?.length) return tiposEvento();
      return aplicarTipos(data);
    })();
  }
  return promesa;
}

// "Taller práctico" → "taller_practico". El valor es lo que se guarda dentro de
// `eventos.tipo` y es la clave de la tabla: se deriva de la etiqueta para que
// nadie tenga que inventarlo, y se limpia porque va a viajar en un text[].
export function valorDesdeEtiqueta(etiqueta) {
  return String(etiqueta)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Da de alta un tipo nuevo.
 * @param etiqueta       cómo se llama en pantalla
 * @param tomaAsistencia si se le registra asistencia
 * @param cuentaComo     clave de asistencia bajo la que se guarda: 'propio' para
 *                       estrenar la suya, o la de un tipo existente ('sesion',
 *                       'cafe'…) para sumarse a ese grupo de actividades
 * @param peso           fracción del total ponderado (0–1), o null para no pesar.
 *                       Solo aplica cuando estrena clave propia.
 */
export async function crearTipoEvento({ etiqueta, tomaAsistencia, cuentaComo = 'propio', peso = null }) {
  const valor = valorDesdeEtiqueta(etiqueta);
  if (!valor) throw new Error('El nombre del tipo no puede quedar vacío.');
  const propio = cuentaComo === 'propio';
  const fila = {
    valor,
    etiqueta: String(etiqueta).trim(),
    tipo_asistencia: tomaAsistencia ? (propio ? valor : cuentaComo) : null,
    // Un tipo que se suma a otra clave no declara peso: lo hereda de la fila
    // canónica de esa clave, que es la única que lo define.
    peso: tomaAsistencia && propio ? peso : null,
    // Al final de la cola: un tipo nuevo no debe ganarle la clave de asistencia a
    // los que ya existen cuando un evento lleve los dos.
    prioridad: 500,
    orden: 500,
    en_calendario: true,
  };
  const { error } = await supabase.from('tipos_evento').insert([fila]);
  if (error) {
    throw new Error(
      error.code === '23505'
        ? `Ya existe un tipo con el identificador "${valor}".`
        : error.message
    );
  }
  await cargarTiposEvento({ recargar: true });
  return valor;
}

// Cambia lo editable de un tipo existente: su etiqueta, su peso y si sigue
// ofreciéndose. `valor` y `tipo_asistencia` no se tocan — son la clave con la que
// ya están guardados los eventos y las filas de asistencia.
export async function actualizarTipoEvento(valor, cambios) {
  const permitido = {};
  if (cambios.etiqueta !== undefined) permitido.etiqueta = String(cambios.etiqueta).trim();
  if (cambios.peso !== undefined) permitido.peso = cambios.peso;
  if (cambios.activo !== undefined) permitido.activo = cambios.activo;
  const { error } = await supabase.from('tipos_evento').update(permitido).eq('valor', valor);
  if (error) throw new Error(error.message);
  await cargarTiposEvento({ recargar: true });
}
