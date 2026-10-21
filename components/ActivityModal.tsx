'use client';
import { useState } from 'react';
import { FiActivity, FiBellOff, FiX } from 'react-icons/fi';
import { clearActivity, formatDuration, readActivity, summarize, type ActivityKind } from '@/lib/activity';

const LABELS: Record<ActivityKind, string> = {
  photo: 'Photos opened',
  bg: 'Backgrounds removed',
  export: 'Exports',
  signature: 'Signatures saved',
};

const RECENT_TEXT: Record<ActivityKind, (n: number) => string> = {
  photo: (n) => (n > 1 ? `Opened ${n} photos` : 'Opened a photo'),
  bg: () => 'Removed a background',
  export: () => 'Exported photos',
  signature: () => 'Saved a signature',
};

export default function ActivityModal({ onClose }: { onClose: () => void }) {
  const [log, setLog] = useState(readActivity);
  const [confirmClear, setConfirmClear] = useState(false);
  const { days, today, week, dailyAvgSecs } = summarize(log);
  const maxSecs = Math.max(60, ...days.map((d) => d.secs));

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-background border border-border-app rounded-2xl p-5 sm:p-6 relative text-text-primary"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-border-app text-text-secondary hover:text-text-primary flex items-center justify-center cursor-pointer"
        >
          <FiX className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-10">
          <span className="w-10 h-10 rounded-xl bg-card-app border border-border-app flex items-center justify-center shrink-0">
            <FiActivity className="w-5 h-5" />
          </span>
          <div>
            <h2 id="activity-title" className="text-lg font-semibold tracking-tight">Your activity</h2>
            <p className="text-[12px] text-text-secondary">Last 7 days · stored only on this device</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            ['Today', today.secs],
            ['This week', week.secs],
            ['Daily average', dailyAvgSecs],
          ].map(([label, secs]) => (
            <div key={label} className="rounded-xl bg-card-app border border-border-app p-3">
              <div className="text-[11px] text-text-secondary">{label}</div>
              <div className="text-base sm:text-xl font-semibold tabular-nums whitespace-nowrap">{formatDuration(Number(secs))}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-card-app border border-border-app p-3 mb-5">
          <div className="text-[11px] text-text-secondary mb-2">Time in app per day</div>
          <div className="flex items-end gap-2 h-28">
            {days.map((d, i) => (
              <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                <div
                  className={`w-full rounded-t ${i === 6 ? 'bg-accent-app' : 'bg-text-secondary/40'}`}
                  style={{ height: `${Math.max(2, (d.secs / maxSecs) * 100)}%` }}
                  title={`${d.date.toLocaleDateString(undefined, { weekday: 'long' })}: ${formatDuration(d.secs)}`}
                />
                <span className="text-[10px] text-text-secondary">
                  {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {(Object.keys(LABELS) as ActivityKind[]).map((k) => (
            <div key={k} className="rounded-xl bg-card-app border border-border-app p-3">
              <div className="text-[11px] text-text-secondary">{LABELS[k]}</div>
              <div className="text-lg font-semibold tabular-nums">
                {week[k]} <span className="text-[11px] font-normal text-text-secondary">· {today[k]} today</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <div className="text-[11px] text-text-secondary mb-2">Recent</div>
          {log.recent.length === 0 ? (
            <p className="text-[13px] text-text-secondary">No activity yet.</p>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {log.recent.slice(0, 10).map((r, i) => (
                <li key={`${r.t}-${i}`} className="flex justify-between gap-3">
                  <span>{RECENT_TEXT[r.kind](r.n)}</span>
                  <span className="text-text-secondary tabular-nums shrink-0">
                    {new Date(r.t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-start gap-2 text-[12px] text-text-secondary mb-4">
          <FiBellOff className="w-4 h-4 shrink-0 mt-0.5" />
          Quiet by design: the app only notifies you about errors or things that need your action.
        </p>

        <button
          type="button"
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            clearActivity();
            setLog(readActivity());
            setConfirmClear(false);
          }}
          className="w-full rounded-lg border border-border-app py-2 text-[13px] text-text-secondary hover:text-danger-app hover:border-danger-app/50 cursor-pointer"
        >
          {confirmClear ? 'Tap again to clear all activity' : 'Clear activity history'}
        </button>
      </div>
    </div>
  );
}
