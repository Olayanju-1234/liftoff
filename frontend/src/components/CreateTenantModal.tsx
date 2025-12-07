import { useState } from 'react';
import { X, Briefcase, Star, Shield } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface CreateTenantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateTenantModal({ isOpen, onClose, onSuccess }: CreateTenantModalProps) {
    const [name, setName] = useState('');
    const [subdomain, setSubdomain] = useState('');
    const [plan, setPlan] = useState('Basic');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/tenants', {
                name,
                subdomain,
                planId: plan,
            });
            onSuccess();
            onClose();
            // Reset form
            setName('');
            setSubdomain('');
            setPlan('Basic');
        } catch (err: any) {
            const message = err.response?.data?.message || 'Failed to create tenant';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const plans = [
        { id: 'Basic', name: 'Basic', icon: Briefcase },
        { id: 'Pro', name: 'Pro', icon: Star },
        { id: 'Enterprise', name: 'Enterprise', icon: Shield },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-2xl rounded-xl border border-border shadow-lg overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-6">
                    <h2 className="text-xl font-bold">Create New Tenant</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 text-red-500 p-3 rounded-md text-sm border border-red-500/20">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Tenant Name</label>
                            <input
                                type="text"
                                placeholder="Enter customer's company name"
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Subdomain</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="acme-corp"
                                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    value={subdomain}
                                    onChange={(e) => setSubdomain(e.target.value)}
                                    required
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                    .saas.com
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{subdomain ? `${subdomain}.saas.com` : 'your-subdomain.saas.com'}</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Select Plan</label>
                            <div className="grid grid-cols-3 gap-4">
                                {plans.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setPlan(p.id)}
                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border transition-all ${plan === p.id
                                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                                            : 'border-border hover:border-primary/50 hover:bg-muted'
                                            }`}
                                    >
                                        <p.icon size={24} />
                                        <span className="font-medium">{p.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Creating Tenant...' : 'Create Tenant'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
