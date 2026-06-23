import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { applyTheme, watchSystem } from './theme'
import { AuthProvider } from './context/AuthContext.jsx'

// Theme früh anwenden (vor dem ersten Paint), dann System-Änderungen beobachten
applyTheme()
watchSystem()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
