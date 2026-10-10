import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PhotoProvider } from 'react-photo-view';
import { MotionConfig } from 'framer-motion';
import 'react-photo-view/dist/react-photo-view.css';
// Self hosted fonts: Geist for the interface, Instrument Serif for display lines, Geist Mono for numbers.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif';
import './index.css';
import App from './App.jsx';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProgressProvider } from './contexts/ProgressContext';
import { Toaster } from '@/components/ui/sonner';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ProgressProvider>
            {/* reducedMotion="user": people who ask their system for less motion get fades instead of movement. */}
            <MotionConfig reducedMotion="user">
              <PhotoProvider>
                <App />
                <Toaster position="top-right" />
              </PhotoProvider>
            </MotionConfig>
          </ProgressProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
