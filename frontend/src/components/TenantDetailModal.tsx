import { X, Calendar, Building, Activity, Database, Globe, Key, CreditCard, Bell } from 'lucide-react';
import { format } from 'date-fns';
import type { Tenant, EventLog } from '../lib/types';

interface TenantDetailModalProps {
    isOpen: boolean;
    tenant: Tenant | null;
    events: EventLog[];
    onClose: () => void;
}

export default function TenantDetailModal({ isOpen, tenant, events, onClose }: TenantDetailModalProps) {
    if (!isOpen || !tenant) return null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': case 'SUCCESS': return 'text-green-500 bg-green-500/10';
            case 'PROVISIONING': case 'IN_PROGRESS': return 'text-blue-500 bg-blue-500/10';
            case 'FAILED': return 'text-red-500 bg-red-500/10';
            default: return 'text-gray-500 bg-gray-500/10';
        }
    };

    const steps = [
        { name: 'Database', status: tenant.dbStatus, icon: Database },
        { name: 'DNS', status: tenant.dnsStatus, icon: Globe },
        { name: 'Credentials', status: tenant.credentialsStatus, icon: Key },
        { name: 'Billing', status: tenant.billingStatus, icon: CreditCard },
        { name: 'Notification', status: tenant.notificationStatus, icon: Bell },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-3xl rounded-xl border border-border shadow-lg overflow-hidden max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-border p-6">
                    <div>
                        <h2 className="text-xl font-bold">{tenant.name}</h2>
                        <p className="text-sm text-muted-foreground mt-1">{tenant.subdomain}.saas.com</p>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-auto flex-1 space-y-6">
                    {/* Status & Info */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-muted/30 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                            <span className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-sm font-medium ${getStatusColor(tenant.status)}`}>
                                {tenant.status}
                            </span>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Plan</p>
                            <p className="mt-2 font-medium">{tenant.planId}</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <Calendar size={12} /> Created
                            </p>
                            <p className="mt-2 font-medium">{format(new Date(tenant.createdAt), 'MMM d, yyyy')}</p>
                        </div>
                    </div>

                    {/* Provisioning Steps */}
                    <div>
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Activity size={16} />
                            Provisioning Pipeline
                        </h3>
                        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-4">
                            {steps.map((step, index) => (
                                <div key={step.name} className="flex items-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={`p-2 rounded-lg ${getStatusColor(step.status)}`}>
                                            <step.icon size={18} />
                                        </div>
                                        <span className="text-xs font-medium">{step.name}</span>
                                        <span className="text-xs text-muted-foreground">{step.status.toLowerCase().replace('_', ' ')}</span>
                                    </div>
                                    {index < steps.length - 1 && (
                                        <div className="w-12 h-0.5 bg-border mx-2" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Events */}
                    <div>
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Building size={16} />
                            Recent Events
                        </h3>
                        <div className="space-y-2 max-h-48 overflow-auto">
                            {events.length === 0 ? (
                                <p className="text-muted-foreground text-sm text-center py-4">No events recorded</p>
                            ) : (
                                events.slice(0, 10).map((event) => (
                                    <div key={event.id} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg p-3">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full ${event.status === 'Success' ? 'bg-green-500' :
                                                    event.status === 'Error' ? 'bg-red-500' : 'bg-yellow-500'
                                                }`} />
                                            <span className="font-medium">{event.eventType}</span>
                                        </div>
                                        <span className="text-muted-foreground">
                                            {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
