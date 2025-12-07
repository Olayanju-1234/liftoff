import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface PayloadModalProps {
    isOpen: boolean;
    title: string;
    payload: Record<string, unknown> | null;
    onClose: () => void;
}

export default function PayloadModal({ isOpen, title, payload, onClose }: PayloadModalProps) {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const formattedPayload = JSON.stringify(payload, null, 2);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(formattedPayload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-2xl rounded-xl border border-border shadow-lg overflow-hidden max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
                        >
                            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-4 overflow-auto flex-1">
                    {payload ? (
                        <pre className="text-sm font-mono bg-muted/50 p-4 rounded-lg overflow-x-auto">
                            {formattedPayload}
                        </pre>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">No payload data available</p>
                    )}
                </div>
            </div>
        </div>
    );
}
