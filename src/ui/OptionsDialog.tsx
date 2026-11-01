import { useEffect } from 'react';
import { closeOptions, setTheme, THEMES, useTheme, type Theme } from '../store/theme';

/** Opciones de la app (⌘, / Ctrl+,): la apariencia, que se aplica al momento. */
export function OptionsDialog() {
  const { theme, optionsOpen } = useTheme();
  useEffect(() => {
    if (!optionsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopImmediatePropagation(); closeOptions(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [optionsOpen]);
  if (!optionsOpen) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) closeOptions(); }}>
      <div className="dialog options-dialog" role="dialog" aria-label="Opciones">
        <h3>Opciones</h3>
        <section>
          <h4>Apariencia</h4>
          <div className="theme-choices" role="radiogroup" aria-label="Apariencia">
            {THEMES.map((t) => (
              <button key={t.id} role="radio" aria-checked={theme === t.id} data-theme-choice={t.id}
                className={`theme-choice${theme === t.id ? ' on' : ''}`} onClick={() => setTheme(t.id)}>
                <ThemePreview theme={t.id} />
                <strong>{t.name}</strong>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
        </section>
        <div className="dialog-buttons">
          <button type="button" className="primary" onClick={closeOptions}>Listo</button>
        </div>
      </div>
    </div>
  );
}

/** Miniatura de la ventana: barra, panel lateral y el contenido con unas tareas. */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <span className={`theme-preview ${theme}`} aria-hidden>
      <span className="tp-bar" />
      <span className="tp-side" />
      <span className="tp-canvas">
        {[0, 1, 2].map((i) => <span key={i} className="tp-row" style={{ top: `${18 + i * 24}%`, background: ['#30d158', '#0a84ff', '#8e8e93'][i] }} />)}
      </span>
    </span>
  );
}
