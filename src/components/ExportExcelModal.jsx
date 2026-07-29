import { useState } from 'react';

// Modal de filtros previo a la descarga del Excel. Es genérico a propósito: las
// páginas le pasan qué se puede filtrar (`campos`) y él devuelve las opciones
// elegidas. Así /formacion y /circulos comparten el mismo diálogo aunque
// exporten cosas distintas.
//
// `campos`: [{ id, label, ayuda, tipo: 'checks' | 'radio', opciones: [{ id, label, hint }] }]
// `resumen(valores)` → texto que se recalcula en vivo, para que nadie descargue
// un archivo sin saber cuántas personas trae.

function Opcion({ tipo, marcado, onToggle, label, hint }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px',
        borderRadius: 'var(--radius-md)', cursor: 'pointer',
        background: marcado ? 'var(--accent-teal-dim, rgba(13,148,136,0.08))' : 'var(--bg-primary)',
        border: `1px solid ${marcado ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
        transition: 'all var(--transition-fast)',
      }}
    >
      <input
        type={tipo === 'radio' ? 'radio' : 'checkbox'}
        checked={marcado}
        onChange={onToggle}
        style={{ marginTop: 2, accentColor: 'var(--accent-teal)' }}
      />
      <span>
        <span style={{ fontSize: 13, fontWeight: marcado ? 600 : 500, color: 'var(--text-primary)' }}>{label}</span>
        {hint && (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</span>
        )}
      </span>
    </label>
  );
}

export default function ExportExcelModal({
  titulo = 'Exportar a Excel',
  descripcion,
  campos = [],
  valoresIniciales = {},
  resumen,
  onExportar,
  onClose,
}) {
  const [valores, setValores] = useState(valoresIniciales);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  const alternar = (campo, opcionId) => {
    setValores((v) => {
      if (campo.tipo === 'radio') return { ...v, [campo.id]: opcionId };
      const actual = v[campo.id] || [];
      return {
        ...v,
        [campo.id]: actual.includes(opcionId)
          ? actual.filter((x) => x !== opcionId)
          : [...actual, opcionId],
      };
    });
  };

  const marcado = (campo, opcionId) =>
    campo.tipo === 'radio'
      ? valores[campo.id] === opcionId
      : (valores[campo.id] || []).includes(opcionId);

  const texto = resumen ? resumen(valores) : null;

  const exportar = async () => {
    setGenerando(true);
    setError(null);
    try {
      await onExportar(valores);
      onClose();
    } catch (err) {
      console.error('No se pudo generar el Excel:', err);
      setError(err.message || 'No se pudo generar el archivo.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1150 }} onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-avatar" style={{ background: 'linear-gradient(135deg, #16a34a, #0d9488)' }}>📊</div>
            <div>
              <div className="modal-name">{titulo}</div>
              {descripcion && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{descripcion}</div>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {campos.map((campo) => (
            <div className="modal-section" key={campo.id}>
              <div className="modal-section-title">{campo.label}</div>
              {campo.ayuda && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -6, marginBottom: 10 }}>
                  {campo.ayuda}
                </div>
              )}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: campo.opciones.length > 3 ? '1fr 1fr' : '1fr' }}>
                {campo.opciones.map((o) => (
                  <Opcion
                    key={o.id}
                    tipo={campo.tipo}
                    marcado={marcado(campo, o.id)}
                    onToggle={() => alternar(campo, o.id)}
                    label={o.label}
                    hint={o.hint}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
            padding: '16px 28px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12.5, color: error ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
            {error || texto}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={generando}>Cancelar</button>
            <button className="btn btn-primary" onClick={exportar} disabled={generando}>
              {generando ? 'Generando…' : '⬇ Descargar Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
