import type { KeyMetricsContent } from '@/types/report-builder';

interface Props {
  content: KeyMetricsContent;
  onChange: (content: KeyMetricsContent) => void;
}

export default function KeyMetricsBlock({ content, onChange }: Props) {
  const updateMetric = (index: number, field: 'label' | 'value' | 'subtext', val: string) => {
    const updated = content.metrics.map((m, i) =>
      i === index ? { ...m, [field]: val } : m
    );
    onChange({ metrics: updated });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {content.metrics.map((metric, i) => (
        <div
          key={i}
          className="rounded-xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50/50 p-4 hover:shadow-sm transition-shadow"
        >
          <input
            value={metric.label}
            onChange={(e) => updateMetric(i, 'label', e.target.value)}
            className="text-xs font-semibold uppercase tracking-wider text-neutral-400 bg-transparent border-0 outline-none w-full mb-1"
          />
          <input
            value={metric.value}
            onChange={(e) => updateMetric(i, 'value', e.target.value)}
            className="text-lg font-semibold text-neutral-900 tabular-nums bg-transparent border-0 outline-none w-full"
          />
          {metric.subtext !== undefined && (
            <input
              value={metric.subtext || ''}
              onChange={(e) => updateMetric(i, 'subtext', e.target.value)}
              placeholder="subtext"
              className="text-xs text-neutral-500 bg-transparent border-0 outline-none w-full mt-1"
            />
          )}
        </div>
      ))}
    </div>
  );
}
