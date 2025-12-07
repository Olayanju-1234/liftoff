import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Toaster from './components/Toaster';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import TenantManagement from './pages/TenantManagement';
import EventLogs from './pages/EventLogs';
import Pipeline from './pages/Pipeline';
import Health from './pages/Health';
import FailedJobs from './pages/FailedJobs';
import Settings from './pages/Settings';
import Support from './pages/Support';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/tenants" element={<TenantManagement />} />
                    <Route path="/events" element={<EventLogs />} />
                    <Route path="/pipeline" element={<Pipeline />} />
                    <Route path="/health" element={<Health />} />
                    <Route path="/failed-jobs" element={<FailedJobs />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/support" element={<Support />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
