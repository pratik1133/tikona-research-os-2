import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Save, RotateCcw, BookOpen, TableProperties } from 'lucide-react';
import { listPromptTemplates, createPromptTemplate, updatePromptTemplate } from '@/lib/api';
import type { PromptTemplate } from '@/types/database';

interface PromptEditorProps {
  /** Unique key for this stage's prompt (e.g. 'pipeline_stage0') */
  stageKey: string;
  title: string;
  defaultSystem: string;
  defaultUser: string;
  userEmail?: string;
  /** Called whenever prompts change so parent can pass to stage runner */
  onChange: (prompts: { systemPrompt: string; userPrompt: string }) => void;
  className?: string;
}

export default function PromptEditor({
  stageKey,
  title,
  defaultSystem,
  defaultUser,
  userEmail,
  onChange,
  className,
}: PromptEditorProps) {
  const [tab, setTab] = useState<'system' | 'user'>('system');
  const [systemPrompt, setSystemPrompt] = useState(defaultSystem);
  const [userPrompt, setUserPrompt] = useState(defaultUser);
  const [savedTemplate, setSavedTemplate] = useState<PromptTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModified, setIsModified] = useState(false);

  // Load saved template on mount
  useEffect(() => {
    if (!userEmail) return;
    listPromptTemplates(userEmail).then((templates) => {
      const match = templates.find(t => t.section_key === stageKey);
      if (match) {
        setSavedTemplate(match);
        // Parse stored prompt — we store system|user separated by a delimiter
        const parts = parseStoredPrompt(match.prompt_text);
        if (parts.systemPrompt) setSystemPrompt(parts.systemPrompt);
        if (parts.userPrompt) setUserPrompt(parts.userPrompt);
      }
    }).catch(() => {});
  }, [stageKey, userEmail]);

  // Notify parent when prompts change
  useEffect(() => {
    onChange({ systemPrompt, userPrompt });
  }, [systemPrompt, userPrompt]);

  const handleSystemChange = useCallback((value: string) => {
    setSystemPrompt(value);
    setIsModified(true);
  }, []);

  const handleUserChange = useCallback((value: string) => {
    setUserPrompt(value);
    setIsModified(true);
  }, []);

  const handleReset = () => {
    setSystemPrompt(defaultSystem);
    setUserPrompt(defaultUser);
    setIsModified(true);
  };

  const handleSaveToLibrary = async () => {
    if (!userEmail) {
      toast.error('Must be logged in to save prompts');
      return;
    }
    setIsSaving(true);
    try {
      const storedText = formatStoredPrompt(systemPrompt, userPrompt);
      if (savedTemplate) {
        // Update existing
        const updated = await updatePromptTemplate(savedTemplate.id, {
          prompt_text: storedText,
          title: title,
        });
        setSavedTemplate(updated as unknown as PromptTemplate);
        toast.success('Prompt updated in library');
      } else {
        // Create new
        const created = await createPromptTemplate({
          section_key: stageKey,
          title: title,
          prompt_text: storedText,
          search_keywords: [stageKey],
        });
        setSavedTemplate(created as unknown as PromptTemplate);
        toast.success('Prompt saved to library');
      }
      setIsModified(false);
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('rounded-xl border border-amber-200 bg-amber-50 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-amber-100 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <TableProperties className="h-3.5 w-3.5 text-amber-700" />
          <span className="text-xs font-semibold text-amber-800">{title}</span>
          {savedTemplate && (
            <span className="text-[10px] text-amber-600 bg-amber-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5" /> Saved
            </span>
          )}
          {isModified && (
            <span className="text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">Modified</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Tab buttons */}
          <div className="flex rounded-md overflow-hidden border border-amber-300 text-[11px]">
            <button
              onClick={() => setTab('system')}
              className={cn(
                'px-2.5 py-1 font-medium transition-colors',
                tab === 'system' ? 'bg-amber-700 text-white' : 'bg-white text-amber-700 hover:bg-amber-50'
              )}
            >
              System
            </button>
            <button
              onClick={() => setTab('user')}
              className={cn(
                'px-2.5 py-1 font-medium transition-colors',
                tab === 'user' ? 'bg-amber-700 text-white' : 'bg-white text-amber-700 hover:bg-amber-50'
              )}
            >
              User
            </button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="h-6 px-2 text-[10px] text-amber-700 hover:text-amber-900"
            title="Reset to defaults"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSaveToLibrary}
            disabled={isSaving}
            className="h-6 px-2 text-[10px] text-amber-700 hover:text-amber-900"
            title="Save to prompt library"
          >
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? '...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Editable textarea */}
      <textarea
        value={tab === 'system' ? systemPrompt : userPrompt}
        onChange={(e) => tab === 'system' ? handleSystemChange(e.target.value) : handleUserChange(e.target.value)}
        className="w-full p-3 text-xs text-amber-900 bg-amber-50 font-mono leading-relaxed resize-y focus:outline-none focus:bg-white focus:ring-1 focus:ring-amber-300 transition-colors"
        style={{ minHeight: '120px', maxHeight: '320px' }}
        spellCheck={false}
      />
    </div>
  );
}

// ========================
// Prompt storage helpers
// ========================

const PROMPT_DELIMITER = '\n===SYSTEM_USER_SEPARATOR===\n';

function formatStoredPrompt(system: string, user: string): string {
  return `${system}${PROMPT_DELIMITER}${user}`;
}

function parseStoredPrompt(stored: string): { systemPrompt: string; userPrompt: string } {
  const idx = stored.indexOf(PROMPT_DELIMITER);
  if (idx === -1) {
    // Legacy single prompt — treat as user prompt
    return { systemPrompt: '', userPrompt: stored };
  }
  return {
    systemPrompt: stored.slice(0, idx),
    userPrompt: stored.slice(idx + PROMPT_DELIMITER.length),
  };
}
