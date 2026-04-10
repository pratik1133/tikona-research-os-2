import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Save, RotateCcw, Check, AlertCircle, Code2, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { getPipelinePrompt, savePipelinePrompt } from '@/lib/pipeline-api';
import type { PipelineStage } from '@/lib/pipeline-api';

interface PromptEditorProps {
  stage: PipelineStage;
  title: string;
  defaultSystem: string;
  defaultUser: string;
  userEmail?: string;
  onChange: (prompts: { systemPrompt: string; userPrompt: string }) => void;
  className?: string;
}

export default function PromptEditor({
  stage,
  title,
  defaultSystem,
  defaultUser,
  userEmail,
  onChange,
  className,
}: PromptEditorProps) {
  const [systemPrompt, setSystemPrompt] = useState(defaultSystem);
  const [userPrompt, setUserPrompt] = useState(defaultUser);
  const [isSaving, setIsSaving] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'system' | 'user' | null>('system');

  // Load saved custom prompt on mount
  useEffect(() => {
    if (!userEmail) return;
    getPipelinePrompt(stage, userEmail).then((saved) => {
      if (saved) {
        setSystemPrompt(saved.system_prompt);
        setUserPrompt(saved.user_prompt);
        setIsCustom(true);
      }
    }).catch(() => {});
  }, [stage, userEmail]);

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
    setIsCustom(false);
  };

  const handleSave = async () => {
    if (!userEmail) {
      toast.error('Must be logged in to save prompts');
      return;
    }
    setIsSaving(true);
    try {
      await savePipelinePrompt({
        stage,
        label: title,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        user_email: userEmail,
      });
      setIsModified(false);
      setIsCustom(true);
      toast.success('Prompt saved to library');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSection = (section: 'system' | 'user') => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  return (
    <div className={cn('bg-neutral-50/80', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <Code2 className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-500">{title}</span>
          <StatusBadge isModified={isModified} isCustom={isCustom} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="h-6 px-2 text-xs text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isModified}
            className={cn(
              'h-6 px-3 text-xs font-medium rounded-md transition-all',
              isModified
                ? 'bg-accent-600 hover:bg-accent-700 text-white'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            )}
          >
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* System Prompt */}
      <PromptSection
        label="System Prompt"
        icon={<Code2 className="h-3 w-3" />}
        value={systemPrompt}
        onChange={handleSystemChange}
        isExpanded={expandedSection === 'system'}
        onToggle={() => toggleSection('system')}
      />

      <div className="border-t border-neutral-100" />

      {/* User Prompt */}
      <PromptSection
        label="User Prompt"
        icon={<MessageSquare className="h-3 w-3" />}
        value={userPrompt}
        onChange={handleUserChange}
        isExpanded={expandedSection === 'user'}
        onToggle={() => toggleSection('user')}
      />

      {/* Variables hint */}
      <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50">
        <p className="text-xs text-neutral-400">
          <span className="font-medium">Variables:</span>{' '}
          <code className="px-1 bg-neutral-100 rounded text-xs">{'{{COMPANY}}'}</code>{' '}
          <code className="px-1 bg-neutral-100 rounded text-xs">{'{{NSE_SYMBOL}}'}</code>{' '}
          <code className="px-1 bg-neutral-100 rounded text-xs">{'{{SECTOR}}'}</code>
        </p>
      </div>
    </div>
  );
}

// ========================
// Sub-components
// ========================

function StatusBadge({ isModified, isCustom }: { isModified: boolean; isCustom: boolean }) {
  if (isModified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
        <AlertCircle className="h-2.5 w-2.5" /> Unsaved
      </span>
    );
  }

  if (isCustom) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 bg-accent-50 border border-accent-200 px-2 py-0.5 rounded-md">
        <Check className="h-2.5 w-2.5" /> Custom
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-md">
      Default
    </span>
  );
}

interface PromptSectionProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function PromptSection({ label, icon, value, onChange, isExpanded, onToggle }: PromptSectionProps) {
  const lineCount = value.split('\n').length;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-neutral-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className="text-neutral-400">{icon}</div>
          <span className="text-xs font-medium text-neutral-600">{label}</span>
          <span className="text-xs text-neutral-400">{lineCount} lines</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 text-neutral-400" />
        ) : (
          <ChevronDown className="h-3 w-3 text-neutral-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-800 font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400 transition-all"
            style={{ minHeight: '120px', maxHeight: '350px' }}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
