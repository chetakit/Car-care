import { useEffect, useState } from 'react'
import AdminApp from './Admin/AdminApp.jsx'

function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function MainFrontendPlaceholder() {
  return (
    <main>
      <h1>Car Care</h1>
      <p>The main frontend will appear here.</p>
    </main>
  )
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    function syncPathname() {
      setPathname(window.location.pathname)
    }

    window.addEventListener('popstate', syncPathname)
    return () => window.removeEventListener('popstate', syncPathname)
  }, [])

  return isAdminPath(pathname) ? <AdminApp /> : <MainFrontendPlaceholder />
}

export default App
