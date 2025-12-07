import { useEffect, useState, useMemo } from 'react';
import { getTenants, deleteTenant as apiDeleteTenant, getTenantEvents } from '../lib/api';
import type { Tenant, EventLog } from '../lib/types';
import { Plus, Search, Filter, Calendar, MoreHorizontal, Eye, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import CreateTenantModal from '../components/CreateTenantModal';
import TenantDetailModal from '../components/TenantDetailModal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function TenantManagement() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [planFilter, setPlanFilter] = useState<string>('all');
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [showPlanDropdown, setShowPlanDropdown] = useState(false);

    // Detail modal
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const [tenantEvents, setTenantEvents] = useState<EventLog[]>([]);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Delete confirmation
    const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Actions dropdown
    const [openActionsId, setOpenActionsId] = useState<string | null>(null);

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        try {
            const data = await getTenants();
            setTenants(data);
        } catch (error) {
            console.error('Failed to fetch tenants', error);
            toast.error('Failed to load tenants');
        } finally {
            setLoading(false);
        }
    };

    const handleViewTenant = async (tenant: Tenant) => {
        setSelectedTenant(tenant);
        try {
            const events = await getTenantEvents(tenant.id);
            setTenantEvents(events);
        } catch {
            setTenantEvents([]);
        }
        setIsDetailModalOpen(true);
        setOpenActionsId(null);
    };

    const handleDeleteClick = (tenant: Tenant) => {
        setTenantToDelete(tenant);
        setOpenActionsId(null);
    };

    const handleConfirmDelete = async () => {
        if (!tenantToDelete) return;

        setIsDeleting(true);
        try {
            await apiDeleteTenant(tenantToDelete.id);
            toast.success(`Tenant "${tenantToDelete.name}" deleted successfully`);
            setTenants(prev => prev.filter(t => t.id !== tenantToDelete.id));
            setTenantToDelete(null);
        } catch (error) {
            console.error('Failed to delete tenant', error);
            toast.error('Failed to delete tenant');
        } finally {
            setIsDeleting(false);
        }
    };

    // Get unique plans for filter
    const uniquePlans = useMemo(() => {
        const plans = new Set(tenants.map(t => t.planId));
        return Array.from(plans);
    }, [tenants]);

    // Filtered tenants
    const filteredTenants = useMemo(() => {
        return tenants.filter(tenant => {
            const matchesSearch = searchQuery === '' ||
                tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tenant.subdomain.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
            const matchesPlan = planFilter === 'all' || tenant.planId === planFilter;

            return matchesSearch && matchesStatus && matchesPlan;
        });
    }, [tenants, searchQuery, statusFilter, planFilter]);

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            ACTIVE: 'bg-green-500/10 text-green-500',
            PROVISIONING: 'bg-yellow-500/10 text-yellow-500',
            FAILED: 'bg-red-500/10 text-red-500',
            SUSPENDED: 'bg-gray-500/10 text-gray-500',
        };
        const dotColors: Record<string, string> = {
            ACTIVE: 'bg-green-500',
            PROVISIONING: 'bg-yellow-500',
            FAILED: 'bg-red-500',
            SUSPENDED: 'bg-gray-500',
        };

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[status] || colors.SUSPENDED}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColors[status] || dotColors.SUSPENDED}`} />
                {status.toLowerCase()}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <CreateTenantModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={() => {
                    fetchTenants();
                    toast.success('Tenant created successfully!');
                }}
            />

            <TenantDetailModal
                isOpen={isDetailModalOpen}
                tenant={selectedTenant}
                events={tenantEvents}
                onClose={() => {
                    setIsDetailModalOpen(false);
                    setSelectedTenant(null);
                }}
            />

            <ConfirmDialog
                isOpen={!!tenantToDelete}
                title="Delete Tenant"
                message={`Are you sure you want to delete "${tenantToDelete?.name}"? This action cannot be undone and will remove all associated data.`}
                confirmLabel="Delete"
                variant="danger"
                loading={isDeleting}
                onConfirm={handleConfirmDelete}
                onCancel={() => setTenantToDelete(null)}
            />

            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md flex items-center gap-2 hover:bg-primary/90 transition-colors"
                >
                    <Plus size={18} />
                    New Tenant
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-4 bg-card p-4 rounded-lg border border-border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text"
                        placeholder="Search by name or subdomain..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Status Filter */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowStatusDropdown(!showStatusDropdown);
                            setShowPlanDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${statusFilter !== 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'
                            }`}
                    >
                        <Filter size={16} />
                        Status {statusFilter !== 'all' && `(${statusFilter})`}
                    </button>
                    {showStatusDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-48 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
                            {['all', 'ACTIVE', 'PROVISIONING', 'FAILED', 'SUSPENDED'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => {
                                        setStatusFilter(status);
                                        setShowStatusDropdown(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${statusFilter === status ? 'text-primary' : ''}`}
                                >
                                    {status === 'all' ? 'All Statuses' : status}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Plan Filter */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowPlanDropdown(!showPlanDropdown);
                            setShowStatusDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${planFilter !== 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'
                            }`}
                    >
                        <Filter size={16} />
                        Plan {planFilter !== 'all' && `(${planFilter})`}
                    </button>
                    {showPlanDropdown && (
                        <div className="absolute top-full mt-1 left-0 w-48 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
                            <button
                                onClick={() => {
                                    setPlanFilter('all');
                                    setShowPlanDropdown(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${planFilter === 'all' ? 'text-primary' : ''}`}
                            >
                                All Plans
                            </button>
                            {uniquePlans.map(plan => (
                                <button
                                    key={plan}
                                    onClick={() => {
                                        setPlanFilter(plan);
                                        setShowPlanDropdown(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${planFilter === plan ? 'text-primary' : ''}`}
                                >
                                    {plan}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-md bg-background hover:bg-muted text-sm font-medium">
                    <Calendar size={16} />
                    Date Range
                </button>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                        <tr>
                            <th className="px-6 py-4">Tenant Name</th>
                            <th className="px-6 py-4">Subdomain</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Plan</th>
                            <th className="px-6 py-4">Created Date</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading tenants...</td></tr>
                        ) : filteredTenants.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                {tenants.length === 0 ? 'No tenants found. Create your first tenant!' : 'No tenants match your filters.'}
                            </td></tr>
                        ) : (
                            filteredTenants.map((tenant) => (
                                <tr key={tenant.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 font-medium">{tenant.name}</td>
                                    <td className="px-6 py-4 text-muted-foreground">{tenant.subdomain}.saas.com</td>
                                    <td className="px-6 py-4">{getStatusBadge(tenant.status)}</td>
                                    <td className="px-6 py-4">{tenant.planId}</td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {format(new Date(tenant.createdAt), 'yyyy-MM-dd')}
                                    </td>
                                    <td className="px-6 py-4 text-right relative">
                                        <button
                                            onClick={() => setOpenActionsId(openActionsId === tenant.id ? null : tenant.id)}
                                            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                                        >
                                            <MoreHorizontal size={18} />
                                        </button>
                                        {openActionsId === tenant.id && (
                                            <div className="absolute right-6 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
                                                <button
                                                    onClick={() => handleViewTenant(tenant)}
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                                >
                                                    <Eye size={14} />
                                                    View Details
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(tenant)}
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted flex items-center gap-2 text-red-500"
                                                >
                                                    <Trash2 size={14} />
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Click outside to close dropdowns */}
            {(showStatusDropdown || showPlanDropdown || openActionsId) && (
                <div
                    className="fixed inset-0 z-0"
                    onClick={() => {
                        setShowStatusDropdown(false);
                        setShowPlanDropdown(false);
                        setOpenActionsId(null);
                    }}
                />
            )}
        </div>
    );
}
