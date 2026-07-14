-- ============================================================================
-- migracion_asistencia_eventos.sql  ·  Fase 2
-- Habilita capturar/editar asistencia desde el calendario de Eventos.
--   1) Vincula cada registro de asistencia con su evento (columna evento_id).
--   2) Abre políticas de escritura en session_attendance para la anon key
--      (el dashboard es interno y escribe con la anon key, igual que `eventos`).
--
-- Correr en el SQL Editor de Supabase, proyecto rbhgyrxblkzxwfrrcavh.
-- Idempotente: se puede correr varias veces.
-- ============================================================================

-- 1) Vínculo evento ↔ asistencia (no rompe la clave única existente).
ALTER TABLE public.session_attendance
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES public.eventos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_attendance_evento
  ON public.session_attendance (evento_id);

-- 2) Políticas de escritura (insert / update / delete) para anon + authenticated.
--    La lectura pública ya existe (session_attendance_read).
DROP POLICY IF EXISTS "session_attendance_insert" ON public.session_attendance;
CREATE POLICY "session_attendance_insert"
  ON public.session_attendance FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "session_attendance_update" ON public.session_attendance;
CREATE POLICY "session_attendance_update"
  ON public.session_attendance FOR UPDATE
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_attendance_delete" ON public.session_attendance;
CREATE POLICY "session_attendance_delete"
  ON public.session_attendance FOR DELETE
  USING (true);
