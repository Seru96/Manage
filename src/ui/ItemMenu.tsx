import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { deleteReminder, deleteTask, duplicateTask, moveItem } from '../app/items';
import { STATUS, type TaskStatus } from '../core/model';
import { patch, useProject } from '../store/project';
import { useSubdivisions } from '../store/selectors';
import { closeMenu, editReminder, editTask, useView } from '../store/view';

/** Menú contextual (clic derecho) de una tarea o un recordatorio, igual en todas las vistas. */
export function ItemMenu() {
  const menu = useView((s) => s.menu);
  const task = useProject((s) => (menu?.kind === 'task' ? s.entities.task[menu.id] : undefined));
  const reminder = useProject((s) => (menu?.kind === 'reminder' ? s.entities.reminder[menu.id] : undefined));
  const subs = useSubdivisions();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, innerWidth - r.width - 8), y: Math.min(menu.y, innerHeight - r.height - 8) });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) closeMenu(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', closeMenu);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); window.removeEventListener('blur', closeMenu); };
  }, [menu]);

  if (!menu || (!task && !reminder)) return null;
  const run = (fn: () => void) => () => { closeMenu(); fn(); };
  const current = task?.subdivisionId ?? reminder?.subdivisionId ?? null;

  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: pos.x, top: pos.y }} data-menu={menu.kind}>
      <button role="menuitem" onClick={run(() => (task ? editTask(task.id) : editReminder(reminder!.id)))}>Editar…</button>
      {task && (
        <>
          <hr />
          <span className="menu-label">Estado</span>
          {(Object.keys(STATUS) as TaskStatus[]).map((k) => (
            <button key={k} role="menuitemradio" aria-checked={task.status === k} className={`st-item ${k}`} onClick={run(() => patch('task', task.id, { status: k }))}>
              <span className={`st-dot ${k}`} />{STATUS[k]}{task.status === k ? ' ✓' : ''}
            </button>
          ))}
        </>
      )}
      <hr />
      <span className="menu-label">Mover a</span>
      {subs.map((s) => (
        <button key={s.id} role="menuitem" disabled={s.id === current} onClick={run(() => moveItem(menu.kind, menu.id, s.id))}>
          <span className="swatch" style={{ background: s.color }} />{s.name}
        </button>
      ))}
      <hr />
      {task && <button role="menuitem" onClick={run(() => duplicateTask(task.id))}>Duplicar</button>}
      <button role="menuitem" className="danger" onClick={run(() => void (task ? deleteTask(task.id) : deleteReminder(reminder!.id)))}>Borrar</button>
    </div>
  );
}
