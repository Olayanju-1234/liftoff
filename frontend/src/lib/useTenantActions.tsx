import { useState } from 'react';
import toast from 'react-hot-toast';
import { cancelTenant, deleteTenant } from './api';
import { apiMessage } from './errors';
import type { Tenant } from './types';
import ConfirmDialog from '../components/ConfirmDialog';

interface Pending {
    kind: 'cancel' | 'delete';
    tenant: Tenant;
}

export function useTenantActions(opts: { onCancelled?: (t: Tenant) => void; onDeleted?: (t: Tenant) => void } = {}) {
    const [pending, setPending] = useState<Pending | null>(null);
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
        if (!pending) return;
        const { kind, tenant } = pending;
        setBusy(true);
        try {
            if (kind === 'cancel') {
                await cancelTenant(tenant.id, 'Cancelled by operator');
                toast.success(`Provisioning cancelled for ${tenant.name}`);
                opts.onCancelled?.(tenant);
            } else {
                await deleteTenant(tenant.id);
                toast.success(`${tenant.name} deleted`);
                opts.onDeleted?.(tenant);
            }
            setPending(null);
        } catch (err) {
            toast.error(apiMessage(err, kind === 'cancel' ? 'Could not cancel provisioning.' : 'Could not delete the tenant.'));
        } finally {
            setBusy(false);
        }
    };

    const name = pending?.tenant.name ?? '';
    const dialog = (
        <ConfirmDialog
            isOpen={!!pending}
            title={pending?.kind === 'delete' ? `Delete ${name}?` : `Cancel provisioning for ${name}?`}
            message={
                pending?.kind === 'delete' ? (
                    <>
                        tenant-service publishes <code className="font-mono text-[13px] text-ink">tenant.deleted</code>, then removes
                        the tenant and its event history. This can't be undone.
                    </>
                ) : (
                    <>
                        Steps that haven't finished are marked <code className="font-mono text-[13px] text-ink">CANCELLED</code> and
                        the tenant stops where it is. Finished steps are not rolled back.
                    </>
                )
            }
            confirmLabel={pending?.kind === 'delete' ? 'Delete tenant' : 'Cancel provisioning'}
            loading={busy}
            onConfirm={confirm}
            onCancel={() => setPending(null)}
        />
    );

    return {
        requestCancel: (tenant: Tenant) => setPending({ kind: 'cancel', tenant }),
        requestDelete: (tenant: Tenant) => setPending({ kind: 'delete', tenant }),
        dialog,
    };
}
