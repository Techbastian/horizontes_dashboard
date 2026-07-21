# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> El proyecto, sus datos y sus comentarios están en español. Escribe código y documentación en español para que encaje con el resto.

## Qué es

Dashboard interno de gestión del programa **Horizontes Senior** (formación en analítica de datos para talento plateado; alianza Fundación Saldarriaga Concha, Ruta N, Alcaldía de Medellín). SPA en React que lee/escribe directo a Supabase. **Los datos son de producción real** — no hay entorno de staging. Deploy en Vercel.

## Comandos

```bash
npm run dev        # servidor de desarrollo Vite
npm run build      # tsc && vite build → dist/
npm run preview    # previsualiza el build

# ETL (scripts/*.mjs): DRY RUN por defecto, --commit para escribir en Supabase
node scripts/upload_asistencia.mjs            # dry run (no escribe)
node scripts/upload_asistencia.mjs --commit   # escribe
node scripts/diagnostico.mjs [enrollments|ids|join|rutas]   # inspección read-only; sin arg corre todo
```

No hay linter, test runner ni script de test configurados. `tsc` corre solo en `build`.

## Arquitectura

### Flujo de datos: un solo hook, props hacia abajo
`src/hooks/useApplicationsData.js` es el corazón del frontend. En el `mount` hace **un fetch grande** de todas las tablas de Supabase y con `useMemo` computa ~30 métricas, `formationProgress`, `attendanceByCandidate`, `groupAttendance` y `retiros`. `App.jsx` lo llama una vez y **pasa todo por props** a las páginas. No hay Context, Redux ni React Query — todo el estado vive en ese hook. Las mutaciones (`updateApplication`, `updateEnrollment`) escriben a Supabase y luego llaman `fetchData()` para refrescar. Al tocar datos, casi siempre el cambio empieza aquí.

Los fetches de `project_applications` y `session_attendance` están **paginados de 1000 en 1000** (límite de PostgREST) — respeta ese patrón al agregar tablas grandes.

### Supabase: dos rutas de acceso
- **Frontend** (`src/lib/supabase.js`): clave **anon** desde `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env`, no versionado). El dashboard es interno y escribe con la anon key; las políticas RLS abren escritura pública en las tablas que edita (`eventos`, `session_attendance`).
- **Scripts ETL**: clave **service_role hardcodeada** en cada `.mjs` para cargas masivas.
- **DDL**: el MCP de Supabase **no tiene permisos DDL**. Los cambios de esquema van como `.sql` en `scripts/` que el usuario corre a mano en el SQL Editor. Escríbelos idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

### Modelo de datos
La base de Supabase es **compartida** por varios módulos (bolsa de empleo, aliados, retención, IA…). Abajo van **solo las tablas que este dashboard lee/escribe**. Jerarquía:

```
projects (status='active') → cohorts → project_applications → candidates
                                     ↘ program_enrollments  → candidates
                                       cohort_course_status  → education_library
                                       session_attendance ← eventos
candidates → socio_demographic_data (1:1)
```

- **`projects`** — programa macro. El dashboard toma el único con `status='active'`. Campos usados: `id`, `name`, `status`.
- **`cohorts`** — cohorte dentro del proyecto (`program_id` FK→projects). Se toma la del proyecto activo. Campos: `id`, `name`, `program_id`.
- **`candidates`** — un registro por persona (se trae vía join). Campos usados: `id`, `first_name`, `last_name`, `email`, `phone`, `age`, `gender`, `education_level`, `city`, `document_type`, `document_number`, `acquisition_channel`, `is_active`, `birth_date`, `formal_experience_months`, `informal_experience_months`.
- **`socio_demographic_data`** — 1:1 con candidates (datos sensibles). El dashboard lee `candidate_id`, `gender_identity`.
- **`project_applications`** — postulación al pipeline (`cohort_id`, `candidate_id`). Campos: `id`, `status`, `current_step`, `selection_scores` jsonb, `custom_answers` jsonb, `updated_at`.
- **`program_enrollments`** — matrícula post-selección (`cohort_id`, `candidate_id`, `application_id`). PK `id` int8. Campos: `status`, `custom_form_data` jsonb, `attendance_percentage`, `final_grade`, `certificate_url`, `enrolled_at`.
- **`cohort_course_status`** — progreso por curso y candidato. Campos: `candidate_id`, `cohort_id`, `course_id`, `percent_complete`, `is_active_enrollment`. El track Jr/Sr se infiere del título del curso.
- **`education_library`** — catálogo de cursos. Se lee `id`, `title` para nombrar los cursos de `cohort_course_status`.
- **`session_attendance`** — asistencia sesión a sesión (tabla nueva, DDL en `scripts/migracion_session_attendance.sql`). PK `id` bigint identity. Columnas: `cohort_id`, `candidate_id`, `grupo` (`Junior|Senior|Activación`), `tipo` (`sesion|cafe|entregable`), `actividad` (ej. `Sesión 25/05`, `Café 1`), `fecha`, `orden`, `asistio` bool (true=asistió/entregó, false=no, null=no registrado), `observacion`, `evento_id` uuid FK→eventos. `unique(cohort_id, candidate_id, grupo, tipo, actividad)`. RLS: lectura pública + escritura abierta anon (migración Fase 2).
- **`eventos`** — calendario de formación. Columnas: `id` uuid, `cohort_id`, `nombre`, `descripcion`, `evidencia_url`, `grupo` (`Junior|Senior|Activación|Compartido`), `codigo` (nullable; los eventos manuales van sin código), `tipo` text[] (ver `src/lib/eventos.js`), `fecha_hora_inicio`, `fecha_hora_fin`. Upsert idempotente por `onConflict('cohort_id,codigo')`. RLS de escritura abierta anon.

**Mucho estado de negocio vive en columnas JSON, no en columnas propias** — al buscar un dato, revisa estos jsonb antes de asumir que falta:
- `project_applications.custom_answers` → `seguimiento_fases` (`grupo_asignado`, `elegibilidad`, `puntaje_tecnico`, `puntaje_entrevista`, `puntaje_total`, `seccion_entrevista`, `motivo_descarte`), `es_cuidador` bool.
- `program_enrollments.custom_form_data` → `ruta_asignada` (`Junior|Senior|Activación`), `estado_activo` bool, `elegido` bool, `cambio_nivel`, `ruta_inicial`, `historia`, `motivo_cambio`, `retiro` (objeto), `en_riesgo` + `riesgo_*`, `nombre_completo`, `cedula`, y ponderados de asistencia (`pond_sesiones`, `pond_cafes`, `pond_entregables`, `total_ponderado`).

### Dos reglas de negocio críticas (viven en JS, no en los datos)
1. **`elegido`**: solo aparecen en Formación/selección quienes fueron elegidos. La UI filtra `custom_form_data.elegido !== false` en varios sitios (FormationPage, metrics.transiciones, CandidateTable). Los enrollments con `elegido:false` son heredados/erróneos y no deben mostrarse.
2. **"Ocurridas vs pendientes"** (`occurredActivities` en el hook): el % de asistencia **solo cuenta actividades cuya fecha ya pasó**; las futuras van en gris y no entran ni al numerador ni al denominador. Los entregables cuentan una vez que alguien del grupo ya entregó. El total ponderado (sesiones 35% / cafés 40% / entregables 25%) se **renormaliza** sobre los componentes ya ocurridos. FormationPage usa estos valores calculados, no el `attendance_percentage` crudo.

### Páginas (rutas en `App.jsx`, `react-router-dom` v7)
`/` DashboardPage · `/candidatos` CandidatesPage · `/formacion` FormationPage · `/retiros` RetirosPage · `/eventos` EventsPage. Todas envueltas en `Layout` (Sidebar). Gráficos con Recharts. `src/lib/eventos.js` centraliza vocabulario de grupos/tipos del calendario y el mapeo evento→asistencia. `src/lib/bogotaTime.js` centraliza el manejo de zona horaria de Colombia (**siempre UTC-5, sin horario de verano**) para el calendario de eventos: usa sus helpers (`bogotaDateTimeToIso`, `isoToBogotaDate`, `overlapsBogotaDay`, etc.) al convertir entre fechas del picker y los `timestamptz` de Supabase, no `new Date()` a pelo, para no desfasar el día.

## Convenciones

- **Componentes en `.jsx`, no `.tsx`**, aunque exista `tsconfig.json`. TypeScript solo valida el build; no conviertas a TSX.
- **Archivos plantilla Vite sin usar** — ignóralos y no los importes: `src/counter.ts`, `src/main.ts`, `src/style.css`, `src/assets/{vite,typescript}.svg`. El entry real es `src/main.jsx` → importa `src/index.css`.
- **Organización de scripts** (`scripts/`, carpeta única): un ETL por dominio (no fusionar `upload_*`, cada uno parsea un Excel distinto con lógica extensa). Los diagnósticos read-only nuevos van como **sub-comando dentro de `diagnostico.mjs`**, no como archivo suelto. Temporales de exploración → scratchpad de la sesión, no en el repo.
- **`bases_de_datos/`** (fuentes Excel de los ETL) está **gitignored**. Los scripts esperan encontrar ahí `Horizontes_Senior_Matriz_Maestra_VF.xlsx`, `V9_CronogramaFormación_H_S.xlsx`, etc.
- **Verificación**: el usuario prueba los cambios en el navegador él mismo — no abras Chrome para verificar (ver memoria `verificacion-preferencia`).
- **Vercel**: SPA con rewrite de todo a `/index.html` (`vercel.json`) para el routing del lado del cliente.
