import { useEffect, useState, useMemo } from 'react';
import { getEvents } from '../lib/api';
import type { EventLog } from '../lib/types';
import { AlertCircle, RefreshCw, Eye, RotateCcw, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import PayloadModal from '../components/PayloadModal';

interface FailedJob {
    id: string;
    eventType: string;
    tenantId: string;
    tenantName: string;
    error: string;
    timestamp: string;
    payload: Record<string, unknown> | null;
}

export default function FailedJobs() {
    const [events, setEvents] = useState<EventLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<FailedJob | null>(null);
    const [retrying, setRetrying] = useState<string | null>(null);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const data = await getEvents();
            setEvents(data);
        } catch (error) {
            console.error('Failed to fetch events', error);
            toast.error('Failed to load failed jobs');
        } finally {
            setLoading(false);
        }
    };

    // Filter to only Error events
    const failedJobs: FailedJob[] = useMemo(() => {
        return events
            .filter(e => e.status === 'Error')
            .map(e => ({
                id: e.id,
                eventType: e.eventType,
                tenantId: e.tenantId,
                tenantName: e.tenant?.name || e.tenantId.slice(0, 8),
                error: (e.payload as Record<string, unknown>)?.error as string || 'Unknown error',
                timestamp: e.timestamp,
                payload: e.payload,
            }));
    }, [events]);

    const handleRetry = async (job: FailedJob) => {
        setRetrying(job.id);
        try {
            // In a real implementation, this would call a retry endpoint
            // For now, we'll simulate a retry with a toast
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success(`Retry initiated for ${job.eventType}`);
        } catch (error) {
            toast.error('Failed to retry job');
        } finally {
            setRetrying(null);
        }
    };

    const getJobTypeLabel = (eventType: string) => {
        const labels: Record<string, string> = {
            'tenant.db.ready': 'Provision Database',
            'tenant.dns.ready': 'DNS Propagation',
            'tenant.credentials.ready': 'Create Credentials',
            'tenant.billing.active': 'Setup Billing',
            'tenant.provisioning.complete': 'Complete Provisioning',
            'tenant.requested': 'Tenant Requested',
        };
        return labels[eventType] || eventType.replace('tenant.', '').replace('.', ' ');
    };

    return (
        <div className="space-y-6">
            <PayloadModal
                isOpen={!!selectedJob}
                title={`Failed Job Details - ${selectedJob?.eventType || ''}`}
                payload={selectedJob?.payload || null}
                onClose={() => setSelectedJob(null)}
            />

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Failed Jobs</h2>
                    <p className="text-muted-foreground mt-2">
                        Monitor and retry failed provisioning tasks.
                    </p>
                </div>
                <button
                    onClick={fetchEvents}
                    disabled={loading}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Summary */}
            {failedJobs.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center gap-4">
                    <AlertCircle size={24} className="text-red-500" />
                    <div>
                        <p className="font-medium">{failedJobs.length} failed job{failedJobs.length !== 1 ? 's' : ''} require attention</p>
                        <p className="text-sm text-muted-foreground">Review the errors below and retry if needed.</p>
                    </div>
                </div>
            )}

            {/* Jobs Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                        <tr>
                            <th className="px-6 py-4">Job ID</th>
                            <th className="px-6 py-4">Job Type</th>
                            <th className="px-6 py-4">Tenant</th>
                            <th className="px-6 py-4">Error</th>
                            <th className="px-6 py-4">Failed At</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                    Loading failed jobs...
                                </td>
                            </tr>
                        ) : failedJobs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center">
                                    <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
                                        <Inbox size={32} className="text-muted-foreground" />
                                    </div>
                                    <p className="font-medium">No Failed Jobs</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        All provisioning tasks have completed successfully.
                                    </p>
                                </td>
                            </tr>
                        ) : (
                            failedJobs.map((job) => (
                                <tr key={job.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs">{job.id.slice(0, 12)}...</td>
                                    <td className="px-6 py-4 font-medium">{getJobTypeLabel(job.eventType)}</td>
                                    <td className="px-6 py-4">{job.tenantName}</td>
                                    <td className="px-6 py-4">
                                        <span className="text-red-500 text-xs bg-red-500/10 px-2 py-1 rounded">
                                            {typeof job.error === 'string' ? job.error.slice(0, 50) : 'Error details in payload'}
                                            {typeof job.error === 'string' && job.error.length > 50 && '...'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {format(new Date(job.timestamp), 'MMM d, HH:mm')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setSelectedJob(job)}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
                                            >
                                                <Eye size={12} />
                                                View Logs
                                            </button>
                                            <button
                                                onClick={() => handleRetry(job)}
                                                disabled={retrying === job.id}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                                            >
                                                <RotateCcw size={12} className={retrying === job.id ? 'animate-spin' : ''} />
                                                {retrying === job.id ? 'Retrying...' : 'Retry Job'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
