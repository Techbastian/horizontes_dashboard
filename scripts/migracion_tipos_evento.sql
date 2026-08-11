-- ============================================================================
-- migracion_tipos_evento.sql
-- Saca el vocabulario de tipos de evento del código y lo pone en la base, para
-- poder dar de alta tipos nuevos desde el propio calendario.
--
-- Hasta ahora los tipos vivían como constante en src/lib/eventos.js
-- (TIPO_OPCIONES) y los pesos del total ponderado como otra constante en
-- src/lib/asistencia.js (PESOS). Agregar un tipo obligaba a tocar código y
-- desplegar, y —peor— un tipo nuevo con asistencia se colaba en el 25% de
-- entregables sin que nadie lo decidiera.
--
-- POR QUÉ UNA TABLA APARTE Y NO COLUMNAS EN `eventos`:
--   • `entregable` pesa 25% y NO tiene un solo evento de calendario: los
--     entregables solo existen en session_attendance (no tienen fecha).
--   • `eventos.tipo` es un text[]: un evento puede ser mentoría Y sesión a la
--     vez (las sesiones 2 a 5 de Círculos). Con el peso en la fila del evento no
--     hay forma de decidir cuál aplica.
--   • El peso es del tipo, no del evento: habría que repetir 0.35 en los 29
--     eventos de sesión y uno en blanco descuadraría el porcentaje sin aviso.
--   • Un tipo nuevo no existiría hasta crear el primer evento con él, así que no
--     se podría ofrecer en el selector antes de usarlo.
--
-- `eventos.tipo` se queda exactamente como está: no hay nada que migrar.
--
-- Correr en el SQL Editor de Supabase, proyecto rbhgyrxblkzxwfrrcavh.
-- Idempotente: se puede correr varias veces.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tipos_evento (
  -- El valor que se guarda dentro de `eventos.tipo` (text[]).
  valor            text PRIMARY KEY,
  etiqueta         text NOT NULL,

  -- Bajo qué clave se guarda la asistencia en `session_attendance.tipo`.
  -- NULL = a este tipo no se le toma asistencia (evaluación, proyecto, correo…).
  -- Varios tipos pueden compartir clave: 'nivelacion' apunta a 'sesion' porque
  -- las nivelaciones de Activación se registraron y cuentan como sesiones.
  tipo_asistencia  text,

  -- Se deriva de la columna de arriba para que no puedan contradecirse: es la
  -- respuesta a "¿se le toma asistencia?" y no se escribe a mano.
  toma_asistencia  boolean GENERATED ALWAYS AS (tipo_asistencia IS NOT NULL) STORED,

  -- Fracción del total ponderado. Solo aplica a la fila canónica (la que tiene
  -- valor = tipo_asistencia); las demás heredan el peso de esa.
  -- NULL = se registra pero NO pesa. Así están las mentorías: son acompañamiento
  -- y no formación (decisión del usuario, 2026-08-04). Los pesos se renormalizan
  -- sobre los componentes que ya tienen actividades ocurridas, así que no tienen
  -- por qué sumar 1.
  peso             numeric,

  -- Un evento puede llevar varios tipos a la vez; gana el de menor prioridad al
  -- decidir bajo qué clave se guarda su asistencia. Por eso 'cafe' (10) va antes
  -- que 'sesion' (20) y 'mentoria' (90) de últimas: una mentoría marcada TAMBIÉN
  -- como sesión cuenta como sesión (Círculos), y a secas no pesa (Horizontes).
  prioridad        integer NOT NULL DEFAULT 100,

  -- Orden en el selector del editor de eventos.
  orden            integer NOT NULL DEFAULT 100,

  -- false = no se ofrece al crear un evento. 'entregable' está aquí solo para
  -- declarar su peso: no es una actividad de calendario, no tiene fecha.
  en_calendario    boolean NOT NULL DEFAULT true,

  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Semilla: exactamente el vocabulario que hoy está en el código, para que correr
-- esto no cambie ni un número. ON CONFLICT DO NOTHING para no pisar lo que el
-- usuario haya editado después desde la app.
INSERT INTO public.tipos_evento (valor, etiqueta, tipo_asistencia, peso, prioridad, orden, en_calendario) VALUES
  ('sesion',     'Sesión',              'sesion',     0.35,  20,  10, true),
  ('cafe',       'Café',                'cafe',       0.40,  10,  20, true),
  -- El valor sigue siendo 'nivelacion' porque está guardado en 13 eventos;
  -- cambiarlo los dejaría sin tipo. Solo cambió la etiqueta visible.
  ('nivelacion', 'Formación en Platzi', 'sesion',     NULL,  30,  30, true),
  ('mentoria',   'Mentoría',            'mentoria',   NULL,  90,  40, true),
  ('entregable', 'Entregable',          'entregable', 0.25, 950, 950, false),
  ('evaluacion', 'Evaluación',          NULL,         NULL, 100, 100, true),
  ('proyecto',   'Proyecto',            NULL,         NULL, 100, 110, true),
  ('evento',     'Evento',              NULL,         NULL, 100, 120, true),
  ('correo',     'Correo',              NULL,         NULL, 100, 200, true),
  ('mensaje',    'Mensaje',             NULL,         NULL, 100, 210, true),
  ('llamada',    'Llamada',             NULL,         NULL, 100, 220, true)
ON CONFLICT (valor) DO NOTHING;

-- RLS: mismo criterio que `eventos` y `session_attendance`. El dashboard es
-- interno y escribe con la anon key.
ALTER TABLE public.tipos_evento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tipos_evento_read" ON public.tipos_evento;
CREATE POLICY "tipos_evento_read"
  ON public.tipos_evento FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "tipos_evento_insert" ON public.tipos_evento;
CREATE POLICY "tipos_evento_insert"
  ON public.tipos_evento FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "tipos_evento_update" ON public.tipos_evento;
CREATE POLICY "tipos_evento_update"
  ON public.tipos_evento FOR UPDATE
  USING (true) WITH CHECK (true);

-- Sin política de DELETE a propósito: borrar un tipo dejaría huérfanos los
-- eventos que lo usan y las filas de asistencia que se guardaron bajo su clave.
-- Para retirar un tipo del selector se pone `activo = false`.
