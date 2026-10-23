import { useState } from 'react';
import { Play } from 'lucide-react';
import { DEMO_STEP_LABEL, useStartDemo } from '../../lib/demo';
import type { StepName } from '../../lib/types';
import Button from '../ui/Button';
import { Segmented } from '../ui/Field';

type Choice = 'none' | StepName;

export default function LiveDemoPanel() {
    const { start, busy, error } = useStartDemo();
    const [choice, setChoice] = useState<Choice>('none');

    return (
        <div id="try" className="mt-6 scroll-mt-24 rounded-md border border-ink/70 bg-card p-5 shadow-sheet sm:p-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="label">Fig. 2</span>
                <h3 className="font-cond text-[24px] font-semibold leading-tight">Now run it for real</h3>
            </div>
            <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-ink-2">
                The drawing above is an animation. This button adds a real throwaway customer and sends it through all seven
                services on the live server, and you watch every message land. Make one step fail to see what your team sees when
                something breaks, and how Retry fixes it. No account needed; the customer is removed after 15 minutes.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="label">Make a step fail</span>
                <Segmented<Choice>
                    label="Make a step fail"
                    value={choice}
                    onChange={setChoice}
                    options={[
                        { value: 'none', label: 'Nothing' },
                        ...(Object.keys(DEMO_STEP_LABEL) as StepName[]).map((step) => ({ value: step, label: DEMO_STEP_LABEL[step] })),
                    ]}
                />
                <Button variant="primary" busy={busy} onClick={() => void start(choice === 'none' ? undefined : choice)} className="h-10">
                    {!busy && <Play size={14} />} Start a live run
                </Button>
            </div>
            {error && (
                <p role="alert" className="mt-3 text-[14px] text-abort">
                    {error}
                </p>
            )}
        </div>
    );
}
