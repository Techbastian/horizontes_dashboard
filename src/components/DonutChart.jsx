import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <div className="label">{payload[0].name}</div>
        <div className="value">{payload[0].value} personas</div>
      </div>
    );
  }
  return null;
}

/**
 * DonutChartWidget
 * If `data` has a single key, it renders as a progress-ring with a "remaining" segment.
 * If `data` has multiple keys, it renders a standard multi-segment donut.
 * 
 * Props:
 *  - data: Object { label: value } 
 *  - color: string (accent color for single-segment mode)
 *  - colors: string[] (for multi-segment mode)
 *  - centerValue: string shown in center
 *  - centerLabel: string shown below
 *  - size: number (px)
 *  - total: number (for single-segment, how much is 100%)
 */
export default function DonutChartWidget({ data, color, colors, centerLabel, centerValue, size = 160, total }) {
  const entries = Object.entries(data);
  if (!entries.length) return null;

  const DEFAULT_COLORS = ['#7c3aed', '#0d9488', '#3b82f6', '#f97316', '#f43f5e', '#06b6d4', '#f59e0b', '#ec4899'];
  const colorPalette = colors || DEFAULT_COLORS;

  let chartData;
  let cellColors;

  if (entries.length === 1 && total) {
    // Single-value progress ring
    const [name, value] = entries[0];
    const remaining = Math.max(total - value, 0);
    chartData = [
      { name, value },
      { name: 'Restante', value: remaining },
    ];
    cellColors = [color || '#7c3aed', 'rgba(148, 163, 184, 0.08)'];
  } else if (entries.length === 1) {
    // Single value, show as full ring
    const [name, value] = entries[0];
    chartData = [
      { name, value },
      { name: ' ', value: value * 0.001 }, // Tiny invisible segment to make ring visible
    ];
    cellColors = [color || '#7c3aed', 'transparent'];
  } else {
    chartData = entries.map(([name, value]) => ({ name, value }));
    cellColors = chartData.map((_, i) => colorPalette[i % colorPalette.length]);
  }

  const innerRadius = size * 0.35;
  const outerRadius = size * 0.46;

  return (
    <div className="donut-item">
      <div style={{ position: 'relative', width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={entries.length > 1 ? 3 : 0}
              dataKey="value"
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              {chartData.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={cellColors[index]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue !== undefined && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#f1f5f9' }}>{centerValue}</div>
          </div>
        )}
      </div>
      {centerLabel && <div className="donut-label">{centerLabel}</div>}
    </div>
  );
}
