import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Toaster from './components/Toaster';
import Landing from './pages/Landing';
import { useViewMode } from './lib/viewMode';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ConfirmEmail = lazy(() => import('./pages/ConfirmEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TenantManagement = lazy(() => import('./pages/TenantManagement'));
const TenantDetail = lazy(() => import('./pages/TenantDetail'));
const EventLogs = lazy(() => import('./pages/EventLogs'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Health = lazy(() => import('./pages/Health'));
const FailedJobs = lazy(() => import('./pages/FailedJobs'));
const Settings = lazy(() => import('./pages/Settings'));
const Support = lazy(() => import('./pages/Support'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SimpleOverview = lazy(() => import('./pages/simple/SimpleOverview'));
const SimpleTenant = lazy(() => import('./pages/simple/SimpleTenant'));

// Same route, different surface: the header toggle picks which one renders.
function ByView({ engineering, simple }: { engineering: ReactNode; simple: ReactNode }) {
    return <>{useViewMode() === 'simple' ? simple : engineering}</>;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster />
                <Suspense fallback={<div className="drafting min-h-screen" />}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/confirm-email" element={<ConfirmEmail />} />
                        <Route path="/about" element={<Landing />} />

                        <Route path="/" element={<ProtectedRoute />}>
                            <Route index element={<ByView engineering={<Dashboard />} simple={<SimpleOverview />} />} />
                            <Route path="tenants" element={<ByView engineering={<TenantManagement />} simple={<SimpleOverview />} />} />
                            <Route path="tenants/:id" element={<ByView engineering={<TenantDetail />} simple={<SimpleTenant />} />} />
                            <Route path="events" element={<EventLogs />} />
                            <Route path="pipeline" element={<Pipeline />} />
                            <Route path="health" element={<Health />} />
                            <Route path="failed-jobs" element={<FailedJobs />} />
                            <Route path="settings" element={<Settings />} />
                            <Route path="support" element={<Support />} />
                            <Route path="*" element={<NotFound />} />
                        </Route>
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
