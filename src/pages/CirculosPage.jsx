import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

const GRUPO = 'Círculos'; // grupo único del programa

const colorPct = (p) => (p == null ? '#94a3b8' : p >= 75 ? '#10b981' : p >= 40 ? '#f97316' : '#ef4444');
const ddmm = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : '—');

export default function CirculosPage({ circulos }) {
  const {
    cohorte, metricas, loading, error,
    participantes = [], attendanceByCandidate = {}, avancePlataforma,
    groupAttendance = {}, asistenciaSinCargar = [],
  } = circulos;

  // Hooks antes de cualquier return: durante la carga el componente sale
  // temprano y el número de hooks no puede cambiar entre renders.
  const [exportOpen, setExportOpen] = useState(false);

  const avancePorCandidato = useMemo(() => {
    const m = {};
    (avancePlataforma?.participants || []).forEach((p) => { m[p.candidateId] = p; });
    return m;
  }, [avancePlataforma]);

  // Seguimiento del programa: cómo va la asistencia y a quién hay que llamar.
  // Se calcula sobre lo que ya devolvió el cálculo compartido de asistencia
  // (solo actividades ocurridas y con registro), no sobre las filas crudas.
  const seguimiento = useMemo(() => {
    const sesiones = groupAttendance[GRUPO]?.sesiones || [];
    const realizadas = sesiones.filter((s) => s.occurred);
    const acumulado = realizadas.reduce(
      (acc, s) => ({ a: acc.a + s.asistieron, t: acc.t + s.total }),
      { a: 0, t: 0 }
    );
    const promedio = acumulado.t ? Math.round((acumulado.a / acumulado.t) * 100) : null;

    const activos = participantes.filter((p) => p.activo);

    // Alerta = dos o más faltas seguidas, o menos de la mitad de asistencia.
    // Se miran solo las sesiones en las que a la persona SÍ se le midió: un
    // `null` es "no se registró", no una falta, y no puede disparar una alerta.
    const alertas = activos
      .map((p) => {
        const medidas = (attendanceByCandidate[p.candidateId]?.sesiones || [])
          .filter((i) => i.occurred && i.asistio !== null);
        let racha = 0;
        for (let i = medidas.length - 1; i >= 0; i--) {
          if (medidas[i].asistio === false) racha++;
          else break;
        }
        const fue = medidas.filter((i) => i.asistio === true).length;
        return {
          ...p,
          racha,
          medidas: medidas.length,
          fue,
          pct: medidas.length ? Math.round((fue / medidas.length) * 100) : null,
        };
      })
      .filter((x) => x.medidas > 0 && (x.racha >= 2 || (x.pct != null && x.pct < 50)))
      .sort((a, b) => b.racha - a.racha || (a.pct ?? 100) - (b.pct ?? 100));

    return { sesiones, realizadas, promedio, alertas, activos: activos.length };
  }, [groupAttendance, participantes, attendanceByCandidate]);

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

      {/* ── Seguimiento del programa ───────────────────────────────────────
          La caracterización dice QUIÉNES son; esto dice CÓMO VAN. Vive aquí y
          no solo en /formacion para que la página de Círculos se lea sola. */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Seguimiento del programa</div>
            <div className="card-subtitle">
              {seguimiento.realizadas.length} de {seguimiento.sesiones.length} sesiones realizadas
              {seguimiento.promedio != null && ` · ${seguimiento.promedio}% de asistencia acumulada`}
              {' '}· el detalle persona por persona está en Formación.
            </div>
          </div>
          <Link className="btn btn-secondary btn-sm" style={{ width: 'auto', padding: '6px 14px' }} to="/formacion">
            Ver formación →
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginTop: 8, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Asistencia acumulada</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: colorPct(seguimiento.promedio) }}>
              {seguimiento.promedio ?? '—'}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Sesiones realizadas</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a' }}>
              {seguimiento.realizadas.length}
              <span style={{ fontSize: 16, color: '#475569', fontWeight: 600 }}>/{seguimiento.sesiones.length}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Participantes activos</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a' }}>{seguimiento.activos}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Requieren seguimiento</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: seguimiento.alertas.length ? '#f59e0b' : '#10b981' }}>
              {seguimiento.alertas.length}
            </div>
          </div>
          {avancePlataforma && (
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Avance en plataforma</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: colorPct(avancePlataforma.globalAvg) }}>
                {avancePlataforma.globalAvg}%
              </div>
            </div>
          )}
        </div>

        {/* Asistencia sesión a sesión. Las que aún no ocurren van en gris y no
            entran en ningún promedio. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150, paddingTop: 8 }}>
          {seguimiento.sesiones.map((s, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.occurred ? colorPct(s.pct) : '#94a3b8' }}>
                {s.occurred ? `${s.pct}%` : '—'}
              </span>
              <div style={{ width: '100%', maxWidth: 54, background: '#e2e8f0', borderRadius: 6, height: '100%', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: s.occurred ? `${s.pct}%` : '6px', background: s.occurred ? colorPct(s.pct) : '#cbd5e1', borderRadius: 6, transition: 'height 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{ddmm(s.fecha)}</span>
              <span style={{ fontSize: 9.5, color: '#64748b' }}>{s.occurred ? `${s.asistieron}/${s.total}` : 'Pendiente'}</span>
            </div>
          ))}
          {!seguimiento.sesiones.length && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Todavía no hay sesiones en el calendario de Círculos.
            </div>
          )}
        </div>
      </div>

      {asistenciaSinCargar.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: '3px solid var(--accent-amber)' }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {asistenciaSinCargar.length === 1 ? 'Hay una sesión sin asistencia cargada' : `Hay ${asistenciaSinCargar.length} sesiones sin asistencia cargada`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {asistenciaSinCargar.map((s) => `${nombreActividad(s)} (${ddmm(s.fecha)})`).join(' · ')} — ya
              {asistenciaSinCargar.length === 1 ? ' ocurrió' : ' ocurrieron'} pero no hay ningún registro, así que no
              {asistenciaSinCargar.length === 1 ? ' cuenta' : ' cuentan'} en los porcentajes. Tómala desde Eventos o carga el formulario.
            </div>
          </div>
        </div>
      )}

      {seguimiento.alertas.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <div className="card-title">⚠️ Requieren seguimiento</div>
              <div className="card-subtitle">
                {seguimiento.alertas.length} personas activas con dos o más faltas seguidas, o menos de la mitad de asistencia.
                Solo se cuentan las sesiones en las que sí se les registró.
              </div>
            </div>
          </div>
          <div className="table-container" style={{ marginTop: 8, overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderSpacing: '10px 6px', minWidth: 620 }}>
              <thead>
                <tr>
                  {['Participante', 'Faltas seguidas', 'Asistencia', 'Sesiones medidas'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '12px 14px', background: 'rgba(148,163,184,0.08)', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seguimiento.alertas.slice(0, 20).map((a) => (
                  <tr key={a.candidateId}>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', borderRadius: 4 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.email}</div>
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                      <span style={{ fontWeight: 800, color: a.racha >= 2 ? '#ef4444' : '#64748b' }}>{a.racha}</span>
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4 }}>
                      <span style={{ fontWeight: 800, color: colorPct(a.pct) }}>{a.pct}%</span>
                    </td>
                    <td style={{ background: 'rgba(148,163,184,0.04)', padding: '14px', textAlign: 'center', borderRadius: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.fue} de {a.medidas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {seguimiento.alertas.length > 20 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              Se muestran las 20 más críticas de {seguimiento.alertas.length}. La lista completa sale en el Excel de Formación.
            </div>
          )}
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
