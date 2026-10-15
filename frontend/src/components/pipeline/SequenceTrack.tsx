import { useId } from 'react';
import { STAGES, stageState } from '../../lib/pipeline';
import type { StageState } from '../../lib/pipeline';
import { STAGE_STATE_META } from '../../lib/ui';
import type { Tenant } from '../../lib/types';

interface SequenceTrackProps {
    tenant: Tenant;
    now: number;
    size?: 'sm' | 'md';
    labels?: boolean;
    className?: string;
}

const GEOM = {
    sm: { n: 10, pitch: 24, pad: 5, font: 8 },
    md: { n: 13, pitch: 36, pad: 7, font: 9 },
};

const NODE_CLASS: Record<StageState, string> = {
    PENDING: 'fill-card stroke-rule-strong',
    IN_PROGRESS: 'fill-ignite stroke-ignite',
    STALLED: 'fill-hold stroke-hold',
    SUCCESS: 'fill-ink stroke-ink',
    FAILED: 'fill-abort stroke-abort',
    CANCELLED: 'fill-card stroke-scrub',
};

type Terminal = 'go' | 'abort' | 'scrub' | 'idle';

export default function SequenceTrack({ tenant, now, size = 'sm', labels = false, className }: SequenceTrackProps) {
    const uid = useId().replace(/:/g, '');
    const g = GEOM[size];
    const states = STAGES.map((s) => stageState(tenant, s, now));
    const terminal: Terminal =
        tenant.status === 'ACTIVE' ? 'go' : tenant.status === 'FAILED' ? 'abort' : tenant.status === 'CANCELLED' ? 'scrub' : 'idle';

    const width = g.pad * 2 + STAGES.length * g.pitch + g.n;
    const height = g.pad * 2 + g.n + (labels ? g.font + 6 : 0);
    const cy = g.pad + g.n / 2;
    const cx = (i: number) => g.pad + g.n / 2 + i * g.pitch;
    const half = g.n / 2;

    const summary = STAGES.map((s, i) => `${s.short} ${STAGE_STATE_META[states[i]].label.toLowerCase()}`).join(', ');

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={className}
            role="img"
            aria-label={`Sequence: ${summary}; tenant ${tenant.status.toLowerCase()}`}
        >
            <defs>
                <pattern id={`h-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="4" className="stroke-scrub" strokeWidth="1.2" opacity="0.7" />
                </pattern>
            </defs>

            {STAGES.map((stage, i) => {
                const left = states[i];
                const right: StageState | Terminal = i < STAGES.length - 1 ? states[i + 1] : terminal;
                let cls = 'stroke-rule-strong';
                let dash: string | undefined = '2 2';
                let animated = false;
                if (left === 'SUCCESS') {
                    if (right === 'IN_PROGRESS') {
                        cls = 'stroke-ignite';
                        dash = '3 3';
                        animated = true;
                    } else if (right === 'STALLED') {
                        cls = 'stroke-hold';
                        dash = undefined;
                    } else if (right === 'SUCCESS' || right === 'FAILED' || right === 'go') {
                        cls = right === 'go' ? 'stroke-go' : 'stroke-ink';
                        dash = undefined;
                    }
                }
                return (
                    <line
                        key={stage.key}
                        x1={cx(i) + half + 1}
                        y1={cy}
                        x2={cx(i + 1) - half - 1}
                        y2={cy}
                        className={`${cls} ${animated ? 'anim-svg-dash' : ''}`}
                        strokeWidth="1.5"
                        strokeDasharray={dash}
                    />
                );
            })}

            {STAGES.map((stage, i) => {
                const state = states[i];
                const x = cx(i) - half;
                return (
                    <g key={stage.key}>
                        <title>{`${stage.code} ${stage.name}: ${STAGE_STATE_META[state].label}`}</title>
                        {state === 'IN_PROGRESS' && (
                            <rect x={x} y={g.pad} width={g.n} height={g.n} className="anim-svg-pulse fill-ignite" />
                        )}
                        <rect
                            x={x + 0.5}
                            y={g.pad + 0.5}
                            width={g.n - 1}
                            height={g.n - 1}
                            rx="1"
                            className={NODE_CLASS[state]}
                            strokeWidth="1"
                        />
                        {state === 'CANCELLED' && (
                            <rect x={x + 0.5} y={g.pad + 0.5} width={g.n - 1} height={g.n - 1} fill={`url(#h-${uid})`} />
                        )}
                        {state === 'FAILED' && (
                            <path
                                d={`M${x + 3} ${g.pad + 3} L${x + g.n - 3} ${g.pad + g.n - 3} M${x + g.n - 3} ${g.pad + 3} L${x + 3} ${g.pad + g.n - 3}`}
                                className="stroke-card"
                                strokeWidth="1.4"
                            />
                        )}
                        {labels && (
                            <text
                                x={cx(i)}
                                y={g.pad * 2 + g.n + g.font}
                                textAnchor="middle"
                                className="fill-ink-3 font-mono"
                                style={{ fontSize: g.font }}
                            >
                                {stage.short}
                            </text>
                        )}
                    </g>
                );
            })}

            <g>
                <title>{tenant.status === 'ACTIVE' ? 'Tenant active' : `Tenant ${tenant.status.toLowerCase()}`}</title>
                {terminal === 'go' && (
                    <circle cx={cx(STAGES.length)} cy={cy} r={half + 2.5} className="fill-none stroke-go/40" strokeWidth="1" />
                )}
                <circle
                    cx={cx(STAGES.length)}
                    cy={cy}
                    r={half - 0.5}
                    className={
                        terminal === 'go'
                            ? 'fill-go stroke-go'
                            : terminal === 'abort'
                              ? 'fill-card stroke-abort'
                              : terminal === 'scrub'
                                ? 'fill-card stroke-scrub'
                                : 'fill-card stroke-rule-strong'
                    }
                    strokeWidth="1.2"
                    strokeDasharray={terminal === 'idle' ? '2 1.5' : undefined}
                />
                {terminal === 'scrub' && <circle cx={cx(STAGES.length)} cy={cy} r={half - 1} fill={`url(#h-${uid})`} />}
                {labels && (
                    <text
                        x={cx(STAGES.length)}
                        y={g.pad * 2 + g.n + g.font}
                        textAnchor="middle"
                        className="fill-ink-3 font-mono"
                        style={{ fontSize: g.font }}
                    >
                        GO
                    </text>
                )}
            </g>
        </svg>
    );
}
