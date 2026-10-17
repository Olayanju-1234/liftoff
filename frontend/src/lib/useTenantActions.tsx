import { useState } from 'react';
import toast from 'react-hot-toast';
import { cancelTenant, deleteTenant } from './api';
import { apiMessage } from './errors';
import type { Tenant } from './types';
import { useIsSimple } from './mode';
import ConfirmDialog from '../components/ConfirmDialog';

interface Pending {
    kind: 'cancel' | 'delete';
    tenant: Tenant;
}

export function useTenantActions(opts: { onCancelled?: (t: Tenant) => void; onDeleted?: (t: Tenant) => void } = {}) {
    const [pending, setPending] = useState<Pending | null>(null);
    const [busy, setBusy] = useState(false);
    const simple = useIsSimple();

    const confirm = async () => {
        if (!pending) return;
        const { kind, tenant } = pending;
        setBusy(true);
        try {
            if (kind === 'cancel') {
                await cancelTenant(tenant.id, 'Cancelled by operator');
                toast.success(simple ? `Setup cancelled for ${tenant.name}` : `Provisioning cancelled for ${tenant.name}`);
                opts.onCancelled?.(tenant);
            } else {
                const removed = await deleteTenant(tenant.id);
                toast.success(removed?.status === 'DELETED' ? `${tenant.name} removed` : `Removing ${tenant.name}`);
                opts.onDeleted?.(tenant);
            }
            setPending(null);
        } catch (err) {
            toast.error(apiMessage(err, kind === 'cancel' ? (simple ? 'Could not cancel setup.' : 'Could not cancel provisioning.') : 'Could not delete the tenant.'));
        } finally {
            setBusy(false);
        }
    };

    const name = pending?.tenant.name ?? '';
    const dialog = (
        <ConfirmDialog
            isOpen={!!pending}
            title={
                pending?.kind === 'delete'
                    ? simple
                        ? `Remove ${name}?`
                        : `Delete ${name}?`
                    : simple
                      ? `Cancel setup for ${name}?`
                      : `Cancel provisioning for ${name}?`
            }
            message={
                simple ? (
                    pending?.kind === 'delete' ? (
                        <>
                            We delete {name}'s database, revoke their API key and cancel their Stripe subscription if they have one. Their history stays
                            in Liftoff. It can't be undone.
                        </>
                    ) : (
                        <>Setup stops where it is. Steps that already finished are kept, and your team won't get the ready email.</>
                    )
                ) : pending?.kind === 'delete' ? (
                    <>
                        tenant-service publishes <code className="font-mono text-[13px] text-ink">tenant.deprovision</code>: db-provisioner
                        drops the schema, credentials revokes the key, billing cancels the subscription. The tenant reads DEPROVISIONING, then
                        DELETED (soft; its events are kept) and <code className="font-mono text-[13px] text-ink">tenant.deleted</code> is sent.
                        This can't be undone.
                    </>
                ) : (
                    <>
                        Steps that haven't finished are marked <code className="font-mono text-[13px] text-ink">CANCELLED</code> and
                        the tenant stops where it is. Finished steps are not rolled back.
                    </>
                )
            }
            confirmLabel={pending?.kind === 'delete' ? (simple ? 'Remove customer' : 'Delete tenant') : simple ? 'Cancel setup' : 'Cancel provisioning'}
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
