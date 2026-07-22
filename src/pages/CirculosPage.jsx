import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import KPICard from '../components/KPICard';
import DonutChart from '../components/DonutChart';
import HorizontalBarChart from '../components/HorizontalBarChart';
import FormationProgressSection from '../components/FormationProgressSection';

const COLOR_MUJERES = '#ec4899';
const COLOR_HOMBRES = '#3b82f6';

function TooltipEdad({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="custom-tooltip">
      <div className="label">{label} años</div>
      {payload.map((p) => (
        <div className="value" key={p.dataKey} style={{ color: p.fill }}>
          {p.dataKey}: {p.value}
        </div>
      ))}
      <div className="value" style={{ opacity: 0.7 }}>Total: {total}</div>
    </div>
  );
}

export default function CirculosPage({ circulos }) {
  const { cohorte, metricas, avancePlataforma, loading, error } = circulos;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div className="loading-text">Cargando Círculos de Conocimiento...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <div className="error-title">No se pudo cargar</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!metricas) return null;

  const m = metricas;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Círculos de Conocimiento</h1>
          <p>
            Caracterización de los {m.total} participantes
            {cohorte?.name ? ` · ${cohorte.name}` : ''}
            {cohorte?.start_date ? ` · inicio ${cohorte.start_date}` : ''}
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPICard label="Participantes" value={m.total} icon="👥" index={0} />
        <KPICard label="Mujeres" value={`${m.pctMujeres}%`} icon="👩" change={m.mujeres} changeLabel="personas" index={1} />
        <KPICard label="Hombres" value={`${m.pctHombres}%`} icon="👨" change={m.hombres} changeLabel="personas" index={2} />
        <KPICard label="Edad promedio" value={m.edadPromedio ?? '—'} icon="🎂" change={m.edadMediana} changeLabel="mediana" index={3} />
      </div>

      {/* 1. Distribución por sexo */}
      <div className="charts-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Distribución por sexo</div>
              <div className="card-subtitle">Sobre el total de {m.total} participantes</div>
            </div>
          </div>
          <DonutChart
            data={m.genero}
            colors={[COLOR_MUJERES, COLOR_HOMBRES, '#94a3b8']}
            centerValue={`${m.pctMujeres}%`}
            centerLabel="mujeres"
            size={200}
          />
        </div>

        {/* 3. Nivel profesional */}
        <div className="card">
          <HorizontalBarChart
            data={Object.fromEntries(m.nivelProfesional.map((n) => [n.nombre, n.valor]))}
            title="Nivel profesional"
            subtitle={`${m.posgrado} personas con posgrado (especialización, maestría o doctorado)`}
            maxItems={10}
          />
        </div>
      </div>

      {/* 2. Edad cruzada con sexo */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Edad por sexo</div>
            <div className="card-subtitle">
              Rango etario cruzado con la identidad de género registrada. Mediana: {m.edadMediana} años.
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={m.edadPorGenero} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="rango" stroke="var(--text-muted)" fontSize={12} />
            <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
            <Tooltip content={<TooltipEdad />} cursor={{ fill: 'rgba(124,58,237,0.06)' }} />
            <Legend />
            <Bar dataKey="Mujeres" fill={COLOR_MUJERES} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Hombres" fill={COLOR_HOMBRES} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 5. Zonas de la ciudad */}
      <div className="charts-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <HorizontalBarChart
            data={Object.fromEntries(m.municipios.map((x) => [x.nombre, x.valor]))}
            title="Municipio de residencia"
            subtitle={`${m.municipios[0]?.valor ?? 0} de ${m.total} residen en ${m.municipios[0]?.nombre ?? '—'}`}
            maxItems={10}
          />
        </div>
        <div className="card">
          <HorizontalBarChart
            data={Object.fromEntries(m.comunas.map((x) => [x.nombre, x.valor]))}
            title="Comuna (residentes en Medellín)"
            subtitle={`Sobre ${m.comunas.reduce((s, c) => s + c.valor, 0)} participantes de Medellín. La comuna solo aplica a esta ciudad.`}
            maxItems={16}
          />
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <HorizontalBarChart
            data={Object.fromEntries(m.barrios.slice(0, 12).map((x) => [x.nombre, x.valor]))}
            title="Barrios más frecuentes"
            subtitle={`${m.barrios.length} barrios distintos registrados`}
            maxItems={12}
          />
        </div>
        <div className="card">
          <HorizontalBarChart
            data={Object.fromEntries(m.estrato.map((x) => [x.nombre, x.valor]))}
            title="Estrato socioeconómico"
            subtitle="Declarado en el formulario de inscripción"
            maxItems={6}
          />
        </div>
      </div>

      {/* 4. Jefatura de hogar (la métrica de cuidadores no se capturó — ver nota) */}
      <div className="charts-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <HorizontalBarChart
            data={m.cabezaHogar}
            title="Jefatura de hogar"
            subtitle={`${m.cabezaHogar['Sí'] || 0} de ${m.total} participantes sostienen su hogar`}
            maxItems={4}
          />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="card-title" style={{ fontSize: 15 }}>Cuidadores: pendiente de capturar</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
            El formulario de inscripción no preguntó por labores de cuidado, y las columnas
            <code style={{ fontSize: 12 }}> caregiving_responsibilities </code> y
            <code style={{ fontSize: 12 }}> has_dependents </code> están vacías para los {m.total}.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
            No se deduce de la jefatura de hogar: son cosas distintas. De las 9 personas que sí
            constan como cuidadoras, las 9 son cabeza de hogar, pero {m.cabezaHogar['Sí'] || 0}
            {' '}declararon jefatura — usar ese campo multiplicaría por 18 una cifra que hoy no
            está medida.
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', marginTop: 14, paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
          }}>
            Se resuelve preguntándolo en el registro de la próxima sesión sincrónica.
          </div>
        </div>
      </div>

      {avancePlataforma ? (
        <FormationProgressSection
          formationProgress={avancePlataforma}
          titulo="Avance en plataforma"
          subtitulo="Progreso individual por curso. Hover sobre la barra para ver el detalle."
          textoActivos="participantes activos"
          mostrarTrack={false}
        />
      ) : (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title" style={{ fontSize: 15 }}>Avance en plataforma: sin datos aún</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
            Esta sección se llena con el reporte de plataforma. Deja el archivo en
            <code style={{ fontSize: 12 }}> bases_de_datos/reporte circulos de conocimiento.xlsx </code>
            y se carga con un ETL, igual que se hace con Horizontes Senior.
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', marginTop: 14, paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
          }}>
            Los cursos de Círculos todavía no están dados de alta en el catálogo: se crean
            a partir del propio reporte en la primera carga.
          </div>
        </div>
      )}
    </div>
  );
}
