import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { ERP_DATE_LOCALE } from './utils/dateDisplay'

document.documentElement.lang = ERP_DATE_LOCALE

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
)
