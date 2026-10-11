import { ReactNode } from 'react';

interface CropSliderProps {
  label: string;
  icon?: ReactNode;
  min: number;
  max: number;
  value: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  /** Called when a change is committed (slider released, +/- pressed) — used for undo snapshots. */
  onMouseUp?: () => void;
  accentClass?: string;
}

export default function CropSlider({
  label,
  icon,
  min,
  max,
  value,
  step = 1,
  suffix = '%',
  onChange,
  onMouseUp,
  accentClass = 'accent-accent-app',
}: CropSliderProps) {
  const nudge = (dir: 1 | -1) => {
    onChange(Math.min(max, Math.max(min, Math.round((value + dir * step) / step) * step)));
    onMouseUp?.();
  };
  const shown = Number.isInteger(step) ? Math.round(value) : value.toFixed(1);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-secondary">
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          {label}
        </span>
        <span className="text-[13px] font-medium tabular-nums text-text-primary">
          {shown}
          {suffix}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(-1)}
          className="w-8 h-8 rounded-md border border-border-app bg-card-app hover:bg-panel-app text-text-primary flex items-center justify-center text-[16px] leading-none shrink-0 cursor-pointer"
        >
          −
        </button>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onMouseUp}
          onKeyUp={onMouseUp}
          className={`flex-1 min-w-0 cursor-pointer ${accentClass}`}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => nudge(1)}
          className="w-8 h-8 rounded-md border border-border-app bg-card-app hover:bg-panel-app text-text-primary flex items-center justify-center text-[16px] leading-none shrink-0 cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}
