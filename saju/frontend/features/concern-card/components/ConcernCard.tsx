import { SERIF } from '@saju/shared/ui/sajuTokens';
import { OhLineIcon } from './OhLineIcon';
import { OH_VISUAL, type Oh } from '../lib/ohVisual';

interface Props {
  oh: Oh;
  categoryLabel: string;
  lines: [string, string];
}

export function ConcernCard({ oh, categoryLabel, lines }: Props) {
  const visual = OH_VISUAL[oh];

  return (
    <div
      className="rounded-[24px] px-6 pt-6 pb-7 flex flex-col items-center text-center aspect-[3/4]"
      style={{ background: visual.bg }}
    >
      <span
        className="rounded-full px-3 py-1 text-[11px] font-semibold"
        style={{ border: `1px solid ${visual.line}55`, color: visual.line }}
      >
        {categoryLabel}
      </span>

      <div className="flex-1 flex items-center justify-center" style={{ color: visual.line }}>
        <OhLineIcon oh={oh} size={64} />
      </div>

      <div className="w-10 h-px mb-4" style={{ background: `${visual.line}44` }} />

      <p className="text-[15px] font-bold leading-relaxed" style={{ color: '#2A2A28' }}>
        {lines[0]}
        <br />
        {lines[1]}
      </p>

      <span
        className="mt-5 text-[15px] font-black"
        style={{ color: visual.line, fontFamily: SERIF }}
      >
        {visual.hanja}
      </span>
    </div>
  );
}
