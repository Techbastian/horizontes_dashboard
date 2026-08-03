import { useNavigate } from 'react-router-dom';
import { conTasas } from '../lib/funnel';

export default function FunnelChart({ data }) {
  const navigate = useNavigate();

  if (!data || !data.length) return null;

  // La tasa de cada paso se deriva en src/lib/funnel.js, compartida con el
  // informe en PDF para que los dos digan lo mismo.
  const pasos = conTasas(data);
  const maxValue = pasos[0].value;

  const handleStepClick = (name) => {
    switch(name) {
      case 'Postulados':
        navigate('/candidatos');
        break;
      case 'Elegibles':
        navigate('/candidatos', { state: { filterElegibilidad: 'Elegible' } });
        break;
      case 'Senior':
        navigate('/candidatos', { state: { filterNivel: 'Senior' } });
        break;
      case 'Junior':
        navigate('/formacion');
        break;
      default:
        navigate('/candidatos');
    }
  };

  return (
    <div className="funnel-container">
      {pasos.map((step, i) => {
        const pct = maxValue > 0 ? (step.value / maxValue) * 100 : 0;

        return (
          <div 
            className="funnel-step-row" 
            key={step.name} 
            onClick={() => handleStepClick(step.name)}
            title={`Ver detalles de ${step.name}`}
          >
            <div className="funnel-step-titles">
              <span className="funnel-step-name">{step.label || step.name}</span>
              <span className="funnel-step-count">{step.value} personas</span>
            </div>
            
            <div className="funnel-bar-center-container">
              <div
                className="funnel-bar-fill"
                style={{
                  width: `${Math.max(pct, 12)}%`, // Ensure visibility even for extreme small % 
                  background: step.color,
                  zIndex: pasos.length - i,
                }}
              >
                <span className="funnel-rate">{step.tasa}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
