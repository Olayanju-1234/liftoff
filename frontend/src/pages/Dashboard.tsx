import { useEffect, useState } from 'react';
import { getTenants, getEvents, checkHealth } from '../lib/api';
import type { Tenant, EventLog } from '../lib/types';
import { Users, Activity, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface Stats {
    totalTenants: number;
    activeTenants: number;
    provisioningTenants: number;
    failedTenants: number;
}

interface ServiceStatus {
    name: string;
    status: 'Operational' | 'Degraded' | 'Down';
}

export default function Dashboard() {
    const [stats, setStats] = useState<Stats>({
        totalTenants: 0,
        activeTenants: 0,
        provisioningTenants: 0,
        failedTenants: 0,
    });
    const [recentEvents, setRecentEvents] = useState<EventLog[]>([]);
    const [services, setServices] = useState<ServiceStatus[]>([
        { name: 'API Gateway', status: 'Operational' },
        { name: 'Tenant Service', status: 'Operational' },
        { name: 'Database', status: 'Operational' },
        { name: 'RabbitMQ', status: 'Operational' },
    ]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch tenants for stats
            const tenants = await getTenants();
            const total = tenants.length;
            const active = tenants.filter((t: Tenant) => t.status === 'ACTIVE').length;
            const provisioning = tenants.filter((t: Tenant) => t.status === 'PROVISIONING').length;
            const failed = tenants.filter((t: Tenant) => t.status === 'FAILED').length;

            setStats({
                totalTenants: total,
                activeTenants: active,
                provisioningTenants: provisioning,
                failedTenants: failed,
            });

            // Fetch recent events
            const events = await getEvents();
            setRecentEvents(events.slice(0, 5));

            // Check API health
            const healthResult = await checkHealth();
            setServices(prev => prev.map(s =>
                s.name === 'API Gateway' ? { ...s, status: healthResult.status } : s
            ));
        } catch (error) {
            console.error('Failed to fetch dashboard data', error);
            // Mark API as down if we can't reach it
            setServices(prev => prev.map(s =>
                s.name === 'API Gateway' ? { ...s, status: 'Down' } : s
            ));
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, icon: Icon, color, loading: isLoading }: {
        title: string;
        value: number;
        icon: React.ElementType;
        color: string;
        loading: boolean;
    }) => (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <h3 className="text-2xl font-bold mt-2">
                        {isLoading ? (
                            <div className="h-8 w-12 bg-muted animate-pulse rounded" />
                        ) : (
                            value
                        )}
                    </h3>
                </div>
                <div className={`p-3 rounded-lg ${color}`}>
                    <Icon size={24} className="text-background" />
                </div>
            </div>
        </div>
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Operational': return 'bg-green-500/10 text-green-500';
            case 'Degraded': return 'bg-yellow-500/10 text-yellow-500';
            case 'Down': return 'bg-red-500/10 text-red-500';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground mt-2">Overview of your system status and tenant metrics.</p>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Tenants"
                    value={stats.totalTenants}
                    icon={Users}
                    color="bg-blue-500"
                    loading={loading}
                />
                <StatCard
                    title="Active Tenants"
                    value={stats.activeTenants}
                    icon={CheckCircle}
                    color="bg-green-500"
                    loading={loading}
                />
                <StatCard
                    title="Provisioning"
                    value={stats.provisioningTenants}
                    icon={Activity}
                    color="bg-yellow-500"
                    loading={loading}
                />
                <StatCard
                    title="Failed Provisioning"
                    value={stats.failedTenants}
                    icon={AlertCircle}
                    color="bg-red-500"
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                    <div className="space-y-4">
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 p-3">
                                    <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                                        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                                    </div>
                                </div>
                            ))
                        ) : recentEvents.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No recent activity</p>
                        ) : (
                            recentEvents.map((event) => (
                                <div key={event.id} className="flex items-center gap-4 p-3 hover:bg-muted/50 rounded-lg transition-colors">
                                    <div className={`w-2 h-2 rounded-full ${event.status === 'Success' ? 'bg-green-500' :
                                            event.status === 'Error' ? 'bg-red-500' : 'bg-yellow-500'
                                        }`} />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">
                                            {event.tenant?.name || 'Unknown'}: {event.eventType.replace('tenant.', '').replace('.', ' ')}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4">System Health</h3>
                    <div className="space-y-4">
                        {services.map((service) => (
                            <div key={service.name} className="flex items-center justify-between">
                                <span className="text-sm font-medium">{service.name}</span>
                                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(service.status)}`}>
                                    {service.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
