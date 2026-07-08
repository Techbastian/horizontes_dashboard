-- ============================================================================
-- Tabla de asistencia sesión por sesión — Horizontes Senior
-- Pegar y ejecutar en:  Supabase → SQL Editor → New query → Run
-- ============================================================================

create table if not exists public.session_attendance (
  id           bigint generated always as identity primary key,
  cohort_id    uuid    not null references public.cohorts(id)    on delete cascade,
  candidate_id uuid    not null references public.candidates(id) on delete cascade,
  grupo        text    not null,          -- 'Junior' | 'Senior' | 'Activación'
  tipo         text    not null,          -- 'sesion' | 'cafe' | 'entregable'
  actividad    text    not null,          -- ej. 'Sesión 25/05', 'Café 1', 'Entregable 1'
  fecha        date,                       -- fecha de la actividad (si aplica)
  orden        int,                        -- orden dentro del tipo
  asistio      boolean,                    -- true = asistió/entregó, false = no, null = no registrado
  observacion  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (cohort_id, candidate_id, grupo, tipo, actividad)
);

create index if not exists idx_session_attendance_cohort    on public.session_attendance(cohort_id);
create index if not exists idx_session_attendance_candidate on public.session_attendance(candidate_id);
create index if not exists idx_session_attendance_grupo     on public.session_attendance(grupo);

-- RLS: habilitar y permitir lectura pública (el dashboard usa la anon key para leer)
alter table public.session_attendance enable row level security;

drop policy if exists "session_attendance_read" on public.session_attendance;
create policy "session_attendance_read"
  on public.session_attendance for select
  using (true);11
