import { useEffect, useRef } from 'react';

export default function KPICard({ label, value, icon, change, changeLabel, index = 0 }) {
  const valueRef = useRef(null);

  useEffect(() => {
    if (valueRef.current) {
      valueRef.current.style.animation = 'none';
      // Force reflow
      void valueRef.current.offsetHeight;
      valueRef.current.style.animation = `countUp 0.5s ease ${index * 0.1}s both`;
    }
  }, [value, index]);

  return (
    <div className="kpi-card">
      <div className="kpi-label">
        <span className="kpi-label-icon">{icon}</span>
        {label}
      </div>
      <div className="kpi-value" ref={valueRef}>
        {value}
      </div>
      {change !== undefined && (
        <div className={`kpi-change ${change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'}`}>
          {change > 0 ? '↗' : change < 0 ? '↘' : '—'} {change > 0 ? '+' : ''}{change}%
          {changeLabel && <span>{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
