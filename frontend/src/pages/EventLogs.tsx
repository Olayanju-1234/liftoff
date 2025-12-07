import { useEffect, useState, useMemo } from 'react';
import { getEvents, getTenants } from '../lib/api';
import type { EventLog, Tenant } from '../lib/types';
import { Filter, Calendar, RefreshCw, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import PayloadModal from '../components/PayloadModal';

export default function EventLogs() {
    const [events, setEvents] = useState<EventLog[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [liveTail, setLiveTail] = useState(false);

    // Filters
    const [tenantFilter, setTenantFilter] = useState<string>('all');
    const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
    const [showTenantDropdown, setShowTenantDropdown] = useState(false);
    const [showEventTypeDropdown, setShowEventTypeDropdown] = useState(false);

    // Payload modal
    const [selectedEvent, setSelectedEvent] = useState<EventLog | null>(null);

    useEffect(() => {
        fetchData();
        fetchTenants();
    }, []);

    // Live tail polling
    useEffect(() => {
        if (!liveTail) return;

        const interval = setInterval(() => {
            fetchData(true);
        }, 5000);

        return () => clearInterval(interval);
    }, [liveTail]);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await getEvents();
            setEvents(data);
        } catch (error) {
            console.error('Failed to fetch events', error);
            if (!silent) toast.error('Failed to load events');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchTenants = async () => {
        try {
            const data = await getTenants();
            setTenants(data);
        } catch (error) {
            console.error('Failed to fetch tenants', error);
        }
    };

    // Get unique event types
    const eventTypes = useMemo(() => {
        const types = new Set(events.map(e => e.eventType));
        return Array.from(types);
    }, [events]);

    // Filtered events
    const filteredEvents = useMemo(() => {
        return events.filter(event => {
            const matchesTenant = tenantFilter === 'all' || event.tenantId === tenantFilter;
            const matchesType = eventTypeFilter === 'all' || event.eventType === eventTypeFilter;
            return matchesTenant && matchesType;
        });
    }, [events, tenantFilter, eventTypeFilter]);

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            Success: 'bg-green-500/10 text-green-500',
            Warning: 'bg-yellow-500/10 text-yellow-500',
            Error: 'bg-red-500/10 text-red-500',
        };
        const dotColors: Record<string, string> = {
            Success: 'bg-green-500',
            Warning: 'bg-yellow-500',
            Error: 'bg-red-500',
        };

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-500/10 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColors[status] || 'bg-gray-500'}`} />
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <PayloadModal
                isOpen={!!selectedEvent}
                title={`Event Payload - ${selectedEvent?.eventType || ''}`}
                payload={selectedEvent?.payload || null}
                onClose={() => setSelectedEvent(null)}
            />

            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Event Log Viewer</h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Live Tail</span>
                        <button
                            onClick={() => setLiveTail(!liveTail)}
                            className={`w-10 h-5 rounded-full relative transition-colors ${liveTail ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <div className={`w-4 h-4 bg-background rounded-full absolute top-0.5 transition-transform shadow-sm ${liveTail ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                    <button
                        onClick={() => fetchData()}
                        disabled={loading}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-md flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 bg-card p-4 rounded-lg border border-border">
                {/* Tenant Filter */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowTenantDropdown(!showTenantDropdown);
                            setShowEventTypeDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${tenantFilter !== 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'
                            }`}
                    >
                        <Filter size={16} />
                        Tenant
                        {tenantFilter !== 'all' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setTenantFilter('all');
                                }}
                                className="ml-1 hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </button>
                    {showTenantDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-56 bg-card border border-border rounded-lg shadow-lg z-10 py-1 max-h-64 overflow-auto">
                            <button
                                onClick={() => {
                                    setTenantFilter('all');
                                    setShowTenantDropdown(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${tenantFilter === 'all' ? 'text-primary' : ''}`}
                            >
                                All Tenants
                            </button>
                            {tenants.map(tenant => (
                                <button
                                    key={tenant.id}
                                    onClick={() => {
                                        setTenantFilter(tenant.id);
                                        setShowTenantDropdown(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${tenantFilter === tenant.id ? 'text-primary' : ''}`}
                                >
                                    {tenant.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Event Type Filter */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowEventTypeDropdown(!showEventTypeDropdown);
                            setShowTenantDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${eventTypeFilter !== 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'
                            }`}
                    >
                        <Filter size={16} />
                        Event Type
                        {eventTypeFilter !== 'all' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEventTypeFilter('all');
                                }}
                                className="ml-1 hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </button>
                    {showEventTypeDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-64 bg-card border border-border rounded-lg shadow-lg z-10 py-1 max-h-64 overflow-auto">
                            <button
                                onClick={() => {
                                    setEventTypeFilter('all');
                                    setShowEventTypeDropdown(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${eventTypeFilter === 'all' ? 'text-primary' : ''}`}
                            >
                                All Event Types
                            </button>
                            {eventTypes.map(type => (
                                <button
                                    key={type}
                                    onClick={() => {
                                        setEventTypeFilter(type);
                                        setShowEventTypeDropdown(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted font-mono ${eventTypeFilter === type ? 'text-primary' : ''}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-md bg-background hover:bg-muted text-sm font-medium">
                    <Calendar size={16} />
                    Date Range
                </button>

                {liveTail && (
                    <div className="flex items-center gap-2 ml-auto text-sm text-green-500">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Live updating...
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 bg-muted/50 text-muted-foreground font-medium text-sm border-b border-border">
                    <div className="col-span-3">TIMESTAMP</div>
                    <div className="col-span-3">TENANT</div>
                    <div className="col-span-3">EVENT TYPE</div>
                    <div className="col-span-2">STATUS</div>
                    <div className="col-span-1 text-right">DETAILS</div>
                </div>

                <div className="divide-y divide-border">
                    {loading ? (
                        <div className="p-8 text-center text-muted-foreground">Loading events...</div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            {events.length === 0 ? 'No events found.' : 'No events match your filters.'}
                        </div>
                    ) : (
                        filteredEvents.map((event) => (
                            <div key={event.id} className="grid grid-cols-12 gap-4 p-4 hover:bg-muted/50 transition-colors text-sm items-center">
                                <div className="col-span-3 text-muted-foreground">
                                    {format(new Date(event.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                                </div>
                                <div className="col-span-3 font-medium">
                                    {event.tenant?.name || tenants.find(t => t.id === event.tenantId)?.name || event.tenantId.slice(0, 8)}
                                </div>
                                <div className="col-span-3 text-muted-foreground font-mono text-xs">
                                    {event.eventType}
                                </div>
                                <div className="col-span-2">
                                    {getStatusBadge(event.status)}
                                </div>
                                <div className="col-span-1 text-right">
                                    <button
                                        onClick={() => setSelectedEvent(event)}
                                        className="text-primary hover:underline text-sm"
                                    >
                                        View Payload
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Click outside to close dropdowns */}
            {(showTenantDropdown || showEventTypeDropdown) && (
                <div
                    className="fixed inset-0 z-0"
                    onClick={() => {
                        setShowTenantDropdown(false);
                        setShowEventTypeDropdown(false);
                    }}
                />
            )}
        </div>
    );
}
