import { useNavigate } from 'react-router-dom';

export default function FunnelChart({ data }) {
  const navigate = useNavigate();

  if (!data || !data.length) return null;

  const maxValue = data[0].value;

  const handleStepClick = (name) => {
    switch(name) {
      case 'Postulados':
        navigate('/candidatos');
        break;
      case 'Elegibles':
        navigate('/candidatos', { state: { filterElegibilidad: 'Elegible' } });
        break;
      case 'Evaluados':
        navigate('/candidatos', { state: { requireFase2: true } });
        break;
      case 'Entrevistados': // Depending on the raw metric name created in useApplicationsData
        navigate('/candidatos', { state: { requireFase3: true } });
        break;
      default:
        navigate('/candidatos');
    }
  };

  return (
    <div className="funnel-container">
      {data.map((step, i) => {
        const pct = maxValue > 0 ? (step.value / maxValue) * 100 : 0;
        const rate = i > 0 && data[i - 1].value > 0
          ? ((step.value / data[i - 1].value) * 100).toFixed(0)
          : '100';

        return (
          <div 
            className="funnel-step" 
            key={step.name} 
            onClick={() => handleStepClick(step.name)}
            title={`Ver detalles de ${step.name}`}
          >
            <div className="funnel-bar-wrapper">
              <div
                className="funnel-bar-fill"
                style={{
                  width: `${Math.max(pct, 15)}%`, // Ensure it never gets perfectly 0 for visibility
                  background: step.color,
                  zIndex: data.length - i, 
                }}
              >
                <div className="funnel-step-content">
                  <div className="funnel-step-left">
                    <span className="funnel-step-name">{step.name}</span>
                    <span className="funnel-step-count">({step.value})</span>
                  </div>
                  <span className="funnel-rate">{rate}%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
