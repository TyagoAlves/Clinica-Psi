import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bootstrap } from './services/bootstrap';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root nao encontrado');
}

bootstrap().finally(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
