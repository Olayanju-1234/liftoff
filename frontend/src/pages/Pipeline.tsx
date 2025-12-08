import { useEffect, useState } from 'react';
import { getTenants, getTenantEvents, cancelTenant } from '../lib/api';
import type { Tenant, EventLog } from '../lib/types';
import { Database, Globe, Key, CreditCard, Bell, CheckCircle, Clock, AlertCircle, Loader2, FileText, XCircle, Ban } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import PayloadModal from '../components/PayloadModal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Pipeline() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTenantEvents, setSelectedTenantEvents] = useState<EventLog[]>([]);
    const [selectedTenantName, setSelectedTenantName] = useState('');
    const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
    const [cancellingTenant, setCancellingTenant] = useState<Tenant | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        try {
            const data = await getTenants();
            // Show tenants that are provisioning, cancelled, failed or were recently created
            const pipelineTenants = data.filter((t: Tenant) =>
                t.status === 'PROVISIONING' || t.status === 'FAILED' || t.status === 'CANCELLED' ||
                (new Date().getTime() - new Date(t.createdAt).getTime() < 24 * 60 * 60 * 1000) // Last 24 hours
            );
            setTenants(pipelineTenants);
        } catch (error) {
            console.error('Failed to fetch tenants', error);
            toast.error('Failed to load pipeline data');
        } finally {
            setLoading(false);
        }
    };

    const handleViewLogs = async (tenant: Tenant) => {
        try {
            const events = await getTenantEvents(tenant.id);
            setSelectedTenantEvents(events);
            setSelectedTenantName(tenant.name);
            setIsEventsModalOpen(true);
        } catch (error) {
            toast.error('Failed to load events');
        }
    };

    const handleCancelClick = (tenant: Tenant) => {
        setCancellingTenant(tenant);
    };

    const handleCancelConfirm = async () => {
        if (!cancellingTenant) return;

        setIsCancelling(true);
        try {
            await cancelTenant(cancellingTenant.id, 'Cancelled by user');
            toast.success(`Pipeline for ${cancellingTenant.name} has been cancelled`);
            fetchTenants(); // Refresh the list
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to cancel pipeline');
        } finally {
            setIsCancelling(false);
            setCancellingTenant(null);
        }
    };

    const getStepIcon = (status: string) => {
        switch (status) {
            case 'SUCCESS': return <CheckCircle size={20} className="text-green-500" />;
            case 'IN_PROGRESS': return <Loader2 size={20} className="text-blue-500 animate-spin" />;
            case 'FAILED': return <AlertCircle size={20} className="text-red-500" />;
            case 'CANCELLED': return <XCircle size={20} className="text-amber-500" />;
            default: return <Clock size={20} className="text-gray-500" />;
        }
    };

    const getStepBg = (status: string) => {
        switch (status) {
            case 'SUCCESS': return 'bg-green-500/10 border-green-500/20';
            case 'IN_PROGRESS': return 'bg-blue-500/10 border-blue-500/20';
            case 'FAILED': return 'bg-red-500/10 border-red-500/20';
            case 'CANCELLED': return 'bg-amber-500/10 border-amber-500/20';
            default: return 'bg-muted border-border';
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'bg-green-500/10 text-green-500';
            case 'PROVISIONING': return 'bg-blue-500/10 text-blue-500';
            case 'FAILED': return 'bg-red-500/10 text-red-500';
            case 'CANCELLED': return 'bg-amber-500/10 text-amber-500';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    };

    const steps = [
        { key: 'dbStatus' as const, name: 'Database', icon: Database },
        { key: 'dnsStatus' as const, name: 'DNS', icon: Globe },
        { key: 'credentialsStatus' as const, name: 'Credentials', icon: Key },
        { key: 'billingStatus' as const, name: 'Billing', icon: CreditCard },
        { key: 'notificationStatus' as const, name: 'Notification', icon: Bell },
    ];

    return (
        <div className="space-y-6">
            <PayloadModal
                isOpen={isEventsModalOpen}
                title={`Pipeline Events - ${selectedTenantName}`}
                payload={selectedTenantEvents.length > 0 ? {
                    events: selectedTenantEvents.map(e => ({
                        type: e.eventType,
                        status: e.status,
                        timestamp: e.timestamp,
                        payload: e.payload,
                    }))
                } : null}
                onClose={() => setIsEventsModalOpen(false)}
            />

            <ConfirmDialog
                isOpen={!!cancellingTenant}
                title="Cancel Pipeline"
                message={`Are you sure you want to cancel the provisioning pipeline for "${cancellingTenant?.name}"? This action will stop all pending provisioning steps and cannot be undone.`}
                confirmLabel={isCancelling ? 'Cancelling...' : 'Cancel Pipeline'}
                variant="danger"
                onConfirm={handleCancelConfirm}
                onCancel={() => setCancellingTenant(null)}
                loading={isCancelling}
            />

            <div>
                <h2 className="text-3xl font-bold tracking-tight">Provisioning Pipelines</h2>
                <p className="text-muted-foreground mt-2">
                    Track the provisioning progress of your tenants through each stage of the pipeline.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-muted-foreground" />
                </div>
            ) : tenants.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
                        <Database size={32} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Active Pipelines</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        There are no tenants currently being provisioned. Create a new tenant to see the pipeline in action.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tenants.map((tenant) => (
                        <div key={tenant.id} className="bg-card border border-border rounded-xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-semibold">{tenant.name}</h3>
                                    <p className="text-sm text-muted-foreground">{tenant.subdomain}.saas.com</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusBadge(tenant.status)}`}>
                                        {tenant.status}
                                    </span>
                                    {tenant.status === 'PROVISIONING' && (
                                        <button
                                            onClick={() => handleCancelClick(tenant)}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-amber-500/30 text-amber-500 rounded-md hover:bg-amber-500/10 transition-colors"
                                        >
                                            <Ban size={14} />
                                            Cancel
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleViewLogs(tenant)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                                    >
                                        <FileText size={14} />
                                        View Logs
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                {steps.map((step, index) => (
                                    <div key={step.key} className="flex items-center flex-1">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`p-3 rounded-lg border ${getStepBg(tenant[step.key])}`}>
                                                <step.icon size={24} className="text-foreground" />
                                            </div>
                                            <span className="text-sm font-medium">{step.name}</span>
                                            <div className="flex items-center gap-1">
                                                {getStepIcon(tenant[step.key])}
                                                <span className="text-xs text-muted-foreground capitalize">
                                                    {tenant[step.key].toLowerCase().replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                        {index < steps.length - 1 && (
                                            <div className={`flex-1 h-0.5 mx-4 ${tenant[step.key] === 'CANCELLED' || tenant[steps[index + 1].key] === 'CANCELLED' ? 'bg-amber-500/30' :
                                                tenant[steps[index + 1].key] !== 'PENDING' ? 'bg-green-500' :
                                                    tenant[step.key] === 'SUCCESS' ? 'bg-gradient-to-r from-green-500 to-muted' : 'bg-muted'
                                                }`} />
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                                <span>Created: {format(new Date(tenant.createdAt), 'MMM d, yyyy HH:mm')}</span>
                                <span>Last updated: {format(new Date(tenant.updatedAt), 'MMM d, yyyy HH:mm')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

