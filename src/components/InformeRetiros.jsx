import { SeccionInforme, CifrasInforme, TablaInforme, BarraInforme } from './InformeModal';
import { SIN_CLASIFICAR, colorCategoria } from '../lib/retiros';

// Informe de retención y retiros. El vocabulario de categorías y sus colores
// viven en src/lib/retiros.js, compartidos con la página y con el ETL de PQRS.

const fmtFecha = (f) => {
  if (!f) return '—';
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return f;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const nivelCorto = (n) => (/senior/i.test(n || '') ? 'Senior' : /activ/i.test(n || '') ? 'Activación' : 'Junior');

export default function InformeRetiros({ retiros, metrics }) {
  const {
    casos = [], enRiesgo = [], porCategoria = {}, porNivel = {},
    total = 0, totalRiesgo = 0, sinClasificar = 0,
  } = retiros || {};

  const totalSeleccionados =
    metrics?.seleccionados?.totalElegidos ||
    (metrics?.seleccionados?.totalActivos != null ? metrics.seleccionados.totalActivos + total : total);
  const tasa = totalSeleccionados > 0 ? ((total / totalSeleccionados) * 100).toFixed(1) : '0';

  // "Sin clasificar" al final: no es una categoría del vocabulario, es lo que
  // falta por registrar.
  const categorias = Object.entries(porCategoria).sort((a, b) => {
    if ((a[0] === SIN_CLASIFICAR) !== (b[0] === SIN_CLASIFICAR)) return a[0] === SIN_CLASIFICAR ? 1 : -1;
    return b[1] - a[1];
  });
  const maxCat = categorias.length ? Math.max(...categorias.map(([, n]) => n)) : 1;

  return (
    <>
      <SeccionInforme
        titulo="Resumen"
        descripcion={`Se cuenta toda persona que salió del programa, tenga o no un motivo escrito. La tasa se calcula sobre el total de personas seleccionadas para el programa.${
          sinClasificar ? ` ${sinClasificar} de los ${total} casos siguen sin motivo registrado.` : ''
        }`}
      >
        <CifrasInforme
          items={[
            { valor: total, label: 'Personas que desertaron', detalle: `${total - sinClasificar} con motivo registrado` },
            { valor: `${tasa}%`, label: 'Tasa de deserción', detalle: `sobre ${totalSeleccionados} seleccionados` },
            { valor: totalRiesgo, label: 'En riesgo', detalle: 'deserción potencial' },
            {
              valor: `${porNivel.Junior || 0} · ${porNivel.Senior || 0}`,
              label: 'Junior · Senior',
              detalle: 'deserción por ruta',
            },
          ]}
        />
      </SeccionInforme>

      <SeccionInforme titulo="Motivos por categoría">
        <TablaInforme
          columnas={[
            { titulo: 'Categoría', ancho: '30%' },
            { titulo: 'Casos', alinear: 'center', ancho: '10%' },
            { titulo: 'Peso', alinear: 'left' },
          ]}
          filas={categorias.map(([cat, n]) => [
            cat,
            n,
            <BarraInforme
              valor={n}
              max={maxCat}
              color={colorCategoria(cat)}
              etiqueta={`${Math.round((n / total) * 100)}%`}
            />,
          ])}
          vacio="No hay deserciones registradas."
        />
      </SeccionInforme>

      <SeccionInforme
        cortar
        titulo="Personas que desertaron"
        descripcion={`${casos.length} personas. Cuando no hay motivo escrito se muestra la última excusa que dejó en una actividad, y la asistencia da el contexto.`}
      >
        <TablaInforme
          columnas={[
            { titulo: 'Persona', ancho: '20%' },
            { titulo: 'Ruta', alinear: 'center', ancho: '9%' },
            { titulo: 'Categoría', alinear: 'left', ancho: '16%' },
            { titulo: 'Asist.', alinear: 'center', ancho: '8%' },
            { titulo: 'Fecha', alinear: 'center', ancho: '11%' },
            { titulo: 'Motivo', alinear: 'left' },
          ]}
          filas={casos.map((c) => [
            c.nombre,
            nivelCorto(c.nivel),
            <span style={{ color: colorCategoria(c.categoria), fontWeight: 600 }}>{c.categoria}</span>,
            c.asistencia?.medidas ? `${c.asistencia.asistio}/${c.asistencia.medidas}` : '—',
            fmtFecha(c.fecha),
            <span style={{ fontSize: 10.5, color: '#475569' }}>
              {c.motivo || (c.asistencia?.ultimaExcusa
                ? `Última excusa: ${c.asistencia.ultimaExcusa.texto}`
                : 'Sin motivo registrado')}
            </span>,
          ])}
          vacio="No hay casos registrados."
        />
      </SeccionInforme>

      {enRiesgo.length > 0 && (
        <SeccionInforme
          cortar
          titulo="En riesgo de deserción"
          descripcion="Personas que expresaron intención de retirarse. Las marcadas como «ya retirado» terminaron saliendo; el resto sigue activo y es donde vale la pena intervenir."
        >
          <TablaInforme
            columnas={[
              { titulo: 'Persona', ancho: '22%' },
              { titulo: 'Ruta', alinear: 'center', ancho: '10%' },
              { titulo: 'Estado', alinear: 'center', ancho: '14%' },
              { titulo: 'Situación', alinear: 'left' },
            ]}
            filas={enRiesgo.map((r) => [
              r.nombre,
              r.ruta || '—',
              <span style={{ color: r.yaRetirado ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                {r.yaRetirado ? 'Ya retirado' : 'Activo'}
              </span>,
              <span style={{ fontSize: 10.5, color: '#475569' }}>{r.situacion}</span>,
            ])}
          />
        </SeccionInforme>
      )}
    </>
  );
}
