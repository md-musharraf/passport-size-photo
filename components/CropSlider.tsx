import { ReactNode } from 'react';

interface CropSliderProps {
  label: string;
  icon?: ReactNode;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
  onMouseUp?: () => void;
  accentClass?: string;
}

export default function CropSlider({
  label,
  icon,
  min,
  max,
  value,
  suffix = '%',
  onChange,
  onMouseUp,
  accentClass = 'accent-accent-app'
}: CropSliderProps) {
  return (
    <div className="space-y-1.5 py-1">
      {/* Label styled with app-label (15px, semibold) */}
      <div className="flex items-center gap-2 app-label select-none">
        {icon && <span className="shrink-0 flex items-center justify-center text-text-secondary">{icon}</span>}
        <span>{label}</span>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={() => {
            onChange(Math.max(min, value - 1));
            onMouseUp?.();
          }}
          className="w-9 h-9 rounded-lg bg-card-app hover:bg-panel-app border border-border-app text-text-primary font-bold active:scale-95 flex items-center justify-center text-base shrink-0 select-none cursor-pointer"
        >
          －
        </button>

        {/* Range input */}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseUp={onMouseUp}
          onTouchEnd={onMouseUp}
          className={`flex-1 h-2 rounded-full appearance-none cursor-pointer bg-bg-app ${accentClass}`}
        />

        {/* Increment Button */}
        <button
          type="button"
          onClick={() => {
            onChange(Math.min(max, value + 1));
            onMouseUp?.();
          }}
          className="w-9 h-9 rounded-lg bg-card-app hover:bg-panel-app border border-border-app text-text-primary font-bold active:scale-95 flex items-center justify-center text-base shrink-0 select-none cursor-pointer"
        >
          ＋
        </button>

        {/* Value Display */}
        <span className="w-14 py-1 text-center font-semibold text-[15px] tabular-nums bg-bg-app text-text-primary border border-border-app rounded-lg shrink-0 select-none">
          {Math.round(value)}{suffix}
        </span>
      </div>
    </div>
  );
}
