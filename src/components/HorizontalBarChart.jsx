const BAR_COLORS = [
  '#0d9488', '#7c3aed', '#3b82f6', '#f97316', '#f43f5e',
  '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#64748b',
];

export default function HorizontalBarChart({ data, title, subtitle, maxItems = 10 }) {
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);

  const maxValue = entries.length > 0 ? entries[0][1] : 1;

  return (
    <div>
      {title && (
        <div className="card-header">
          <div>
            <div className="card-title">{title}</div>
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
        </div>
      )}
      <div className="hbar-container">
        {entries.map(([label, value], i) => {
          const pct = (value / maxValue) * 100;
          return (
            <div className="hbar-item" key={label}>
              <div className="hbar-label" title={label}>{label}</div>
              <div className="hbar-track">
                <div
                  className="hbar-fill"
                  style={{
                    width: `${Math.max(pct, 5)}%`,
                    background: BAR_COLORS[i % BAR_COLORS.length],
                    transitionDelay: `${i * 0.05}s`,
                  }}
                >
                  {pct > 15 ? `${((value / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(0)}%` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
