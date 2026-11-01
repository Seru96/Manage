import { useView } from '../store/view';
import { CalendarView } from './CalendarView';
import { AccessView } from './AccessView';
import { NotesView } from './NotesView';
import { RemindersView } from './RemindersView';
import { Sidebar } from './Sidebar';
import { TaskDialog } from './TaskDialog';
import { TasksView } from './TasksView';
import { Toolbar } from './Toolbar';

/** Espacio de trabajo de un proyecto: barra superior, panel de vistas y la vista elegida. */
export function Workspace() {
  const view = useView((s) => s.view);
  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <Sidebar />
        <main className="main">
          {view === 'tasks' ? <TasksView />
            : view === 'calendar' ? <CalendarView />
              : view === 'notes' ? <NotesView />
                : view === 'reminders' ? <RemindersView />
                  : <AccessView />}
        </main>
      </div>
      <TaskDialog />
    </div>
  );
}
