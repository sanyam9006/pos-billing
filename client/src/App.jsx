import { useState } from 'react'
import Login from './pages/Login'
import Billing from './pages/Billing'

function App() {
  const [cashier, setCashier] = useState(null)

  if (!cashier) {
    return <Login onLogin={setCashier} />
  }

  return <Billing cashier={cashier} onLogout={() => setCashier(null)} />
}

export default App
