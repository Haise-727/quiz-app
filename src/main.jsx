import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PhotoProvider } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import './index.css';
import App from './App.jsx';
import { Toaster } from '@/components/ui/sonner';

import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PhotoProvider>
          <App />
          <Toaster position="top-right" richColors />
        </PhotoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
