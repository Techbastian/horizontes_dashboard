import { Component } from 'react';

// Sin esto, cualquier excepción durante el render deja la pantalla EN BLANCO, sin
// ningún mensaje: React desmonta todo el árbol. Ya pasó con una variable que no
// existía en FormationPage, y desde fuera era indistinguible de "la app no carga".
//
// Tiene que ser una clase: los hooks no pueden capturar errores de render.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Queda en la consola del navegador para poder diagnosticarlo.
    console.error('Error de render capturado:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-container" style={{ minHeight: '60vh' }}>
        <div className="error-icon">⚠️</div>
        <div className="error-title">Esta sección no se pudo mostrar</div>
        <div className="error-message" style={{ maxWidth: 560 }}>
          Hubo un fallo al dibujar la página. Los datos están a salvo: es un problema
          de la interfaz, no de la base de datos.
        </div>
        <details style={{ marginTop: 16, maxWidth: 560, width: '100%' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
            Detalle técnico
          </summary>
          <pre style={{
            marginTop: 10, padding: 12, borderRadius: 8, overflowX: 'auto',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
            fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
          }}>
            {String(error?.message || error)}
          </pre>
        </details>
        <button
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          onClick={() => window.location.reload()}
        >
          🔄 Recargar
        </button>
      </div>
    );
  }
}
