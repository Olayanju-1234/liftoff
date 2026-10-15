import type { ReactNode } from 'react';

interface PageHeaderProps {
    sheet: string;
    eyebrow: string;
    title: ReactNode;
    lede?: ReactNode;
    actions?: ReactNode;
    aside?: ReactNode;
}

export default function PageHeader({ sheet, eyebrow, title, lede, actions, aside }: PageHeaderProps) {
    return (
        <header className="mb-7 border-b-2 border-ink pb-5">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <div className="min-w-0 flex-1 basis-full md:basis-0">
                    <p className="label mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
                        <span className="text-ink">Sheet {sheet}</span>
                        <span aria-hidden className="h-px w-6 bg-rule-strong" />
                        <span>{eyebrow}</span>
                    </p>
                    <h1 className="font-cond text-[38px] font-semibold leading-[0.95] tracking-[-0.01em] text-ink sm:text-[46px]">
                        {title}
                    </h1>
                    {lede && <p className="mt-3 max-w-2xl text-[15px] text-ink-2">{lede}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {aside && <div className="mt-4">{aside}</div>}
        </header>
    );
}
