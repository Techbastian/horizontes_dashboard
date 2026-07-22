-- ============================================================================
-- migracion_circulos_programa.sql
-- Crea el programa "Círculos de Conocimiento" (ramificación de Horizontes
-- Senior) y su primera cohorte, para hacerle seguimiento en el mismo dashboard.
--
-- Correr manualmente en el SQL Editor de Supabase (el MCP no tiene permisos).
-- Es idempotente: se puede correr varias veces sin duplicar ni fallar.
--
-- REQUISITO PREVIO: el hook `useApplicationsData.js` ya debe estar fijando
-- Horizontes Senior por slug (Fase 0). Antes de ese cambio, crear un segundo
-- proyecto con status='active' hacía indeterminado cuál cargaba el dashboard.
--
-- No hay DDL aquí: solo dos filas nuevas. `session_attendance` y `eventos`
-- funcionan tal cual para Círculos porque están indexadas por cohort_id y sus
-- columnas `grupo` / `tipo` son text libre, sin CHECK constraint.
--
-- `id` y `created_at` se omiten a propósito: ambas tablas ya traen DEFAULT.
-- ============================================================================

-- ── 1) Proyecto ─────────────────────────────────────────────────────────────
-- La descripción y el financiador se copian de Horizontes Senior (mismo
-- ecosistema), en vez de duplicarlos a mano, para que no se desincronicen.
INSERT INTO public.projects (
  name, slug, description, status,
  funder_name, form_config, selection_pipeline, resources, report_dates
)
SELECT
  'Círculos de Conocimiento',
  'circulos-de-conocimiento',
  hs.description,
  'active',
  hs.funder_name,
  '[]'::jsonb,
  '["postulacion"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
FROM public.projects hs
WHERE hs.slug = 'horizontes-senior'
  AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.slug = 'circulos-de-conocimiento'
  );

-- ── 2) Cohorte ──────────────────────────────────────────────────────────────
-- start_date = 2026-07-21, la sesión de apertura. end_date queda NULL hasta
-- que se definan las fechas de las sesiones sincrónicas.
INSERT INTO public.cohorts (
  program_id, name, slug_application,
  cohort_description, start_date, end_date, status,
  form_conf, selection_pipeline, allies, resources, report_dates, selection_criteria
)
SELECT
  cc.id,
  'Círculos de Conocimiento I',
  'circulos-de-conocimiento-i-2026',
  cc.description,
  '2026-07-21'::date,
  NULL,
  'active',
  '{}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb
FROM public.projects cc
WHERE cc.slug = 'circulos-de-conocimiento'
  AND NOT EXISTS (
    SELECT 1 FROM public.cohorts c
    WHERE c.slug_application = 'circulos-de-conocimiento-i-2026'
  );

-- ── 3) Verificación ─────────────────────────────────────────────────────────
-- Debe devolver 2 filas: Horizontes Senior y Círculos de Conocimiento, cada uno
-- con su cohorte. Copia el id de la cohorte de Círculos: lo necesita el ETL de
-- carga (scripts/upload_circulos.mjs).
SELECT
  p.name        AS proyecto,
  p.slug        AS proyecto_slug,
  p.status      AS proyecto_status,
  c.id          AS cohorte_id,
  c.name        AS cohorte,
  c.start_date  AS inicio
FROM public.projects p
LEFT JOIN public.cohorts c ON c.program_id = p.id
ORDER BY p.created_at;
