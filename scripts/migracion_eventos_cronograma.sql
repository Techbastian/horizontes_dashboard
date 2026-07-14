-- ============================================================================
-- migracion_eventos_cronograma.sql
-- Añade grupo / código / tipo a la tabla `eventos` para reflejar el cronograma
-- de formación (Junior / Senior / Activación / Compartido) en el calendario.
--
-- Correr manualmente en el SQL Editor de Supabase (el MCP no tiene permisos DDL).
-- Es idempotente: se puede correr varias veces sin error.
-- ============================================================================

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS grupo  text,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS tipo   text[];

-- Índice único para la carga idempotente (upsert por cohorte + código).
-- Postgres trata cada NULL como distinto, así que los eventos MANUALES
-- (codigo NULL) NO chocan entre sí ni con los del cronograma; solo se exige
-- unicidad cuando codigo tiene valor. Esto habilita onConflict('cohort_id,codigo').
CREATE UNIQUE INDEX IF NOT EXISTS eventos_cohort_codigo_uidx
  ON public.eventos (cohort_id, codigo);

-- Índice de apoyo para filtrar por grupo en el calendario.
CREATE INDEX IF NOT EXISTS eventos_cohort_grupo_idx
  ON public.eventos (cohort_id, grupo);
