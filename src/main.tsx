import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { clearChunkReloadMarker } from './lib/lazyWithRetry'

// Drop temporary deploy-refresh query param from the address bar.
try {
  const url = new URL(window.location.href)
  if (url.searchParams.has('_v')) {
    url.searchParams.delete('_v')
    const clean = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', clean)
  }
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Healthy boot — allow a future deploy to auto-refresh again.
window.setTimeout(() => clearChunkReloadMarker(), 20_000)
