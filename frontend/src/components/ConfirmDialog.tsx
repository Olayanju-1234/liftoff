import type { ReactNode } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Keep it',
    variant = 'danger',
    onConfirm,
    onCancel,
    loading = false,
}: ConfirmDialogProps) {
    return (
        <Modal
            open={isOpen}
            onClose={() => !loading && onCancel()}
            fig={variant === 'danger' ? 'Caution' : 'Check'}
            title={title}
            footer={
                <>
                    <Button variant="ghost" onClick={onCancel} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button variant="abort" onClick={onConfirm} busy={loading}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="text-[15px] leading-relaxed text-ink-2">{message}</div>
        </Modal>
    );
}
