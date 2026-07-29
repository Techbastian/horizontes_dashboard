import { SeccionInforme, CifrasInforme, TablaInforme, BarraInforme } from './InformeModal';
import { nombreActividad } from '../lib/asistencia';

// Informe de asistencia de un programa: promedios por grupo, cómo fue cada
// actividad y el detalle persona por persona. Recibe exactamente los mismos
// datos que FormationPage está pintando, así que no puede desviarse de lo que
// el equipo ve en pantalla.

const pctTexto = (v) => (v == null ? '—' : `${v}%`);
const colorPct = (p) => (p == null ? '#94a3b8' : p >= 75 ? '#10b981' : p >= 40 ? '#f97316' : '#ef4444');

const ddmm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '—');

export default function InformeAsistencia({
  programa,
  grupos = [],
  groupStats = {},
  groupAttendance = {},
  perfiles = [],
  asistencia = {},
  sinCargar = [],
  columnasExtra,
  etiquetaGrupo = (g) => g,
}) {
  const activos = perfiles.filter((p) => p.isActive);
  const conMedida = activos.map((p) => p.totalPonderado).filter((v) => v != null);
  const promedio = conMedida.length
    ? Math.round(conMedida.reduce((a, b) => a + b, 0) / conMedida.length)
    : null;

  const todasSesiones = grupos.flatMap((g) => groupAttendance[g]?.sesiones || []);
  const realizadas = todasSesiones.filter((s) => s.occurred).length;

  const tablaActividades = (items, tipo) => (
    <TablaInforme
      columnas={[
        { titulo: tipo === 'cafe' ? 'Café' : 'Sesión', ancho: '32%' },
        { titulo: 'Fecha', alinear: 'center', ancho: '12%' },
        { titulo: 'Asistieron', alinear: 'center', ancho: '14%' },
        { titulo: '% de asistencia', alinear: 'left' },
      ]}
      filas={(items || []).map((s) => [
        nombreActividad(s),
        ddmm(s.fecha),
        s.occurred ? `${s.asistieron} de ${s.total}` : 'Pendiente',
        s.occurred ? (
          <BarraInforme valor={s.pct} max={100} color={colorPct(s.pct)} etiqueta={`${s.pct}%`} />
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Aún no ocurre</span>
        ),
      ])}
      vacio="Este grupo todavía no tiene actividades en el calendario."
    />
  );

  return (
    <>
      <SeccionInforme
        titulo="Resumen"
        descripcion={`Los porcentajes se calculan solo sobre las actividades que ya ocurrieron y en las que la persona tiene registro. Un "—" significa que a esa persona todavía no se le ha medido nada, no que haya faltado.`}
      >
        <CifrasInforme
          items={[
            { valor: activos.length, label: 'Participantes activos' },
            { valor: perfiles.length - activos.length, label: 'Inactivos' },
            {
              valor: pctTexto(promedio),
              label: columnasExtra ? 'Promedio ponderado' : 'Promedio de asistencia',
              detalle: columnasExtra ? 'Sesiones 35% · cafés 40% · entregables 25%' : null,
            },
            { valor: `${realizadas}/${todasSesiones.length}`, label: 'Sesiones realizadas' },
          ]}
        />
      </SeccionInforme>

      <SeccionInforme titulo="Promedios por grupo">
        <TablaInforme
          columnas={[
            { titulo: 'Grupo' },
            { titulo: 'Activos', alinear: 'center' },
            { titulo: 'Inactivos', alinear: 'center' },
            { titulo: '% sesiones', alinear: 'center' },
            ...(columnasExtra ? [{ titulo: '% total', alinear: 'center' }] : []),
          ]}
          filas={grupos.map((g) => {
            const s = groupStats[g] || {};
            return [
              etiquetaGrupo(g),
              s.activos ?? 0,
              s.inactivos ?? 0,
              pctTexto(s.avgSesiones),
              ...(columnasExtra ? [pctTexto(s.avgTotal)] : []),
            ];
          })}
        />
      </SeccionInforme>

      {grupos.map((g) => (
        <SeccionInforme key={g} titulo={`Actividad por actividad · ${etiquetaGrupo(g)}`}>
          {tablaActividades(groupAttendance[g]?.sesiones, 'sesion')}
          {columnasExtra && (groupAttendance[g]?.cafes || []).length > 0 && (
            <div style={{ marginTop: 14 }}>{tablaActividades(groupAttendance[g]?.cafes, 'cafe')}</div>
          )}
        </SeccionInforme>
      ))}

      {grupos.map((g) => {
        const lista = perfiles
          .filter((p) => p.ruta === g)
          .sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return (b.totalPonderado ?? -1) - (a.totalPonderado ?? -1);
          });
        if (!lista.length) return null;
        return (
          <SeccionInforme
            key={g}
            cortar
            titulo={`Detalle por participante · ${etiquetaGrupo(g)}`}
            descripcion={`${lista.length} personas, ordenadas de mayor a menor asistencia. Los inactivos van al final.`}
          >
            <TablaInforme
              columnas={[
                { titulo: 'Participante', ancho: '34%' },
                { titulo: 'Documento', alinear: 'center' },
                { titulo: '% sesiones', alinear: 'center' },
                ...(columnasExtra
                  ? [
                      { titulo: '% cafés', alinear: 'center' },
                      { titulo: '% entregables', alinear: 'center' },
                    ]
                  : []),
                { titulo: 'Total', alinear: 'center' },
                { titulo: 'Estado', alinear: 'center' },
              ]}
              filas={lista.map((p) => {
                const att = asistencia[p.candidate_id];
                const asistio = (att?.sesiones || []).filter((i) => i.occurred && i.asistio === true).length;
                const medidas = (att?.sesiones || []).filter((i) => i.occurred && i.asistio !== null).length;
                return [
                  <span>
                    {p.fullName}
                    {medidas > 0 && (
                      <span style={{ color: '#94a3b8', fontSize: 10 }}> · {asistio}/{medidas} sesiones</span>
                    )}
                  </span>,
                  p.doc,
                  <span style={{ color: colorPct(p.pondSesiones), fontWeight: 700 }}>{pctTexto(p.pondSesiones)}</span>,
                  ...(columnasExtra
                    ? [pctTexto(p.pondCafes), pctTexto(p.pondEntregables)]
                    : []),
                  <span style={{ color: colorPct(p.totalPonderado), fontWeight: 700 }}>{pctTexto(p.totalPonderado)}</span>,
                  p.isActive ? 'Activo' : 'Inactivo',
                ];
              })}
            />
          </SeccionInforme>
        );
      })}

      {sinCargar.length > 0 && (
        <SeccionInforme
          titulo="Actividades sin asistencia cargada"
          descripcion="Ya ocurrieron pero no tienen ningún registro, así que no entran en los porcentajes de arriba."
        >
          <TablaInforme
            columnas={[{ titulo: 'Actividad' }, { titulo: 'Grupo', alinear: 'center' }, { titulo: 'Fecha', alinear: 'center' }]}
            filas={sinCargar.map((s) => [nombreActividad(s), s.grupo, ddmm(s.fecha)])}
          />
        </SeccionInforme>
      )}

      <p className="informe-nota">
        Programa: {programa}. Los porcentajes provienen del cálculo compartido de asistencia del dashboard
        (sesiones, cafés y entregables ocurridos), no del campo crudo de la matrícula.
      </p>
    </>
  );
}
