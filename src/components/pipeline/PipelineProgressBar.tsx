import { cn } from '@/lib/utils';
import type { PipelineStatus } from '@/types/pipeline';
import { getStageNumber } from '@/types/pipeline';
import { Check, Building2, FolderOpen, Compass, Lightbulb, FileText, Rocket } from 'lucide-react';

const STEPS = [
  { label: 'Setup', icon: Building2, stage: 0 },
  { label: 'Vault', icon: FolderOpen, stage: 1 },
  { label: 'Sector', icon: Compass, stage: 2 },
  { label: 'Thesis', icon: Lightbulb, stage: 3 },
  { label: 'Report', icon: FileText, stage: 4 },
  { label: 'Published', icon: Rocket, stage: 5 },
];

interface PipelineProgressBarProps {
  status: PipelineStatus;
  className?: string;
  /** If provided, clicking a completed/active step calls this */
  onStepClick?: (stage: number) => void;
}

export default function PipelineProgressBar({ status, className, onStepClick }: PipelineProgressBarProps) {
  const currentStage = getStageNumber(status);

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop: horizontal stepper */}
      <div className="hidden sm:flex items-center">
        {STEPS.map((step, i) => {
          const isCompleted = currentStage > step.stage;
          const isCurrent = currentStage === step.stage;
          const isLast = i === STEPS.length - 1;
          const isClickable = (isCompleted || isCurrent) && !!onStepClick;
          const Icon = step.icon;

          return (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.stage)}
                disabled={!isClickable}
                className={cn(
                  'flex flex-col items-center gap-2 group transition-all',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-default',
                )}
              >
                <div
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300',
                    isCompleted && 'bg-accent-600 text-white shadow-sm shadow-accent-200',
                    isCurrent && 'bg-accent-50 text-accent-700 ring-2 ring-accent-500/30',
                    !isCompleted && !isCurrent && 'bg-neutral-100 text-neutral-400',
                    isClickable && !isCompleted && 'group-hover:bg-accent-100 group-hover:text-accent-600',
                    isClickable && isCompleted && 'group-hover:bg-accent-700',
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  {isCurrent && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-4 rounded-full bg-accent-500" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold tracking-wide uppercase transition-colors',
                    isCurrent && 'text-accent-700',
                    isCompleted && 'text-neutral-600',
                    !isCompleted && !isCurrent && 'text-neutral-400',
                  )}
                >
                  {step.label}
                </span>
              </button>

              {!isLast && (
                <div className="flex-1 mx-2 mb-5">
                  <div className={cn(
                    'h-[2px] w-full rounded-full transition-colors duration-500',
                    isCompleted ? 'bg-accent-400' : 'bg-neutral-200',
                  )} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: compact pill stepper */}
      <div className="flex sm:hidden items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((step) => {
          const isCompleted = currentStage > step.stage;
          const isCurrent = currentStage === step.stage;
          const Icon = step.icon;

          return (
            <button
              key={step.label}
              type="button"
              onClick={() => (isCompleted || isCurrent) && onStepClick?.(step.stage)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-all',
                isCompleted && 'bg-accent-50 text-accent-700',
                isCurrent && 'bg-accent-600 text-white shadow-sm',
                !isCompleted && !isCurrent && 'bg-neutral-100 text-neutral-400',
              )}
            >
              {isCompleted ? (
                <Check className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
