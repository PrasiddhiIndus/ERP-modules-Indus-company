import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { ERP_DATE_LOCALE } from './utils/dateDisplay'
import { clearChunkReloadMarker } from './lib/lazyWithRetry'

document.documentElement.lang = ERP_DATE_LOCALE

try {
  const url = new URL(window.location.href)
  if (url.searchParams.has('_v')) {
    url.searchParams.delete('_v')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
)

window.setTimeout(() => clearChunkReloadMarker(), 20_000)
