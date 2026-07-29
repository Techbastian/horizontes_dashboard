import { SeccionInforme, CifrasInforme, TablaInforme, BarraInforme } from './InformeModal';

// Informe ejecutivo del programa: el que se le presenta a la Fundación, Ruta N
// y la Alcaldía. Toma las mismas métricas que pinta el Dashboard —no recalcula
// nada— y las ordena en el relato: meta, embudo, quiénes son, cómo van y qué
// pasó con quienes salieron.

const META_FORMADOS = 100; // misma meta que la card del Dashboard

const colorPct = (p) => (p == null ? '#94a3b8' : p >= 75 ? '#10b981' : p >= 40 ? '#f97316' : '#ef4444');

const ORDEN_RUTAS = ['Senior', 'Junior', 'Activación'];

export default function InformeEjecutivo({
  metrics,
  formationProgress,
  groupAttendance = {},
  retiros,
  continuidadCirculos,
  cohort,
}) {
  if (!metrics) return null;
  const sel = metrics.seleccionados || { activos: {}, inactivos: {} };
  const activos = sel.totalActivos || 0;
  const margen = activos - META_FORMADOS;

  // Promedio de asistencia por grupo a partir de lo ya ocurrido, igual que en
  // /formacion: cada actividad pesa por sus asistentes reales, no por su %.
  const asistenciaGrupo = ORDEN_RUTAS.map((g) => {
    const ses = (groupAttendance[g]?.sesiones || []).filter((s) => s.occurred);
    const cafes = (groupAttendance[g]?.cafes || []).filter((s) => s.occurred);
    const suma = (lista) =>
      lista.reduce((acc, s) => ({ a: acc.a + s.asistieron, t: acc.t + s.total }), { a: 0, t: 0 });
    const s = suma(ses);
    const c = suma(cafes);
    return {
      grupo: g,
      sesiones: ses.length,
      pctSesiones: s.t ? Math.round((s.a / s.t) * 100) : null,
      cafes: cafes.length,
      pctCafes: c.t ? Math.round((c.a / c.t) * 100) : null,
      activos: sel.activos?.[g] || 0,
    };
  }).filter((x) => x.activos > 0 || x.sesiones > 0);

  const categorias = Object.entries(retiros?.porCategoria || {}).sort((a, b) => b[1] - a[1]);
  const totalRetiros = retiros?.total || 0;

  return (
    <>
      <SeccionInforme
        titulo="Meta del programa"
        descripcion={`La meta son ${META_FORMADOS} personas formadas. Se cuentan solo quienes siguen activos hoy en las rutas Senior y Junior (la Estrategia de Activación es nivel Junior); los retiros no suman.`}
      >
        <CifrasInforme
          items={[
            { valor: activos, label: 'Activos en formación', detalle: `${margen >= 0 ? '+' : ''}${margen} frente a la meta` },
            { valor: META_FORMADOS, label: 'Meta' },
            { valor: sel.totalElegidos || 0, label: 'Seleccionados', detalle: `${sel.totalInactivos || 0} ya inactivos` },
            { valor: metrics.total?.toLocaleString?.() ?? metrics.total, label: 'Postulaciones recibidas' },
          ]}
        />
      </SeccionInforme>

      <SeccionInforme
        titulo="Embudo de selección"
        descripcion={`Tasa de elegibilidad: ${metrics.tasaElegibilidad}% de las postulaciones. ${metrics.evaluados} personas evaluadas y ${metrics.entrevistados} entrevistadas.`}
      >
        <TablaInforme
          columnas={[
            { titulo: 'Etapa', ancho: '28%' },
            { titulo: 'Personas', alinear: 'center', ancho: '12%' },
            { titulo: 'Proporción sobre el total', alinear: 'left' },
          ]}
          filas={(metrics.funnelData || []).map((f) => [
            f.label || f.name,
            f.value,
            <BarraInforme
              valor={f.value}
              max={metrics.total || 1}
              color={f.color}
              etiqueta={`${Math.round((f.value / (metrics.total || 1)) * 100)}%`}
            />,
          ])}
        />
      </SeccionInforme>

      <SeccionInforme titulo="Distribución de los seleccionados">
        <TablaInforme
          columnas={[
            { titulo: 'Ruta' },
            { titulo: 'Activos', alinear: 'center' },
            { titulo: 'Inactivos', alinear: 'center' },
            { titulo: 'Total', alinear: 'center' },
          ]}
          filas={ORDEN_RUTAS.filter((g) => (sel.activos?.[g] || 0) + (sel.inactivos?.[g] || 0) > 0).map((g) => [
            g === 'Activación' ? 'Estrategia de Activación' : `Ruta ${g}`,
            sel.activos?.[g] || 0,
            sel.inactivos?.[g] || 0,
            (sel.activos?.[g] || 0) + (sel.inactivos?.[g] || 0),
          ])}
        />
      </SeccionInforme>

      <SeccionInforme
        titulo="Perfil de las personas en formación"
        descripcion={`${metrics.totalEnrolledActive} matriculadas activas. La identidad de género se toma del registro socio-demográfico cuando existe.`}
      >
        <TablaInforme
          columnas={[{ titulo: 'Identidad de género' }, { titulo: 'Personas', alinear: 'center' }, { titulo: '', alinear: 'left' }]}
          filas={Object.entries(metrics.enrolledGenderDistribution || {})
            .sort((a, b) => b[1] - a[1])
            .map(([g, n]) => [
              g,
              n,
              <BarraInforme
                valor={n}
                max={metrics.totalEnrolledActive || 1}
                color="#7c3aed"
                etiqueta={`${Math.round((n / (metrics.totalEnrolledActive || 1)) * 100)}%`}
              />,
            ])}
        />
        {metrics.cuidadores?.total > 0 && (
          <p className="informe-nota" style={{ marginTop: 10 }}>
            Personas cuidadoras: {metrics.cuidadores.total} postulantes ({metrics.cuidadores.mujeres} mujeres,{' '}
            {metrics.cuidadores.hombres} hombres); {metrics.cuidadores.elegidos} quedaron seleccionadas.
          </p>
        )}
      </SeccionInforme>

      <SeccionInforme
        cortar
        titulo="Asistencia por grupo"
        descripcion="Calculada solo sobre actividades ya realizadas y con registro. Una sesión que ya ocurrió pero cuya asistencia no se ha cargado no entra en el promedio."
      >
        <TablaInforme
          columnas={[
            { titulo: 'Grupo' },
            { titulo: 'Activos', alinear: 'center' },
            { titulo: 'Sesiones', alinear: 'center' },
            { titulo: '% sesiones', alinear: 'left', ancho: '22%' },
            { titulo: 'Cafés', alinear: 'center' },
            { titulo: '% cafés', alinear: 'left', ancho: '22%' },
          ]}
          filas={asistenciaGrupo.map((a) => [
            a.grupo === 'Activación' ? 'Activación' : `Ruta ${a.grupo}`,
            a.activos,
            a.sesiones,
            a.pctSesiones == null ? '—' : (
              <BarraInforme valor={a.pctSesiones} max={100} color={colorPct(a.pctSesiones)} etiqueta={`${a.pctSesiones}%`} />
            ),
            a.cafes,
            a.pctCafes == null ? '—' : (
              <BarraInforme valor={a.pctCafes} max={100} color={colorPct(a.pctCafes)} etiqueta={`${a.pctCafes}%`} />
            ),
          ])}
          vacio="Todavía no hay actividades realizadas con asistencia registrada."
        />
      </SeccionInforme>

      {formationProgress && (
        <SeccionInforme
          titulo="Avance en la plataforma de formación"
          descripcion={`Promedio de ${formationProgress.globalAvg}% entre ${formationProgress.active.length} participantes activos.`}
        >
          <TablaInforme
            columnas={[{ titulo: 'Rango de avance' }, { titulo: 'Personas', alinear: 'center' }, { titulo: '', alinear: 'left' }]}
            filas={Object.entries(formationProgress.distribution).map(([rango, n]) => [
              rango,
              n,
              <BarraInforme
                valor={n}
                max={formationProgress.active.length || 1}
                color="#0d9488"
                etiqueta={`${Math.round((n / (formationProgress.active.length || 1)) * 100)}%`}
              />,
            ])}
          />
        </SeccionInforme>
      )}

      {totalRetiros > 0 && (
        <SeccionInforme
          titulo="Retención"
          descripcion={`${totalRetiros} retiros con motivo registrado sobre ${sel.totalElegidos || 0} seleccionados (${(
            (totalRetiros / (sel.totalElegidos || 1)) * 100
          ).toFixed(1)}%). ${retiros.totalRiesgo || 0} personas están señaladas en riesgo de deserción.`}
        >
          <TablaInforme
            columnas={[{ titulo: 'Categoría' }, { titulo: 'Casos', alinear: 'center' }, { titulo: '', alinear: 'left' }]}
            filas={categorias.map(([cat, n]) => [
              cat,
              n,
              <BarraInforme valor={n} max={categorias[0][1]} color="#f43f5e" etiqueta={`${Math.round((n / totalRetiros) * 100)}%`} />,
            ])}
          />
        </SeccionInforme>
      )}

      {continuidadCirculos && (
        <SeccionInforme
          titulo="Ecosistema: continuidad en Círculos de Conocimiento"
          descripcion="La relación entre los dos programas no está marcada en ningún campo: se deriva cruzando a las mismas personas, así que se actualiza sola."
        >
          <CifrasInforme
            items={[
              { valor: continuidadCirculos.totalCirculos, label: 'En Círculos' },
              { valor: continuidadCirculos.deHS, label: 'Venían de Horizontes', detalle: `${continuidadCirculos.rechazados} no habían quedado seleccionados` },
              { valor: continuidadCirculos.nuevos, label: 'Llegaron directo' },
              { valor: activos + continuidadCirculos.totalCirculos, label: 'Total en formación', detalle: 'sumando los dos programas' },
            ]}
          />
        </SeccionInforme>
      )}

      <p className="informe-nota">
        {cohort?.name ? `Cohorte: ${cohort.name}. ` : ''}
        Fuente: base de datos del programa. Los porcentajes de asistencia usan el cálculo compartido del dashboard
        (solo actividades ocurridas y con registro), no promedios crudos.
      </p>
    </>
  );
}
