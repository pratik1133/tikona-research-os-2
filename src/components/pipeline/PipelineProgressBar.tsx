import { cn } from '@/lib/utils';
import type { PipelineStatus } from '@/types/pipeline';
import { getStageNumber, PIPELINE_STAGE_LABELS } from '@/types/pipeline';
import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Documents', stage: 0 },
  { label: 'Sector Framework', stage: 1 },
  { label: 'Thesis', stage: 2 },
  { label: 'Report', stage: 3 },
  { label: 'Published', stage: 4 },
];

interface PipelineProgressBarProps {
  status: PipelineStatus;
  className?: string;
}

export default function PipelineProgressBar({ status, className }: PipelineProgressBarProps) {
  const currentStage = getStageNumber(status);

  return (
    <div className={cn('w-full', className)}>
      {/* Status label */}
      <p className="text-xs font-medium text-neutral-500 mb-3">
        {PIPELINE_STAGE_LABELS[status]}
      </p>

      {/* Progress steps */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isCompleted = currentStage > step.stage;
          const isCurrent = currentStage === step.stage;
          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all',
                    isCompleted && 'border-accent-600 bg-accent-600 text-white',
                    isCurrent && 'border-accent-600 bg-white text-accent-600 ring-4 ring-accent-100',
                    !isCompleted && !isCurrent && 'border-neutral-200 bg-white text-neutral-400'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step.stage}
                </div>
                <span
                  className={cn(
                    'mt-1.5 text-[10px] font-medium whitespace-nowrap',
                    isCurrent ? 'text-accent-700' : isCompleted ? 'text-neutral-600' : 'text-neutral-400'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 mx-1">
                  <div
                    className={cn(
                      'h-0.5 w-full transition-colors',
                      isCompleted ? 'bg-accent-500' : 'bg-neutral-200'
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
