import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are declared by index.html (src/styles/fonts.css) so the browser finds
// them before it parses this bundle. Newsreader is loaded roman only: the
// italic cut is 147 KB and was used for six small asides, which now speak in
// mono — the system's voice — so a page costs half the font bytes it did.
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
