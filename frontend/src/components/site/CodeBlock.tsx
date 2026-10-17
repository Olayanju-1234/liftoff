import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';

interface CodeBlockProps {
    code: string;
    title?: string;
    lang?: string;
    className?: string;
}

export default function CodeBlock({ code, title, lang, className }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className={cn('min-w-0 overflow-hidden rounded-md border border-ink/70 bg-ink text-paper', className)}>
            <div className="flex items-center gap-3 border-b border-paper/15 px-4 py-2">
                {title && <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-paper/70">{title}</span>}
                {lang && <span className="font-mono text-[10.5px] text-paper/40">{lang}</span>}
                <button
                    type="button"
                    onClick={copy}
                    className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-sm px-2 font-mono text-[11px] text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="scrollbar-thin overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.6] text-paper/90">
                <code>{code}</code>
            </pre>
        </div>
    );
}
