import { useState } from 'react';
import toast from 'react-hot-toast';
import { cancelTenant, deleteTenant } from './api';
import { apiMessage } from './errors';
import type { Tenant } from './types';
import { useIsSimple } from './viewMode';
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
                await deleteTenant(tenant.id);
                toast.success(`${tenant.name} deleted`);
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
            title={pending?.kind === 'delete' ? `Delete ${name}?` : simple ? `Cancel setup for ${name}?` : `Cancel provisioning for ${name}?`}
            message={
                simple ? (
                    pending?.kind === 'delete' ? (
                        <>This removes {name} and its history. It can't be undone.</>
                    ) : (
                        <>Setup stops where it is. Steps that already finished are kept.</>
                    )
                ) : pending?.kind === 'delete' ? (
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
            confirmLabel={pending?.kind === 'delete' ? 'Delete tenant' : simple ? 'Cancel setup' : 'Cancel provisioning'}
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
