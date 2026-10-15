import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface PayloadViewProps {
    payload: unknown;
    className?: string;
}

type Token = { text: string; cls: string };

function tokenize(json: string): Token[] {
    const out: Token[] = [];
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let last = 0;
    for (let m = re.exec(json); m; m = re.exec(json)) {
        if (m.index > last) out.push({ text: json.slice(last, m.index), cls: 'text-ink-3' });
        if (m[1] && m[2]) {
            out.push({ text: m[1], cls: 'text-ink' });
            out.push({ text: m[2], cls: 'text-ink-3' });
        } else if (m[1]) {
            out.push({ text: m[1], cls: 'text-blueprint' });
        } else if (m[3]) {
            out.push({ text: m[3], cls: 'text-ignite' });
        } else {
            out.push({ text: m[0], cls: 'text-go' });
        }
        last = re.lastIndex;
    }
    if (last < json.length) out.push({ text: json.slice(last), cls: 'text-ink-3' });
    return out;
}

export default function PayloadView({ payload, className }: PayloadViewProps) {
    const [copied, setCopied] = useState(false);
    if (payload === null || payload === undefined) {
        return <p className="font-mono text-[12px] text-ink-3">No payload recorded.</p>;
    }
    const json = JSON.stringify(payload, null, 2);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className={`relative rounded border border-rule bg-paper-deep/50 ${className ?? ''}`}>
            <button
                type="button"
                onClick={copy}
                className="absolute right-2 top-2 inline-flex h-7 items-center gap-1.5 rounded-sm border border-rule-strong bg-card px-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-2 hover:text-ink"
            >
                {copied ? <Check size={12} className="text-go" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
            </button>
            <pre className="scrollbar-thin max-h-80 overflow-auto px-4 py-3 pr-20 font-mono text-[12px] leading-[1.6]">
                {tokenize(json).map((t, i) => (
                    <span key={i} className={t.cls}>
                        {t.text}
                    </span>
                ))}
            </pre>
        </div>
    );
}
