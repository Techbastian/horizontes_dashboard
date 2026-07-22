import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import KPICard from '../components/KPICard';
import HorizontalBarChart from '../components/HorizontalBarChart';

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
  const { cohorte, metricas, loading, error } = circulos;

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

      {/* Nivel profesional. El donut de distribución por sexo se eliminó: los KPI
          de arriba ya dan mujeres/hombres en % y en personas. */}
      <div className="card" style={{ marginTop: 16 }}>
        <HorizontalBarChart
          data={Object.fromEntries(m.nivelProfesional.map((n) => [n.nombre, n.valor]))}
          title="Nivel profesional"
          subtitle={`${m.posgrado} personas con posgrado (especialización, maestría o doctorado)`}
          maxItems={10}
        />
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

      {/* Jefatura de hogar. La tarjeta de "Cuidadores: pendiente de capturar" se
          eliminó: explicaba un dato que no existe y se leía como una alerta.
          El hecho sigue en pie (el formulario no preguntó por labores de cuidado)
          y no debe deducirse de la jefatura de hogar, que es otra cosa. */}
      <div className="card" style={{ marginTop: 16 }}>
        <HorizontalBarChart
          data={m.cabezaHogar}
          title="Jefatura de hogar"
          subtitle={`${m.cabezaHogar['Sí'] || 0} de ${m.total} participantes sostienen su hogar`}
          maxItems={4}
        />
      </div>

      {/* El seguimiento formativo de Círculos vive en /formacion, con el selector
          de programa. Aquí no se duplica. */}
    </div>
  );
}
