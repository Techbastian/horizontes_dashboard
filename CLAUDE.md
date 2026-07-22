# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> El proyecto, sus datos y sus comentarios están en español. Escribe código y documentación en español para que encaje con el resto.

## Qué es

Dashboard interno de gestión del programa **Horizontes Senior** (formación en analítica de datos para talento plateado; alianza Fundación Saldarriaga Concha, Ruta N, Alcaldía de Medellín). SPA en React que lee/escribe directo a Supabase. **Los datos son de producción real** — no hay entorno de staging. Deploy en Vercel.

Desde julio de 2026 el dashboard aloja **dos programas**: Horizontes Senior y **Círculos de Conocimiento** (ramificación con 263 participantes, cohorte `386dcf50-e269-4b5b-b248-aaa754dbd0aa`). Comparten la tabla `candidates`: 249 de los 263 de Círculos ya existían como postulantes de HS. Por eso **el frontend y los ETL fijan su programa por `slug`, nunca por `status='active'`** — ver la sección de convenciones.

## Comandos

```bash
npm run dev        # servidor de desarrollo Vite
npm run build      # tsc && vite build → dist/
npm run preview    # previsualiza el build

# ETL con DRY RUN por defecto (upload_asistencia, upload_asistencia_circulos,
#                              upload_circulos, upload_eventos,
#                              upload_eventos_circulos, upload_retiros)
node scripts/upload_asistencia.mjs            # dry run (no escribe)
node scripts/upload_asistencia.mjs --commit   # escribe
node scripts/diagnostico.mjs [enrollments|ids|join|rutas]   # inspección read-only; sin arg corre todo
```

⚠️ **`upload_formacion.mjs` y `sync_lista_definitiva.mjs` NO tienen dry run**: escriben en producción apenas arrancan. Además leen de `Reportes formacion/`, carpeta que hoy **no existe en el repo** (los demás ETL leen de `bases_de_datos/`) — son legacy: confirma con el usuario antes de correrlos.

No hay linter, test runner ni script de test configurados. `tsc` corre solo en `build`.

**Toolchain sin configuración explícita** — no lo "arregles" sin motivo:
- No hay `vite.config.*`. Vite 8 corre con defaults y transforma JSX con el runtime automático; **no hay plugin de React**, así que tampoco Fast Refresh (el `dev` recarga la página entera).
- `react` / `react-dom` **no están declarados en `package.json`**; llegan como peer deps de `recharts` / `react-router-dom` y sí quedan fijados en `package-lock.json` (React 19). El build pasa; si algún día falla la resolución, declararlos es la salida.
- `tsc` solo type-checkea los `.ts` de `src/` (los `.jsx` no se validan). En la práctica solo revisa los archivos plantilla sin usar — romperlos rompe el build.

## Arquitectura

### Flujo de datos: un hook por programa, props hacia abajo
`src/hooks/useApplicationsData.js` es el corazón del frontend (Horizontes Senior). En el `mount` hace **un fetch grande** de todas las tablas de Supabase y con `useMemo` computa ~30 métricas, `formationProgress`, `attendanceByCandidate`, `groupAttendance`, `retiros` y `continuidadCirculos`. `App.jsx` lo llama una vez y **pasa todo por props** a las páginas. No hay Context, Redux ni React Query — todo el estado vive en ese hook. Las mutaciones (`updateApplication`, `updateEnrollment`) escriben a Supabase y luego llaman `fetchData()` para refrescar. Al tocar datos de HS, casi siempre el cambio empieza aquí.

Los fetches de `project_applications` y `session_attendance` están **paginados de 1000 en 1000** (límite de PostgREST) — respeta ese patrón al agregar tablas grandes.

**Dos rutas de datos que NO pasan por ese hook** (no las "unifiques" por prolijidad):
- **Círculos** tiene su propio hook `src/hooks/useCirculosData.js` — otro programa, otra cohorte, otras métricas. `App.jsx` lo invoca **arriba** y baja por props, porque lo consumen dos páginas: `CirculosPage` (caracterización + avance en plataforma) y `FormationPage` (seguimiento de asistencia). Con el hook dentro de cada página se dispararían dos veces las mismas consultas. Solo el hook de HS bloquea el render: si Círculos falla, el resto del dashboard sigue.
- **`EventsPage`** y sus modales (`EventEditorModal`, `EventAttendanceModal`) consultan y escriben `eventos` y `session_attendance` **directo a Supabase**, con su propio estado local. Es el **único sitio que muestra los dos programas a la vez**: trae la lista de cohortes y las ofrece en un selector; `App.jsx` le pasa `cohort` (HS) solo como selección inicial. Consecuencia práctica: marcar asistencia desde un evento **no refresca** `useApplicationsData`, así que los % de Formación no cambian hasta recargar la página.

**Cruce entre los dos programas:** `useApplicationsData` sí lee las matrículas de Círculos para exponer `circulosIds` (Set de `candidate_id`) y `continuidadCirculos` (cuántos postulantes de HS siguieron allí). Esa continuidad **no está marcada en ningún campo** — se deriva cruzando `candidate_id`. El fetch va con `maybeSingle()` a propósito: si la cohorte de Círculos no existiera, el dashboard de HS debe seguir funcionando.

### Supabase: dos rutas de acceso
- **Frontend** (`src/lib/supabase.js`): clave **anon** desde `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, leídas de `.env`. Ojo: **`.env` sí está versionado** (`.gitignore` no lo cubre) — la anon key está en el historial de git; no agregues ahí secretos de mayor privilegio. El dashboard es interno y escribe con la anon key; las políticas RLS abren escritura pública en las tablas que edita (`eventos`, `session_attendance`).
- **Scripts ETL**: clave **service_role hardcodeada** en cada `.mjs` para cargas masivas.
- **DDL**: el MCP de Supabase **no tiene permisos DDL**. Los cambios de esquema van como `.sql` en `scripts/` que el usuario corre a mano en el SQL Editor. Escríbelos idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

### Modelo de datos
La base de Supabase es **compartida** por varios módulos (bolsa de empleo, aliados, retención, IA…). Abajo van **solo las tablas que este dashboard lee/escribe**. Jerarquía:

```
projects (por slug) → cohorts → project_applications → candidates
                              ↘ program_enrollments  → candidates
                                cohort_course_status  → education_library
                                session_attendance ← eventos
candidates → socio_demographic_data (1:1)
```

- **`projects`** — programa macro. Se resuelve por `slug='horizontes-senior'` (**nunca** por `status='active'`, ver convenciones). Campos usados: `id`, `name`, `status`, `slug`.
- **`cohorts`** — cohorte dentro del proyecto (`program_id` FK→projects). HS: la primera del proyecto (`order('created_at')`). Círculos: por `slug_application='circulos-de-conocimiento-i-2026'`. Ojo, **son dos columnas distintas**: `projects` tiene `slug`, `cohorts` tiene `slug_application`. Campos: `id`, `name`, `program_id`, `slug_application`, `start_date`.
- **`candidates`** — un registro por persona (se trae vía join). Campos usados: `id`, `first_name`, `last_name`, `email`, `phone`, `age`, `gender`, `education_level`, `city`, `document_type`, `document_number`, `acquisition_channel`, `is_active`, `birth_date`, `formal_experience_months`, `informal_experience_months`.
- **`socio_demographic_data`** — 1:1 con candidates (datos sensibles). HS lee `candidate_id`, `gender_identity`; Círculos además `sexual_orientation`, `ethnicity`, `marital_status`.
- **`project_applications`** — postulación al pipeline (`cohort_id`, `candidate_id`). Campos: `id`, `status`, `current_step`, `selection_scores` jsonb, `custom_answers` jsonb, `updated_at`.
- **`program_enrollments`** — matrícula post-selección (`cohort_id`, `candidate_id`, `application_id`). PK `id` int8. Campos: `status`, `custom_form_data` jsonb, `attendance_percentage`, `final_grade`, `certificate_url`, `enrolled_at`.
- **`cohort_course_status`** — progreso por curso y candidato. Campos: `candidate_id`, `cohort_id`, `course_id`, `percent_complete`, `is_active_enrollment`. El track Jr/Sr se infiere del título del curso.
- **`education_library`** — catálogo de cursos. Se lee `id`, `title` para nombrar los cursos de `cohort_course_status`.
- **`session_attendance`** — `orden` lo escribe el ETL de HS, pero **en Círculos va siempre `null`** (ni el ETL ni la captura desde la app lo ponen): el orden cronológico lo resuelve el desempate por `fecha` en `src/lib/asistencia.js`. Si algún día se escribe `orden` en un sitio y no en el otro, las sesiones se desordenan. Asistencia sesión a sesión (tabla nueva, DDL en `scripts/migracion_session_attendance.sql`). PK `id` bigint identity. Columnas: `cohort_id`, `candidate_id`, `grupo` (`Junior|Senior|Activación`), `tipo` (`sesion|cafe|entregable`), `actividad` (ej. `Sesión 25/05`, `Café 1`), `fecha`, `orden`, `asistio` bool (true=asistió/entregó, false=no, null=no registrado), `observacion`, `evento_id` uuid FK→eventos. `unique(cohort_id, candidate_id, grupo, tipo, actividad)`. RLS: lectura pública + escritura abierta anon (migración Fase 2).
- **`eventos`** — calendario de formación. Columnas: `id` uuid, `cohort_id`, `nombre`, `descripcion`, `evidencia_url`, `grupo` (`Junior|Senior|Activación|Compartido`), `codigo` (nullable; los eventos manuales van sin código), `tipo` text[] (ver `src/lib/eventos.js`), `fecha_hora_inicio`, `fecha_hora_fin`. Upsert idempotente por `onConflict('cohort_id,codigo')`. RLS de escritura abierta anon.

**Mucho estado de negocio vive en columnas JSON, no en columnas propias** — al buscar un dato, revisa estos jsonb antes de asumir que falta:
- `project_applications.custom_answers` → **HS**: `seguimiento_fases` (`grupo_asignado`, `elegibilidad`, `puntaje_tecnico`, `puntaje_entrevista`, `puntaje_total`, `seccion_entrevista`, `motivo_descarte`), `es_cuidador` bool. **Círculos**: `caracterizacion` (todo lo que el formulario de HubSpot respondió y no tenía columna propia: `sexo`, `identidad_genero`, `estrato`, `municipio`, `comuna`, `barrio`, `cabeza_de_hogar`, `escolaridad`, `habilidades_tecnicas`, `power_skills`…), más `programa`, `origen`, `hubspot`, `documento_formulario`.
- `program_enrollments.custom_form_data` → `ruta_asignada` (`Junior|Senior|Activación` en HS; **`Círculos` en Círculos**, grupo único), `estado_activo` bool, `elegido` bool, `cambio_nivel`, `ruta_inicial`, `historia`, `motivo_cambio`, `retiro` (objeto), `en_riesgo` + `riesgo_*`, `nombre_completo`, `cedula`, y ponderados de asistencia (`pond_sesiones`, `pond_cafes`, `pond_entregables`, `total_ponderado`).

### Tres reglas de negocio críticas (viven en JS, no en los datos)
1. **`elegido`**: solo aparecen en Formación/selección quienes fueron elegidos. La UI filtra `custom_form_data.elegido !== false` en varios sitios (FormationPage, metrics.transiciones, CandidateTable). Los enrollments con `elegido:false` son heredados/erróneos y no deben mostrarse.
2. **"Ocurridas vs pendientes"** (`src/lib/asistencia.js`, usado por los dos programas): el % de asistencia **solo cuenta actividades cuya fecha ya pasó**; las futuras van en gris y no entran ni al numerador ni al denominador. Los entregables cuentan una vez que alguien del grupo ya entregó. El total ponderado (sesiones 35% / cafés 40% / entregables 25%) se **renormaliza** sobre los componentes ya ocurridos — por eso en Círculos, que solo tiene sesiones, el total sale igual al % de sesiones sin necesidad de un caso especial. FormationPage usa estos valores calculados, no el `attendance_percentage` crudo.
3. **En Círculos manda lo respondido en Círculos.** Para los 249 que venían de HS, los campos compartidos de `candidates` (`gender`, `education_level`, `city`) conservan el valor heredado, que contradice el formulario de Círculos en varios casos (43 en escolaridad — el vocabulario de HS no tenía "Maestría"; 2 en sexo). `useCirculosData` lee primero `caracterizacion.*` y solo cae a los campos compartidos como respaldo. No "simplifiques" ese fallback. En la misma línea: el formulario de Círculos **no preguntó por cuidadores**, así que la página reporta jefatura de hogar como lo que es y no la hace pasar por el dato de cuidadores.

### Páginas (rutas en `App.jsx`, `react-router-dom` v7)
`/` DashboardPage · `/circulos` CirculosPage · `/candidatos` CandidatesPage · `/formacion` FormationPage · `/retiros` RetirosPage · `/eventos` EventsPage. Todas envueltas en `Layout` (Sidebar). **`/formacion` y `/eventos` tienen selector de programa** (HS ↔ Círculos); `/circulos` es solo de Círculos; el resto, solo de HS. En `/formacion` los perfiles de Círculos **no son editables**: `updateEnrollment` resuelve contra la lista de HS y los flujos del modal (retiro, riesgo, cambio de nivel) no están definidos para Círculos. Gráficos con Recharts. `src/lib/eventos.js` centraliza vocabulario de grupos/tipos del calendario y el mapeo evento→asistencia. **El vocabulario de grupos depende del programa**, no es global: `gruposDe(slug)` da `Junior|Senior|Activación|Compartido` para HS y `Círculos` (grupo único, 263 personas sin subdividir) para Círculos; de ahí comen los chips de filtro, el selector del editor y las pestañas de asistencia. Al agregar un grupo, tócalo ahí y no en los componentes. `src/lib/bogotaTime.js` centraliza el manejo de zona horaria de Colombia (**siempre UTC-5, sin horario de verano**) para el calendario de eventos: usa sus helpers (`bogotaDateTimeToIso`, `isoToBogotaDate`, `overlapsBogotaDay`, etc.) al convertir entre fechas del picker y los `timestamptz` de Supabase, no `new Date()` a pelo, para no desfasar el día.

## Convenciones

- **Componentes en `.jsx`, no `.tsx`**, aunque exista `tsconfig.json`. TypeScript solo valida el build; no conviertas a TSX.
- **Estilos: un solo `src/index.css`** (~2.000 líneas) con variables CSS en `:root` (tema claro, acentos teal/violeta) y clases globales (`.card`, `.kpi-*`, `.grp-junior`…). No hay Tailwind ni CSS modules; los componentes combinan `className` con `style` inline para lo puntual. Al agregar UI, reutiliza las clases y variables existentes antes de inventar colores.
- **Archivos plantilla Vite sin usar** — ignóralos y no los importes: `src/counter.ts`, `src/main.ts`, `src/style.css`, `src/assets/{vite,typescript}.svg`. El entry real es `src/main.jsx` → importa `src/index.css`.
- **Organización de scripts** (`scripts/`, carpeta única): un ETL por dominio (no fusionar `upload_*`, cada uno parsea un Excel distinto con lógica extensa). Los diagnósticos read-only nuevos van como **sub-comando dentro de `diagnostico.mjs`**, no como archivo suelto. Temporales de exploración → scratchpad de la sesión, no en el repo.
- **`bases_de_datos/`** (fuentes Excel de los ETL) está **gitignored**. Los scripts esperan encontrar ahí `Horizontes_Senior_Matriz_Maestra_VF.xlsx`, `V9_CronogramaFormación_H_S.xlsx`, etc.
- **Nunca resuelvas el programa o la cohorte por `status='active'`.** Hay dos programas activos; sin `ORDER BY`, PostgREST no garantiza cuál devuelve, y `.single()` falla directamente. Cada consumidor se fija a su destino explícitamente y conviene mantener ese constante al inicio del archivo, no inline:
  - hooks del frontend → `PROJECT_SLUG='horizontes-senior'`, `CIRCULOS_COHORT_SLUG='circulos-de-conocimiento-i-2026'` (contra `cohorts.slug_application`).
  - ETL de HS (`upload_asistencia`, `upload_retiros`, `upload_formacion`, `sync_lista_definitiva`) → `COHORT_SLUG='horizontes-senior-2026'`.
  - ETL con UUID a pelo → `upload_eventos.mjs` (`3e8e4b55-…`, cohorte de HS) y `upload_circulos.mjs` (`386dcf50-e269-4b5b-b248-aaa754dbd0aa`, Círculos I).
- **`id` de `program_enrollments`, `socio_demographic_data` y `session_attendance` es `bigint generated always as identity`**: omítelo en los `insert`. El spec de PostgREST los reporta como "sin default", pero pasarles un valor falla con `cannot insert a non-DEFAULT value into column "id"`.
- **La identidad de una persona no se resuelve por documento a secas.** Los formularios traen documentos mal digitados (13 de 263 en Círculos). El patrón probado está en `upload_circulos.mjs`: cascada documento exacto → correo exacto → teléfono + nombre ≥90% con documento a distancia ≤2 → alta nueva.
- **Verificación**: el usuario prueba los cambios en el navegador él mismo — no abras Chrome para verificar (ver memoria `verificacion-preferencia`).
- **Vercel**: SPA con rewrite de todo a `/index.html` (`vercel.json`) para el routing del lado del cliente.
