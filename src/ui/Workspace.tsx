import { useView } from '../store/view';
import { CalendarView } from './CalendarView';
import { DocsView } from './DocsView';
import { ExpensesView } from './ExpensesView';
import { TeamView } from './TeamView';
import { RemindersView } from './RemindersView';
import { Sidebar } from './Sidebar';
import { ItemMenu } from './ItemMenu';
import { ReminderDialog } from './ReminderDialog';
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
              : view === 'reminders' ? <RemindersView />
                : view === 'expenses' ? <ExpensesView />
                  : view === 'docs' ? <DocsView />
                    : <TeamView />}
        </main>
      </div>
      <TaskDialog />
      <ReminderDialog />
      <ItemMenu />
    </div>
  );
}
