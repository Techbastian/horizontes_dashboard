import { createPortal } from 'react-dom';

// ============================================================================
// Vista previa de informe + impresión a PDF.
//
// No se usa ninguna librería de PDF: el informe se arma como HTML y se manda a
// la impresora del navegador ("Guardar como PDF"). El texto sale vectorial y
// nítido, no hay 800 kB extra en el bundle, y —lo importante— lo que se ve en
// la vista previa ES lo que se imprime: el mismo nodo del DOM.
//
// Va con createPortal a <body> a propósito: la hoja de impresión oculta a los
// hermanos del informe (`body > *:not(.informe-print-root)`), y desde dentro
// del árbol de la app cualquier contenedor con overflow recortaría las páginas.
//
// Los informes se construyen con tablas y barras de CSS, no con Recharts: un
// <svg> con ResponsiveContainer depende del ancho medido en pantalla y en
// impresión se colapsa. Ver las piezas exportadas al final del archivo.
// ============================================================================

export default function InformeModal({ titulo, subtitulo, onClose, children }) {
  const imprimir = () => window.print();

  return createPortal(
    <div className="modal-overlay informe-print-root" style={{ zIndex: 1150 }} onClick={onClose}>
      <div
        className="informe-marco"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 860 }}
      >
        {/* Barra de acciones: no se imprime. */}
        <div
          className="no-imprimir"
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
            padding: '14px 20px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)', marginBottom: 16, position: 'sticky', top: 0, zIndex: 2,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Vista previa del informe</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Revisa el contenido y usa «Imprimir / Guardar PDF»; en el diálogo elige «Guardar como PDF» como destino.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={imprimir}>🖨 Imprimir / Guardar PDF</button>
          </div>
        </div>

        {/* La hoja. Es el único nodo que llega al papel. */}
        <div className="informe-hoja">
          <header className="informe-encabezado">
            <div>
              <div className="informe-titulo">{titulo}</div>
              {subtitulo && <div className="informe-subtitulo">{subtitulo}</div>}
            </div>
            <div className="informe-marca">
              {/* El logo vive en public/ (no en src/assets) para que la ruta sea
                  estable y el navegador lo tenga cacheado al imprimir: una
                  imagen que se pide en el momento del print puede no alcanzar a
                  cargar. Es el recorte de img/Logo disruptia_BN_sinfondo.png,
                  que en el original ocupa un cuarto de un lienzo cuadrado. */}
              <img className="informe-logo" src="/logo-disruptia.png" alt="Disruptia" />
              <div style={{ fontWeight: 700 }}>Horizontes Senior</div>
              <div>Fundación Saldarriaga Concha · Ruta N · Alcaldía de Medellín</div>
            </div>
          </header>

          {children}

          <footer className="informe-pie">
            Generado desde el dashboard del programa · {new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Piezas reutilizables de los informes ───────────────────────────────────

export function SeccionInforme({ titulo, descripcion, children, cortar = false }) {
  return (
    <section className={`informe-seccion${cortar ? ' informe-salto' : ''}`}>
      <h2>{titulo}</h2>
      {descripcion && <p className="informe-nota">{descripcion}</p>}
      {children}
    </section>
  );
}

// Fila de cifras grandes. `valor` ya viene formateado por quien la usa.
export function CifrasInforme({ items }) {
  return (
    <div className="informe-cifras">
      {items.map((it) => (
        <div key={it.label}>
          <div className="informe-cifra">{it.valor}</div>
          <div className="informe-cifra-label">{it.label}</div>
          {it.detalle && <div className="informe-cifra-detalle">{it.detalle}</div>}
        </div>
      ))}
    </div>
  );
}

export function TablaInforme({ columnas, filas, vacio = 'Sin datos.' }) {
  if (!filas.length) return <p className="informe-nota">{vacio}</p>;
  return (
    <table className="informe-tabla">
      <thead>
        <tr>
          {columnas.map((c, i) => (
            <th key={i} style={{ textAlign: c.alinear || (i === 0 ? 'left' : 'right'), width: c.ancho }}>
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((celda, j) => (
              <td key={j} style={{ textAlign: columnas[j]?.alinear || (j === 0 ? 'left' : 'right') }}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Barra horizontal en CSS puro: se imprime igual que se ve, sin SVG.
// `-webkit-print-color-adjust: exact` (en index.css) es lo que evita que el
// navegador se coma los fondos al imprimir.
export function BarraInforme({ valor, max, color = '#0d9488', etiqueta }) {
  const ancho = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="informe-barra-fila">
      <div className="informe-barra-pista">
        <div className="informe-barra-valor" style={{ width: `${ancho}%`, background: color }} />
      </div>
      {etiqueta != null && <span className="informe-barra-etiqueta">{etiqueta}</span>}
    </div>
  );
}
