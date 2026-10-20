import { createRoot } from 'react-dom/client';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './markdown.css';
import './styles.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(<App />);
