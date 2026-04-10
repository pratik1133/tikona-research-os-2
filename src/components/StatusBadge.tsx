import type { ResearchSession } from '@/types/database';

const config: Record<ResearchSession['status'], { label: string; className: string; dotColor: string }> = {
  document_review: {
    label: 'Review',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dotColor: 'bg-amber-500',
  },
  drafting: {
    label: 'Drafting',
    className: 'bg-neutral-50 text-neutral-700 ring-neutral-500/20',
    dotColor: 'bg-neutral-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-50 text-green-700 ring-green-600/20',
    dotColor: 'bg-green-500',
  },
};

export default function StatusBadge({ status }: { status: ResearchSession['status'] }) {
  const { label, className, dotColor } = config[status] ?? config.document_review;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  );
}
