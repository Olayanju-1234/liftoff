import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import Schematic from './Schematic';
import type { BoxView, CoreView, PacketView } from './Schematic';
import { DLX, STAGES } from '../../lib/pipeline';
import { hopDurationMs, hopKey } from '../../lib/schematic';
import type { Hop } from '../../lib/schematic';
import { fmtDuration } from '../../lib/time';
import { cn } from '../../lib/cn';
import { Segmented } from '../ui/Field';
import { Tag } from '../ui/Tag';
import type { Tone } from '../../lib/ui';
import { TONE_TEXT } from '../../lib/ui';

type Mode = 'auto' | 'none' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

interface LogLine {
    id: number;
    at: string;
    key: string;
    text: string;
    tone: Tone;
}

interface DemoState {
    run: number;
    tenant: string;
    phase: 'running' | 'active' | 'stalled' | 'cancelled';
    boxes: BoxView[];
    core: CoreView;
    packets: PacketView[];
    log: LogLine[];
    gateway: boolean;
    dlxNote?: string;
}

const TENANTS = ['acme', 'globex', 'initech', 'umbrella', 'hooli', 'wonka', 'soylent'];
const VISUAL_MS = [900, 1900, 700, 1300, 900];

const idle = (): BoxView[] => STAGES.map(() => ({ tone: 'idle' }));

function fresh(run: number): DemoState {
    const tenant = TENANTS[run % TENANTS.length];
    return {
        run,
        tenant,
        phase: 'running',
        boxes: idle(),
        core: { tone: 'idle', line: 'waiting for a signup' },
        packets: [],
        log: [],
        gateway: false,
    };
}

function failStageFor(mode: Mode, run: number) {
    if (mode === 'none') return -1;
    if (mode === 'auto') return run % 3 === 2 ? (Math.floor(run / 3) * 2 + 1) % STAGES.length : -1;
    return Number(mode.slice(1)) - 1;
}

const fmtT = (ms: number) => `T+${(ms / 1000).toFixed(3)}`;

export default function DemoSequence() {
    const reduced = useReducedMotion() ?? false;
    const [mode, setMode] = useState<Mode>('auto');
    const [nonce, setNonce] = useState(0);
    const [s, setS] = useState<DemoState>(() => fresh(0));

    useEffect(() => {
        let alive = true;
        const timers: number[] = [];
        let lineId = 0;
        const wait = (ms: number) =>
            new Promise<void>((resolve) => {
                timers.push(window.setTimeout(resolve, ms));
            });
        const log = (at: string, key: string, text: string, tone: Tone) => {
            lineId += 1;
            const line = { id: lineId, at, key, text, tone };
            setS((prev) => ({ ...prev, log: [...prev.log, line].slice(-7) }));
        };
        const box = (i: number, view: BoxView) =>
            setS((prev) => ({ ...prev, boxes: prev.boxes.map((b, j) => (j === i ? view : b)) }));
        const send = async (hop: Hop, id: string) => {
            setS((prev) => ({ ...prev, packets: [...prev.packets, { id, hop }] }));
            await wait(hopDurationMs(hop) + 40);
            setS((prev) => ({ ...prev, packets: prev.packets.filter((p) => p.id !== id) }));
        };

        const play = async () => {
            let run = 0;
            while (alive) {
                await wait(reduced ? 300 : 500);
                if (!alive) return;
                const start = fresh(run);
                const name = start.tenant;
                const failAt = failStageFor(mode, run);
                let sim = 0;
                setS(start);

                setS((prev) => ({ ...prev, gateway: true }));
                log(fmtT(sim), 'POST /tenants', `api-gateway → tenant-service`, 'ink');
                await send('gateway', `${run}-gw`);
                if (!alive) return;
                sim += 9;
                setS((prev) => ({ ...prev, gateway: false, core: { tone: 'run', line: 'PROVISIONING', sub: `tenant ${name}` } }));

                let failed = false;
                for (let i = 0; i < STAGES.length; i += 1) {
                    const stage = STAGES[i];
                    sim += 3;
                    log(fmtT(sim), hopKey(i), `→ ${stage.queue}`, 'ignite');
                    await send(i, `${run}-${i}`);
                    if (!alive) return;
                    box(i, { tone: 'run', badge: 'IN FLIGHT' });

                    if (i === failAt) {
                        await wait(VISUAL_MS[i] * 0.7);
                        if (!alive) return;
                        sim += Math.round(stage.typicalMs * 0.6);
                        box(i, { tone: 'fail', badge: 'NACK', dlq: true });
                        log(fmtT(sim), 'Nack(requeue=false)', `${stage.service} → ${DLX} [${stage.deadLetterKey}]`, 'abort');
                        await send({ dead: i }, `${run}-dead`);
                        if (!alive) return;
                        box(i, { tone: 'stall', badge: 'IN_PROGRESS', dlq: true });
                        setS((prev) => ({
                            ...prev,
                            phase: 'stalled',
                            dlxNote: '1 message dead-lettered',
                            core: { tone: 'stall', line: 'STEP STUCK', sub: `tenant ${name}` },
                        }));
                        await wait(1500);
                        if (!alive) return;
                        log('T+60 s', 'no progress', `dashboard flags ${stage.code} ${stage.short} as STALLED`, 'hold');
                        box(i, { tone: 'stall', badge: 'STALLED', meta: '60 s quiet', dlq: true });
                        await wait(1900);
                        if (!alive) return;
                        log('T+30 min', 'sweeper', 'Provisioning timeout · unfinished steps CANCELLED', 'scrub');
                        setS((prev) => ({
                            ...prev,
                            phase: 'cancelled',
                            core: { tone: 'cancel', line: 'CANCELLED', sub: `tenant ${name}` },
                            boxes: prev.boxes.map((b, j) => (j >= i ? { tone: 'cancel', badge: 'CANCELLED', dlq: j === i } : b)),
                        }));
                        failed = true;
                        break;
                    }

                    await wait(VISUAL_MS[i]);
                    if (!alive) return;
                    sim += stage.typicalMs;
                    box(i, { tone: 'ok', badge: 'DONE', meta: fmtDuration(stage.typicalMs) });
                    if (i < STAGES.length - 1) continue;
                    sim += 4;
                    log(fmtT(sim), stage.emits, '→ tenant-service · status ACTIVE', 'go');
                    await send(STAGES.length, `${run}-done`);
                    if (!alive) return;
                    setS((prev) => ({ ...prev, phase: 'active', core: { tone: 'go', line: 'ACTIVE', sub: `tenant ${name}` } }));
                }

                await wait(failed ? 3400 : 2800);
                run += 1;
            }
        };

        void play();
        return () => {
            alive = false;
            timers.forEach((t) => window.clearTimeout(t));
        };
    }, [mode, nonce, reduced]);

    const phaseTag: Record<DemoState['phase'], { tone: Tone; label: string; live?: boolean }> = {
        running: { tone: 'ignite', label: 'Provisioning', live: true },
        active: { tone: 'go', label: 'Active' },
        stalled: { tone: 'hold', label: 'Stalled' },
        cancelled: { tone: 'scrub', label: 'Cancelled' },
    };
    const tag = phaseTag[s.phase];

    return (
        <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                    <span className="label">Run {String(s.run + 1).padStart(2, '0')}</span>
                    <span className="font-mono text-[13px] font-medium text-ink">{s.tenant}</span>
                    <Tag tone={tag.tone} live={tag.live}>
                        {tag.label}
                    </Tag>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span className="label hidden sm:inline">Inject failure</span>
                    <Segmented<Mode>
                        label="Inject a failure"
                        value={mode}
                        onChange={(m) => {
                            setMode(m);
                            setNonce((n) => n + 1);
                        }}
                        options={[
                            { value: 'auto', label: 'Auto' },
                            { value: 'none', label: 'None' },
                            ...STAGES.map((st) => ({ value: st.code as Mode, label: st.short })),
                        ]}
                    />
                    <button
                        type="button"
                        onClick={() => setNonce((n) => n + 1)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded border border-rule-strong bg-card text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                        aria-label="Restart the demo"
                        title="Restart"
                    >
                        <RotateCcw size={15} />
                    </button>
                </div>
            </div>

            <div className="scrollbar-thin overflow-x-auto">
                <div className="min-w-[780px] px-3 pb-2 pt-4 sm:px-5">
                    <Schematic
                        boxes={s.boxes}
                        core={s.core}
                        packets={s.packets}
                        reduced={reduced}
                        gatewayActive={s.gateway}
                        dlxNote={s.dlxNote}
                    />
                </div>
            </div>

            <div className="border-t border-rule bg-paper-deep/60">
                <div className="flex items-center justify-between px-4 pt-3 sm:px-5">
                    <span className="label">Broker log</span>
                    <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">typical timings · animation slowed</span>
                </div>
                <ol className="min-h-[178px] px-4 pb-3 pt-2 font-mono text-[12px] leading-[22px] sm:px-5" aria-live="polite">
                    {s.log.map((line) => (
                        <li
                            key={`${s.run}-${line.id}`}
                            className="anim-row-in grid grid-cols-[68px_minmax(0,1fr)] gap-x-3 rounded-sm px-1 sm:grid-cols-[68px_220px_minmax(0,1fr)]"
                        >
                            <span className="num text-ink-3">{line.at}</span>
                            <span className={cn('truncate font-medium', TONE_TEXT[line.tone])}>{line.key}</span>
                            <span className="col-start-2 truncate text-ink-2 sm:col-start-auto">{line.text}</span>
                        </li>
                    ))}
                    {s.log.length === 0 && <li className="px-1 text-ink-3">waiting for a signup…</li>}
                </ol>
            </div>
        </div>
    );
}
