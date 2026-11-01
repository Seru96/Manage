import type { ViewId } from '../store/view';
import { Icon, type IconName } from './icons';

const INFO: Partial<Record<ViewId, { title: string; icon: IconName; text: string; bullets: string[] }>> = {
  notes: {
    title: 'Anotaciones', icon: 'notes',
    text: 'Feedback de clientes y Project Managers, organizado por subdivisión.',
    bullets: ['Una lista por subdivisión, con autor, origen (cliente, PM, interna) y fecha', 'Buscar en todas las anotaciones', 'Convertir una anotación en tarea'],
  },
  reminders: {
    title: 'Recordatorios', icon: 'bell',
    text: 'Avisos para pruebas con clientes e hitos importantes, con notificaciones nativas del sistema.',
    bullets: ['Fecha y hora, tipo (prueba, hito) y subdivisión o tarea relacionada', 'Notificación de Windows / macOS a la hora indicada', 'Aviso también al abrir el proyecto si alguno venció'],
  },
  access: {
    title: 'Accesos a sitios', icon: 'badge',
    text: 'Tabla del personal con acceso a cada sitio.',
    bullets: ['Nombre, apellidos, DNI, matrícula… y columnas propias editables', 'Una casilla por subdivisión (sitio) para marcar el acceso', 'Filtrar por sitio y exportar a Excel'],
  },
};

/** Vistas de la fase 2: el modelo de datos ya las contempla (ver docs/ARQUITECTURA.md). */
export function Placeholder({ view }: { view: ViewId }) {
  const info = INFO[view];
  if (!info) return null;
  return (
    <div className="view placeholder">
      <div className="view-head"><h1>{info.title}</h1></div>
      <div className="placeholder-card">
        <Icon name={info.icon} size={36} />
        <p>{info.text}</p>
        <ul>{info.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
        <p className="muted">Próximamente: el formato del proyecto ya guarda estos datos.</p>
      </div>
    </div>
  );
}
