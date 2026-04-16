export default function FunnelChart({ data }) {
  if (!data || !data.length) return null;

  const maxValue = data[0].value;

  return (
    <div className="funnel-container">
      {data.map((step, i) => {
        const pct = maxValue > 0 ? (step.value / maxValue) * 100 : 0;
        const rate = i > 0 && data[i - 1].value > 0
          ? ((step.value / data[i - 1].value) * 100).toFixed(0)
          : '100';

        return (
          <div className="funnel-step" key={step.name}>
            <div className="funnel-step-info">
              <div className="funnel-step-name">{step.name}</div>
              <div className="funnel-step-count">{step.value} personas</div>
            </div>
            <div className="funnel-bar-track">
              <div
                className="funnel-bar-fill"
                style={{
                  width: `${Math.max(pct, 8)}%`,
                  background: step.color,
                  transitionDelay: `${i * 0.15}s`,
                }}
              >
                {step.value}
              </div>
            </div>
            <div className="funnel-rate">{rate}%</div>
          </div>
        );
      })}
    </div>
  );
}
