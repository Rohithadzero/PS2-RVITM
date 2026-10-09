import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './campaign/campaign.css';
import './campaign/theme.css';
import App from './App.jsx';
import { StoreProvider } from './state/store';
import { AuthProvider } from './lib/auth';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
  </StrictMode>
);
