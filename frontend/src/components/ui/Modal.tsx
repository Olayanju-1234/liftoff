import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    fig?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'md' | 'lg';
}

export default function Modal({ open, onClose, title, fig, children, footer, size = 'md' }: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        const previous = document.activeElement as HTMLElement | null;
        const first = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
        first?.focus();
        return () => {
            window.removeEventListener('keydown', onKey);
            previous?.focus?.();
        };
    }, [open, onClose]);

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 px-4 pb-10 pt-[9vh] backdrop-blur-[2px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) onClose();
                    }}
                >
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className={cn(
                            'crop w-full rounded-md border border-rule-strong bg-card shadow-lift',
                            size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
                        )}
                        initial={{ y: 14, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 8, opacity: 0 }}
                        transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                        <header className="flex items-center gap-3 border-b border-rule px-5 py-3.5">
                            {fig && <span className="label">{fig}</span>}
                            <h2 className="font-cond text-[21px] font-semibold leading-tight">{title}</h2>
                            <button
                                type="button"
                                data-close
                                onClick={onClose}
                                aria-label="Close"
                                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded text-ink-3 transition-colors hover:bg-paper-deep hover:text-ink"
                            >
                                <X size={16} />
                            </button>
                        </header>
                        <div className="px-5 py-5">{children}</div>
                        {footer && (
                            <footer className="flex flex-wrap justify-end gap-2 border-t border-rule bg-paper/60 px-5 py-3">
                                {footer}
                            </footer>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
