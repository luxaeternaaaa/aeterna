import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmDialogProvider>
      <App />
    </ConfirmDialogProvider>
  </StrictMode>,
)

