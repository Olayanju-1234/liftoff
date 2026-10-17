import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Toaster from './components/Toaster';
import Landing from './pages/Landing';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ConfirmEmail = lazy(() => import('./pages/ConfirmEmail'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
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
const Customers = lazy(() => import('./pages/simple/Customers'));
const Customer = lazy(() => import('./pages/simple/Customer'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Docs = lazy(() => import('./pages/Docs'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));

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
                        <Route path="/verify-email" element={<VerifyEmail />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/about" element={<Landing />} />
                        <Route path="/pricing" element={<Pricing />} />
                        <Route path="/docs" element={<Docs />} />
                        <Route path="/terms" element={<Terms />} />
                        <Route path="/privacy" element={<Privacy />} />

                        <Route path="/" element={<ProtectedRoute />}>
                            <Route index element={<Customers />} />
                            <Route path="customers/:id" element={<Customer />} />
                            <Route path="under-the-hood" element={<Dashboard />} />
                            <Route path="tenants" element={<TenantManagement />} />
                            <Route path="tenants/:id" element={<TenantDetail />} />
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
