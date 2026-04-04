import { useCallback } from 'react';
import {
  GripVertical, Trash2, RefreshCw, Type, Table2,
  BarChart3, MessageSquare, Hash, ChevronUp, ChevronDown,
} from 'lucide-react';
import type { ReportBlock, BlockType, BlockContent, TemplateQuestion } from '@/types/report-builder';
import BlockRenderer from './BlockRenderer';

interface Props {
  blocks: ReportBlock[];
  onChange: (blocks: ReportBlock[]) => void;
  onRegenerateBlock?: (blockId: string) => void;
  activeBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
}
const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Heading',
  text: 'Text',
  table: 'Table',
  chart: 'Chart',
  sentiment: 'Sentiment',
  keyMetrics: 'Key Metrics',
};

function uid() { return crypto.randomUUID(); }

export default function BlockEditor({ blocks, onChange, onRegenerateBlock, activeBlockId, onSelectBlock }: Props) {
  const updateBlock = useCallback((id: string, content: BlockContent) => {
    onChange(blocks.map(b => b.id === id ? { ...b, content } : b));
  }, [blocks, onChange]);

  const deleteBlock = useCallback((id: string) => {
    onChange(blocks.filter(b => b.id !== id));
    if (activeBlockId === id) onSelectBlock(null);
  }, [blocks, onChange, activeBlockId, onSelectBlock]);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[idx], newBlocks[target]] = [newBlocks[target], newBlocks[idx]];
    onChange(newBlocks);
  }, [blocks, onChange]);

  return (
    <div className="w-full">
      {/* ===== MAIN CANVAS ===== */}
      <div className="w-full pb-16">
        <div className="space-y-4">
          {blocks.map((block) => (
              <div key={block.id} className="relative">
                <div
                  id={`block-${block.id}`}
                  onClick={() => onSelectBlock(block.id)}
                  className={`group relative rounded-xl border bg-white p-5 transition-all ${
                    activeBlockId === block.id
                      ? 'border-accent-400 shadow-sm ring-1 ring-accent-100 z-10'
                      : 'border-neutral-200 hover:border-neutral-300 hover:shadow-xs'
                  }`}
                >
              {/* Block toolbar */}
              <div className="absolute -top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400 font-mono">
                  {BLOCK_LABELS[block.type]}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                  className="h-6 w-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:border-neutral-300"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                  className="h-6 w-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:border-neutral-300"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                {onRegenerateBlock && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRegenerateBlock(block.id); }}
                    className="h-6 w-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-accent-600 hover:border-accent-200"
                    title="Regenerate"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}
                  className="h-6 w-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-red-600 hover:border-red-200"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <div className="h-6 w-6 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-300 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-3 w-3" />
                </div>
              </div>

                {/* Block content */}
                <BlockRenderer
                  block={block}
                  onChange={(content) => updateBlock(block.id, content)}
                />
              </div>
            </div>
          ))}

          {blocks.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-neutral-200 rounded-xl">
              <p className="text-sm text-neutral-400">No blocks yet. Add blocks from the sidebar or generate a report.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
