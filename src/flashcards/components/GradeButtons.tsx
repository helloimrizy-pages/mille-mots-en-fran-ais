import { cn } from '@/lib/utils';
import { formatInterval, type IntervalPreview } from '../fsrs';
import type { Grade } from '../types';

interface Props {
  preview: IntervalPreview;
  onGrade: (grade: Grade) => void;
  highlight?: Grade | null;
}

const CONFIG: Array<{ grade: Grade; label: string; className: string; hint: string }> = [
  { grade: 1, label: 'Again', hint: '1', className: 'bg-red-500/90 hover:bg-red-500 text-white' },
  { grade: 2, label: 'Hard',  hint: '2', className: 'bg-amber-500/90 hover:bg-amber-500 text-white' },
  { grade: 3, label: 'Good',  hint: '3', className: 'bg-emerald-500/90 hover:bg-emerald-500 text-white' },
  { grade: 4, label: 'Easy',  hint: '4', className: 'bg-sky-500/90 hover:bg-sky-500 text-white' },
];

export function GradeButtons({ preview, onGrade, highlight }: Props) {
  const intervals: Record<Grade, number> = {
    1: preview.again, 2: preview.hard, 3: preview.good, 4: preview.easy,
  };
  return (
    <div className="grid grid-cols-4 gap-2">
      {CONFIG.map(({ grade, label, hint, className }) => (
        <button
          key={grade}
          type="button"
          onClick={() => onGrade(grade)}
          className={cn(
            'flex flex-col items-center justify-center py-3 px-2 rounded-md font-medium text-sm transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
            className,
            highlight === grade && 'ring-2 ring-white',
          )}
          aria-label={`${label} — press ${hint}`}
        >
          <span>{label}</span>
          <span className="text-[11px] opacity-80 mt-0.5">{formatInterval(intervals[grade])}</span>
        </button>
      ))}
    </div>
  );
}
