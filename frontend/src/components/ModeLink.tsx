import { Link } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { HOOD_HOME, useIsSimple } from '../lib/mode';
import { cn } from '../lib/cn';

const PILL =
    'flex items-center gap-2 rounded-sm border border-rule-strong bg-card px-2 py-1 text-ink-2 transition-colors hover:border-ink-3 hover:text-ink';

export default function ModeLink({ className }: { className?: string }) {
    const simple = useIsSimple();
    return simple ? (
        <Link to={HOOD_HOME} className={cn(PILL, className)} title="The engineering view: pipeline diagram, event log and routing detail">
            <Wrench size={12} />
            Under the hood
        </Link>
    ) : (
        <Link to="/" className={cn(PILL, className)} title="Back to the customer list">
            <ArrowLeft size={12} />
            Customers
        </Link>
    );
}
