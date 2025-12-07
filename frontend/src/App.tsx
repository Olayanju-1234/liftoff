import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import TenantManagement from './pages/TenantManagement';
import EventLogs from './pages/EventLogs';
import Pipeline from './pages/Pipeline';
import Health from './pages/Health';
import FailedJobs from './pages/FailedJobs';
import Settings from './pages/Settings';
import Support from './pages/Support';
import Toaster from './components/Toaster';

function App() {
  return (
    <>
      <Toaster />
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="tenants" element={<TenantManagement />} />
            <Route path="events" element={<EventLogs />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="health" element={<Health />} />
            <Route path="jobs" element={<FailedJobs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="support" element={<Support />} />
          </Route>
        </Routes>
      </Router>
    </>
  );
}

export default App;

