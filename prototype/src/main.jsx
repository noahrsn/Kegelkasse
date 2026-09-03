import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { applyTheme, watchSystem } from './theme'
import { AuthProvider } from './context/AuthContext.jsx'
import { registerServiceWorker } from './lib/pwa.js'

// Theme früh anwenden (vor dem ersten Paint), dann System-Änderungen beobachten
applyTheme()
watchSystem()

// Macht die App installierbar (siehe lib/pwa.js) — der Service Worker selbst
// cached bewusst nichts.
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
