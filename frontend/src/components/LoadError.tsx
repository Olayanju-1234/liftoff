import { AlertTriangle, RotateCcw } from 'lucide-react';
import { apiMessage } from '../lib/errors';
import Button from './ui/Button';

interface LoadErrorProps {
    error: unknown;
    what: string;
    onRetry: () => void;
    busy?: boolean;
}

export default function LoadError({ error, what, onRetry, busy }: LoadErrorProps) {
    return (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-abort/35 bg-abort/[0.05] px-4 py-3">
            <AlertTriangle size={18} className="shrink-0 text-abort" />
            <p className="min-w-0 flex-1 text-[14.5px] text-ink">
                <span className="font-semibold">Couldn't load {what}.</span>{' '}
                <span className="text-ink-2">{apiMessage(error, 'The request failed.')}</span>
            </p>
            <Button size="sm" onClick={onRetry} busy={busy}>
                {!busy && <RotateCcw size={13} />} Retry
            </Button>
        </div>
    );
}
