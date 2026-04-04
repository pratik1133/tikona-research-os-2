import type { ReportBlock, BlockContent } from '@/types/report-builder';
import HeadingBlock from './blocks/HeadingBlock';
import TextBlock from './blocks/TextBlock';
import TableBlock from './blocks/TableBlock';
import ChartBlock from './blocks/ChartBlock';
import SentimentBlock from './blocks/SentimentBlock';
import KeyMetricsBlock from './blocks/KeyMetricsBlock';

interface Props {
  block: ReportBlock;
  onChange: (content: BlockContent) => void;
}

export default function BlockRenderer({ block, onChange }: Props) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock content={block.content as any} onChange={onChange as any} />;
    case 'text':
      return <TextBlock content={block.content as any} onChange={onChange as any} />;
    case 'table':
      return <TableBlock content={block.content as any} onChange={onChange as any} />;
    case 'chart':
      return <ChartBlock content={block.content as any} onChange={onChange as any} />;
    case 'sentiment':
      return <SentimentBlock content={block.content as any} onChange={onChange as any} />;
    case 'keyMetrics':
      return <KeyMetricsBlock content={block.content as any} onChange={onChange as any} />;
    default:
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          Unknown block type: {block.type}
        </div>
      );
  }
}
