import { useView } from '../store/view';
import { StartScreen } from '../ui/StartScreen';
import { Workspace } from '../ui/Workspace';

export function App() {
  const screen = useView((s) => s.screen);
  const toast = useView((s) => s.toast);
  return (
    <>
      {screen === 'start' ? <StartScreen /> : <Workspace />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
