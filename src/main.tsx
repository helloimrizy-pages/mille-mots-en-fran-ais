import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { FlashcardProvider } from './contexts/FlashcardContext';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <FlashcardProvider>
        <App />
      </FlashcardProvider>
    </PreferencesProvider>
  </StrictMode>,
);
