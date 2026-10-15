import { STAGES } from './pipeline';

export interface Pt {
    x: number;
    y: number;
}

export const VIEW = { w: 1040, h: 372 };
export const LEFT = { x: 20, w: 156 };
export const GATEWAY = { x: LEFT.x, y: 20, w: LEFT.w, h: 50 };
export const CORE = { x: LEFT.x, y: 108, w: LEFT.w, h: 64 };
export const BUS_Y = 140;
export const BUS_END = 1020;
export const BOX = { y: 212, w: 140, h: 80, first: 196, pitch: 170 };
export const DLX_Y = 346;

export const boxX = (i: number) => BOX.first + i * BOX.pitch;
export const boxCx = (i: number) => boxX(i) + BOX.w / 2;

export type Hop = number | 'gateway' | { dead: number };

const CORE_RIGHT = CORE.x + CORE.w;

export function hopPoints(hop: Hop): Pt[] {
    if (hop === 'gateway') {
        const cx = GATEWAY.x + GATEWAY.w / 2;
        return [
            { x: cx, y: GATEWAY.y + GATEWAY.h },
            { x: cx, y: CORE.y },
        ];
    }
    if (typeof hop === 'object') {
        const cx = boxCx(hop.dead);
        return [
            { x: cx, y: BOX.y + BOX.h },
            { x: cx, y: DLX_Y },
            { x: CORE_RIGHT, y: DLX_Y },
        ];
    }
    if (hop === 0) {
        return [
            { x: CORE_RIGHT, y: BUS_Y },
            { x: boxCx(0), y: BUS_Y },
            { x: boxCx(0), y: BOX.y },
        ];
    }
    const from = boxCx(hop - 1);
    if (hop >= STAGES.length) {
        return [
            { x: from, y: BOX.y },
            { x: from, y: BUS_Y },
            { x: CORE_RIGHT, y: BUS_Y },
        ];
    }
    const to = boxCx(hop);
    return [
        { x: from, y: BOX.y },
        { x: from, y: BUS_Y },
        { x: to, y: BUS_Y },
        { x: to, y: BOX.y },
    ];
}

export function hopKey(hop: Hop): string {
    if (hop === 'gateway') return 'POST /tenants';
    if (typeof hop === 'object') return STAGES[hop.dead].deadLetterKey;
    if (hop === 0) return 'tenant.requested';
    return STAGES[hop - 1].emits;
}

export interface Keyframes {
    x: number[];
    y: number[];
    times: number[];
    duration: number;
}

const SPEED = 0.42;

export function keyframes(points: Pt[], speed = SPEED): Keyframes {
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const times = [0, ...lengths.map((l) => (acc += l) / total)];
    return {
        x: points.map((p) => p.x),
        y: points.map((p) => p.y),
        times,
        duration: Math.max(0.35, total / speed / 1000),
    };
}

export function hopDurationMs(hop: Hop) {
    return keyframes(hopPoints(hop)).duration * 1000;
}
