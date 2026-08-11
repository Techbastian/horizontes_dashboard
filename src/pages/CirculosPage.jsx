import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import KPICard from '../components/KPICard';
import HorizontalBarChart from '../components/HorizontalBarChart';
import ExportExcelModal from '../components/ExportExcelModal';
import { exportarCirculos, filtrarParticipantes } from '../lib/exportar';
import { nombreActividad } from '../lib/asistencia';

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

// Esta página es de CARACTERIZACIÓN: quiénes son los participantes. El
// seguimiento de asistencia (cómo van, a quién llamar) vive solo en /formacion
// — en Círculos no se hace un acompañamiento tan estricto como en Horizontes
// Senior, así que duplicarlo aquí sobraba. Se sigue leyendo `attendanceByCandidate`
// y `avancePlataforma` porque el export a Excel sí los incluye.
export default function CirculosPage({ circulos }) {
  const {
    cohorte, metricas, loading, error,
    participantes = [], attendanceByCandidate = {}, avancePlataforma,
    asistenciaSinCargar = [],
  } = circulos;

  // Hooks antes de cualquier return: durante la carga el componente sale
  // temprano y el número de hooks no puede cambiar entre renders.
  const [exportOpen, setExportOpen] = useState(false);

  const avancePorCandidato = useMemo(() => {
    const m = {};
    (avancePlataforma?.participants || []).forEach((p) => { m[p.candidateId] = p; });
    return m;
  }, [avancePlataforma]);

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
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setExportOpen(true)}>📊 Exportar Excel</button>
        </div>
      </div>

      {exportOpen && (
        <ExportExcelModal
          titulo="Exportar participantes de Círculos"
          descripcion="Caracterización completa del formulario de inscripción"
          campos={[
            {
              id: 'estado',
              label: 'Estado',
              tipo: 'radio',
              opciones: [
                { id: 'todos', label: 'Todos' },
                { id: 'activos', label: 'Solo activos' },
                { id: 'inactivos', label: 'Solo inactivos' },
              ],
            },
            {
              id: 'columnas',
              label: 'Qué incluir',
              ayuda: 'Sexo, escolaridad, municipio, comuna, barrio, estrato y jefatura de hogar van siempre.',
              tipo: 'checks',
              opciones: [
                { id: 'contacto', label: 'Correo' },
                { id: 'habilidades', label: 'Habilidades y power skills' },
                { id: 'asistencia', label: '% de asistencia a sesiones' },
                { id: 'plataforma', label: 'Avance en plataforma' },
                { id: 'todo', label: 'Todas las demás respuestas', hint: 'Cada campo del formulario que no tenga columna propia' },
              ],
            },
          ]}
          valoresIniciales={{ estado: 'todos', columnas: ['contacto', 'habilidades', 'asistencia'] }}
          resumen={(v) => {
            const n = filtrarParticipantes(participantes, { estado: v.estado }).length;
            return `${n} participante${n === 1 ? '' : 's'} en una hoja`;
          }}
          onClose={() => setExportOpen(false)}
          onExportar={(opciones) => exportarCirculos({
            participantes,
            asistencia: attendanceByCandidate || {},
            avancePorCandidato,
            opciones,
          })}
        />
      )}

      {/* Resumen */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPICard label="Participantes" value={m.total} icon="👥" index={0} />
        <KPICard label="Registrados en plataforma" value={m.registro.registrados} icon="🎓" change={m.total ? Math.round((m.registro.registrados / m.total) * 100) : 0} changeLabel="% del total" index={1} />
        <KPICard label="Mujeres" value={`${m.pctMujeres}%`} icon="👩" change={m.mujeres} changeLabel="personas" index={2} />
        <KPICard label="Edad promedio" value={m.edadPromedio ?? '—'} icon="🎂" change={m.edadMediana} changeLabel="mediana" index={3} />
      </div>

      {/* Registro en plataforma. Las tres situaciones se muestran por separado:
          "por verificar" no es lo mismo que "no registrada", y de esa distinción
          depende quién queda activo. */}
      {m.registro.registrados + m.registro.porVerificar + m.registro.noRegistrados > 0 && (
        <div className="card" style={{ marginTop: 16, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Registro en la plataforma de formación
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>{m.registro.registrados}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>Registradas · activas</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>confirmado por correo</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{m.registro.porVerificar}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>Por verificar</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>coinciden por nombre, con otro correo</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#94a3b8' }}>{m.registro.noRegistrados}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>Sin registro</div>
            </div>
            <div style={{ marginLeft: 'auto', maxWidth: 320, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
              Solo cuentan como activas las confirmadas. Al verificar los correos de las
              {' '}{m.registro.porVerificar} pendientes y volver a correr la carga, las que aparezcan
              vuelven a activas sin perder nada de su historial.
            </div>
          </div>
        </div>
      )}

      {asistenciaSinCargar.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: '3px solid var(--accent-amber)' }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {asistenciaSinCargar.length === 1 ? 'Hay una sesión sin asistencia cargada' : `Hay ${asistenciaSinCargar.length} sesiones sin asistencia cargada`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {asistenciaSinCargar.map((s) => nombreActividad(s)).join(' · ')} — ya
              {asistenciaSinCargar.length === 1 ? ' ocurrió' : ' ocurrieron'} pero no hay ningún registro, así que no
              {asistenciaSinCargar.length === 1 ? ' cuenta' : ' cuentan'} en los porcentajes. Tómala desde Eventos o carga el formulario.
            </div>
          </div>
        </div>
      )}

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
