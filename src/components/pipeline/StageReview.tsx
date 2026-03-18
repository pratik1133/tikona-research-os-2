import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, RotateCcw, ChevronDown, ChevronUp, Edit3, Save } from 'lucide-react';

interface StageReviewProps {
  title: string;
  content: string;
  isApproved: boolean;
  isGenerating: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onEdit?: (content: string) => void;
  className?: string;
}

export default function StageReview({
  title,
  content,
  isApproved,
  isGenerating,
  onApprove,
  onRegenerate,
  onEdit,
  className,
}: StageReviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const handleSave = () => {
    onEdit?.(editContent);
    setIsEditing(false);
  };

  return (
    <div className={cn('rounded-xl border border-neutral-200 bg-white overflow-hidden', className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-100 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          {isApproved && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
              <Check className="h-3 w-3 text-green-600" />
            </div>
          )}
          <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
          {isApproved && (
            <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
              Approved
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-neutral-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-5">
          {isGenerating ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-200 border-t-accent-600" />
              <span className="text-sm text-neutral-500">Generating...</span>
            </div>
          ) : isEditing ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[300px] rounded-lg border border-neutral-200 p-3 text-sm font-mono text-neutral-800 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400"
              />
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setEditContent(content); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="prose prose-sm prose-neutral max-w-none text-neutral-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />

              {/* Actions */}
              {!isApproved && (
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-neutral-100">
                  <Button onClick={onApprove} size="sm">
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Approve
                  </Button>
                  <Button onClick={onRegenerate} variant="outline" size="sm" disabled={isGenerating}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Regenerate
                  </Button>
                  {onEdit && (
                    <Button onClick={() => setIsEditing(true)} variant="ghost" size="sm">
                      <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Simple markdown to HTML renderer (handles headers, bold, lists, tables)
function renderMarkdown(md: string): string {
  if (!md) return '<p class="text-neutral-400 italic">No content generated yet.</p>';

  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold text-neutral-800 mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-neutral-900 mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-neutral-900 mt-6 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-neutral-900 mt-6 mb-3">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    // Table rows (simple)
    .replace(/^\|(.+)\|$/gm, (_, row: string) => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return '<tr>' + cells.map(c => `<td class="border border-neutral-200 px-3 py-1.5 text-xs">${c}</td>`).join('') + '</tr>';
    })
    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="my-4 border-neutral-200" />')
    // Line breaks to paragraphs
    .replace(/\n\n/g, '</p><p class="text-sm leading-relaxed mb-2">')
    .replace(/\n/g, '<br />');

  // Wrap in paragraph if not starting with a block element
  if (!html.startsWith('<h') && !html.startsWith('<table') && !html.startsWith('<li')) {
    html = `<p class="text-sm leading-relaxed mb-2">${html}</p>`;
  }

  // Wrap consecutive li elements in ul
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-2 space-y-1">$1</ul>');

  // Wrap consecutive tr elements in table
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table class="w-full border-collapse my-3">$1</table>');

  return html;
}
