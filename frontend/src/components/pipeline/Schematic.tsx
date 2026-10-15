import { useId } from 'react';
import { motion } from 'framer-motion';
import { STAGES, EXCHANGE, DLX } from '../../lib/pipeline';
import {
    BOX,
    BUS_END,
    BUS_Y,
    CORE,
    DLX_Y,
    GATEWAY,
    VIEW,
    boxCx,
    boxX,
    hopKey,
    hopPoints,
    keyframes,
} from '../../lib/schematic';
import type { Hop } from '../../lib/schematic';

export type BoxTone = 'idle' | 'run' | 'ok' | 'go' | 'stall' | 'fail' | 'cancel';

export interface BoxView {
    tone: BoxTone;
    badge?: string;
    meta?: string;
    dlq?: boolean;
}

export interface CoreView {
    tone: BoxTone;
    line: string;
    sub?: string;
}

export interface PacketView {
    id: string;
    hop: Hop;
    label?: string;
    delay?: number;
}

interface SchematicProps {
    boxes: BoxView[];
    core: CoreView;
    dlxNote?: string;
    packets?: PacketView[];
    onPacketDone?: (id: string) => void;
    reduced?: boolean;
    gatewayActive?: boolean;
}

const RECT_TONE: Record<BoxTone, string> = {
    idle: 'fill-card stroke-rule-strong',
    run: 'fill-card stroke-ignite anim-svg-dash',
    ok: 'fill-card stroke-ink',
    go: 'fill-go/[0.06] stroke-go',
    stall: 'fill-hold/[0.07] stroke-hold',
    fail: 'fill-abort/[0.06] stroke-abort',
    cancel: 'fill-card stroke-scrub',
};

const SQUARE_TONE: Record<BoxTone, string> = {
    idle: 'fill-card stroke-rule-strong',
    run: 'fill-ignite stroke-ignite',
    ok: 'fill-ink stroke-ink',
    go: 'fill-go stroke-go',
    stall: 'fill-hold stroke-hold',
    fail: 'fill-abort stroke-abort',
    cancel: 'fill-card stroke-scrub',
};

const TEXT_TONE: Record<BoxTone, string> = {
    idle: 'fill-ink-3',
    run: 'fill-ignite',
    ok: 'fill-ink-2',
    go: 'fill-go',
    stall: 'fill-hold',
    fail: 'fill-abort',
    cancel: 'fill-scrub',
};

const CHAR_W = 6.05;
const clip = (s: string, max = 21) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export default function Schematic({
    boxes,
    core,
    dlxNote,
    packets = [],
    onPacketDone,
    reduced = false,
    gatewayActive = false,
}: SchematicProps) {
    const uid = useId().replace(/:/g, '');
    const hatchId = `hatch-${uid}`;
    const arrowId = `arrow-${uid}`;
    const coreRight = CORE.x + CORE.w;
    const gwCx = GATEWAY.x + GATEWAY.w / 2;
    const dlqActive = boxes.some((b) => b.dlq);

    return (
        <svg
            viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
            className="block h-auto w-full select-none"
            role="img"
            aria-label="Provisioning saga: api-gateway hands the request to tenant-service, which publishes tenant.requested on the provisioning.direct exchange. Five workers consume and re-publish in turn; rejected messages are dead-lettered to dlx.provisioning."
        >
            <defs>
                <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="5" className="stroke-scrub" strokeWidth="1.3" opacity="0.5" />
                </pattern>
                <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 z" className="fill-ink-2" />
                </marker>
            </defs>

            {/* Gateway */}
            <rect
                x={GATEWAY.x}
                y={GATEWAY.y}
                width={GATEWAY.w}
                height={GATEWAY.h}
                rx="3"
                className={gatewayActive ? 'fill-card stroke-ignite' : 'fill-card stroke-ink-2'}
                strokeWidth="1.2"
            />
            <text x={GATEWAY.x + 12} y={GATEWAY.y + 21} className="fill-ink font-mono text-[12.5px] font-medium">
                api-gateway
            </text>
            <text x={GATEWAY.x + 12} y={GATEWAY.y + 37} className="fill-ink-3 font-mono text-[9.5px]">
                POST /tenants
            </text>
            <line
                x1={gwCx}
                y1={GATEWAY.y + GATEWAY.h}
                x2={gwCx}
                y2={CORE.y - 2}
                className="stroke-ink-2"
                strokeWidth="1.2"
                markerEnd={`url(#${arrowId})`}
            />

            {/* tenant-service */}
            <rect
                x={CORE.x}
                y={CORE.y}
                width={CORE.w}
                height={CORE.h}
                rx="3"
                className={RECT_TONE[core.tone === 'run' ? 'ok' : core.tone]}
                strokeWidth="1.5"
            />
            {core.tone === 'cancel' && (
                <rect x={CORE.x} y={CORE.y} width={CORE.w} height={CORE.h} rx="3" fill={`url(#${hatchId})`} />
            )}
            <text x={CORE.x + 12} y={CORE.y + 21} className="fill-ink font-mono text-[12.5px] font-medium">
                tenant-service
            </text>
            <text x={CORE.x + 12} y={CORE.y + 38} className={`${TEXT_TONE[core.tone]} font-mono text-[10px] font-medium`}>
                {clip(core.line)}
            </text>
            <text x={CORE.x + 12} y={CORE.y + 53} className="fill-ink-3 font-mono text-[9px]">
                {clip(core.sub ?? 'saga state · sweeper')}
            </text>

            {/* Exchange bus */}
            <line x1={coreRight} y1={BUS_Y} x2={BUS_END} y2={BUS_Y} className="stroke-ink" strokeWidth="3" />
            <line x1={BUS_END} y1={BUS_Y - 7} x2={BUS_END} y2={BUS_Y + 7} className="stroke-ink" strokeWidth="2" />
            <text x={BUS_END} y={BUS_Y - 44} textAnchor="end" className="fill-ink-3 font-mono text-[9px] tracking-[0.1em]">
                EXCHANGE · DIRECT · DURABLE
            </text>
            <text x={BUS_END} y={BUS_Y - 28} textAnchor="end" className="fill-blueprint font-mono text-[12px] font-medium">
                {EXCHANGE}
            </text>
            <text x={coreRight + 10} y={BUS_Y - 41} className="fill-ink-3 font-mono text-[9px]">
                publishes tenant.requested ▸
            </text>
            <text x={coreRight + 10} y={BUS_Y - 28} className="fill-ink-3 font-mono text-[9px]">
                ◂ consumes every *.ready, provisioning.complete
            </text>

            {/* Workers */}
            {STAGES.map((stage, i) => {
                const b = boxes[i] ?? { tone: 'idle' as const };
                const x = boxX(i);
                const cx = boxCx(i);
                const tagW = stage.consumes.length * CHAR_W + 14;
                const dlqW = stage.deadLetterKey.length * CHAR_W + 14;
                return (
                    <g key={stage.key}>
                        <line
                            x1={cx}
                            y1={BUS_Y}
                            x2={cx}
                            y2={BOX.y}
                            className={b.tone === 'run' ? 'stroke-ignite anim-svg-dash' : 'stroke-ink-2'}
                            strokeWidth="1.3"
                            strokeDasharray={b.tone === 'run' ? '4 4' : undefined}
                        />
                        <circle cx={cx} cy={BUS_Y} r="3.6" className="fill-ink" />
                        <rect x={cx - tagW / 2} y={168} width={tagW} height={17} rx="2" className="fill-paper stroke-rule-strong" strokeWidth="1" />
                        <text x={cx} y={180} textAnchor="middle" className="fill-ink-2 font-mono text-[10px]">
                            {stage.consumes}
                        </text>

                        <line
                            x1={cx}
                            y1={BOX.y + BOX.h}
                            x2={cx}
                            y2={DLX_Y}
                            className={b.dlq ? 'stroke-abort' : 'stroke-abort/35'}
                            strokeWidth={b.dlq ? 1.5 : 1}
                            strokeDasharray="3 3"
                        />
                        <circle cx={cx} cy={DLX_Y} r="2.6" className={b.dlq ? 'fill-abort' : 'fill-abort/40'} />

                        <rect
                            x={x}
                            y={BOX.y}
                            width={BOX.w}
                            height={BOX.h}
                            rx="3"
                            className={RECT_TONE[b.tone]}
                            strokeWidth={b.tone === 'idle' ? 1 : 1.6}
                            strokeDasharray={b.tone === 'run' ? '5 3' : undefined}
                        />
                        {b.tone === 'cancel' && (
                            <rect x={x} y={BOX.y} width={BOX.w} height={BOX.h} rx="3" fill={`url(#${hatchId})`} />
                        )}
                        <rect x={x + 10} y={BOX.y + 11} width="8" height="8" className={SQUARE_TONE[b.tone]} strokeWidth="1" />
                        {b.tone === 'cancel' && <rect x={x + 10} y={BOX.y + 11} width="8" height="8" fill={`url(#${hatchId})`} />}
                        <text x={x + 25} y={BOX.y + 19} className="fill-ink-2 font-mark text-[9px] tracking-[0.12em]">
                            {stage.code}
                        </text>
                        {b.badge && (
                            <text
                                x={x + BOX.w - 10}
                                y={BOX.y + 19}
                                textAnchor="end"
                                className={`${TEXT_TONE[b.tone]} font-mono text-[9px] font-medium tracking-[0.06em]`}
                            >
                                {b.badge}
                            </text>
                        )}
                        <text x={x + 10} y={BOX.y + 44} className="fill-ink font-mono text-[12.5px] font-medium">
                            {stage.service}
                        </text>
                        <text x={x + 10} y={BOX.y + 64} className="fill-ink-3 font-mono text-[9px] tracking-[0.06em]">
                            {stage.action}
                        </text>
                        {b.meta && (
                            <text
                                x={x + BOX.w - 10}
                                y={BOX.y + 64}
                                textAnchor="end"
                                className={`${TEXT_TONE[b.tone]} num font-mono text-[10px] font-medium`}
                            >
                                {b.meta}
                            </text>
                        )}

                        {b.dlq && (
                            <g>
                                <rect x={cx + 6} y={311} width={dlqW} height={16} rx="2" className="fill-paper stroke-abort/60" strokeWidth="1" />
                                <text x={cx + 13} y={322} className="fill-abort font-mono text-[9.5px] font-medium">
                                    {stage.deadLetterKey}
                                </text>
                            </g>
                        )}
                    </g>
                );
            })}

            {/* Dead-letter exchange */}
            <line
                x1={coreRight}
                y1={DLX_Y}
                x2={BUS_END}
                y2={DLX_Y}
                className={dlqActive ? 'stroke-abort' : 'stroke-abort/50'}
                strokeWidth="1.6"
                strokeDasharray="7 4"
            />
            <text x={CORE.x} y={DLX_Y - 3} className="fill-abort font-mono text-[11.5px] font-medium">
                {DLX}
            </text>
            <text x={CORE.x} y={DLX_Y + 12} className="fill-ink-3 font-mono text-[9px]">
                dead-letter exchange
            </text>
            {dlxNote && (
                <text x={CORE.x} y={DLX_Y + 25} className="fill-hold font-mono text-[9px] font-medium">
                    {dlxNote}
                </text>
            )}

            {!reduced &&
                packets.map((p) => <Packet key={p.id} packet={p} onDone={onPacketDone} />)}
        </svg>
    );
}

function Packet({ packet, onDone }: { packet: PacketView; onDone?: (id: string) => void }) {
    const kf = keyframes(hopPoints(packet.hop));
    const dead = typeof packet.hop === 'object';
    const delay = (packet.delay ?? 0) / 1000;
    const label = packet.label ?? hopKey(packet.hop);
    const move = { duration: kf.duration, times: kf.times, ease: 'linear' as const, delay };
    return (
        <motion.g
            initial={{ x: kf.x[0], y: kf.y[0], opacity: 0 }}
            animate={{ x: kf.x, y: kf.y, opacity: 1 }}
            transition={{ x: move, y: move, opacity: { duration: 0.15, delay } }}
            onAnimationComplete={() => onDone?.(packet.id)}
        >
            <circle r="9" className={dead ? 'fill-abort/15' : 'fill-ignite/15'} />
            <circle r="5" className={dead ? 'fill-abort stroke-paper' : 'fill-ignite stroke-paper'} strokeWidth="1.8" />
            <motion.text
                y="-12"
                textAnchor="middle"
                className={`${dead ? 'fill-abort' : 'fill-ignite'} font-mono text-[10px] font-medium`}
                stroke="rgb(var(--paper))"
                strokeWidth="3.5"
                style={{ paintOrder: 'stroke' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: kf.duration, times: [0, 0.08, 0.82, 1], delay }}
            >
                {label}
            </motion.text>
        </motion.g>
    );
}
