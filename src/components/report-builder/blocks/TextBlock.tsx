import { useState } from 'react';
import type { TextContent } from '@/types/report-builder';

interface Props {
  content: TextContent;
  onChange: (content: TextContent) => void;
}

// Simple markdown to HTML renderer (handles bold, italic, bullets, headings, blockquotes)
function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h4 class="text-base font-semibold text-neutral-800 mt-4 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-lg font-semibold text-neutral-800 mt-4 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-xl font-bold text-neutral-900 mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-neutral-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-3 border-accent-300 pl-3 text-neutral-600 italic my-2">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-neutral-700 leading-relaxed">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-neutral-700 leading-relaxed">$2</li>')
    .replace(/\n{2,}/g, '</p><p class="text-sm text-neutral-700 leading-relaxed mt-2">')
    .replace(/\n/g, '<br/>');
}

export default function TextBlock({ content, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const safeMarkdown = content.markdown || '';
  const [draft, setDraft] = useState(safeMarkdown);

  const handleSave = () => {
    onChange({ markdown: draft });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full min-h-[160px] rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-800 font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400"
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-2 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700 transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => { setDraft(content.markdown); setEditing(false); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-neutral-600 text-xs font-medium hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="cursor-text rounded-lg p-1 -m-1 hover:bg-neutral-50/50 transition-colors"
      dangerouslySetInnerHTML={{
        __html: `<p class="text-sm text-neutral-700 leading-relaxed">${renderMarkdown(safeMarkdown)}</p>`,
      }}
    />
  );
}
