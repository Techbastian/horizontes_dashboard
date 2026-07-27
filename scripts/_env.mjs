// ============================================================================
// _env.mjs — Credenciales de Supabase para los scripts, leídas del .env de la
// raíz del proyecto. NUNCA hardcodear claves en los scripts.
//
// Antes la `service_role` estaba escrita en los 9 scripts, y el repositorio es
// público: la clave quedó en el historial de git desde el commit inicial. Con
// esto, rotarla es cambiar un valor en un solo archivo, que además está
// gitignoreado.
//
// Se lee el .env a mano (en vez de `node --env-file`) para no cambiar la forma
// de invocar los scripts: `node scripts/upload_x.mjs` sigue funcionando igual.
// ============================================================================
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_ENV = resolve(RAIZ, '.env');

function leerEnv() {
  if (!existsSync(RUTA_ENV)) {
    throw new Error(
      `No existe ${RUTA_ENV}.\n` +
        '   Copia .env.example a .env y pon ahí las credenciales de Supabase.'
    );
  }
  const vars = {};
  for (const linea of readFileSync(RUTA_ENV, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    // Se parte en el PRIMER '=' nada más: los JWT pueden traer '=' de padding.
    const i = limpia.indexOf('=');
    if (i === -1) continue;
    vars[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim();
  }
  return vars;
}

function exigir(vars, nombre, paraQue) {
  const valor = vars[nombre];
  if (!valor) {
    throw new Error(
      `Falta ${nombre} en .env — ${paraQue}\n` +
        '   Está en Supabase → Project Settings → API.'
    );
  }
  return valor;
}

// Para los ETL: la service_role salta la RLS y puede escribir en todo.
export function credencialesServicio() {
  const vars = leerEnv();
  return {
    url: exigir(vars, 'VITE_SUPABASE_URL', 'es la URL del proyecto.'),
    key: exigir(
      vars,
      'SUPABASE_SERVICE_ROLE_KEY',
      'los ETL la necesitan para escribir saltando la RLS.'
    ),
  };
}

// Para los diagnósticos: la anon key basta y no puede romper nada.
export function credencialesLectura() {
  const vars = leerEnv();
  return {
    url: exigir(vars, 'VITE_SUPABASE_URL', 'es la URL del proyecto.'),
    key: exigir(vars, 'VITE_SUPABASE_ANON_KEY', 'los diagnósticos leen con ella.'),
  };
}
