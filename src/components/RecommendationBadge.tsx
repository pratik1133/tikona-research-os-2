import { cn } from '@/lib/utils';
import { RECOMMENDATION_COLORS, RECOMMENDATION_DEFAULT } from '@/lib/constants';

export default function RecommendationBadge({ recommendation }: { recommendation: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide',
      RECOMMENDATION_COLORS[recommendation] || RECOMMENDATION_DEFAULT
    )}>
      {recommendation}
    </span>
  );
}
