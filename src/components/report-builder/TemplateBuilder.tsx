import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import type { ReportTemplate, TemplateQuestion, AnswerFormat } from '@/types/report-builder';
import { Button } from '@/components/ui/button';

interface Props {
  onSave: (template: ReportTemplate) => void;
  onCancel: () => void;
  initialTemplate?: ReportTemplate;
}

function uid() { return crypto.randomUUID(); }

const SECTOR_OPTIONS = [
  'All Sectors', 'Automobile', 'Banking', 'Capital Goods', 'Cement', 'Chemicals',
  'Consumer Durables', 'Energy', 'FMCG', 'Healthcare', 'IT', 'Infra',
  'Manufacturing', 'Media', 'Metals & Mining', 'NBFC', 'Pharma', 'Real Estate',
  'Retail', 'Telecom', 'Textiles', 'Others',
];

const PRIORITY_SOURCES = [
  'Latest Earnings Call Transcript',
  'Latest Earnings Call Presentation (PPT)',
  'Broker Report (last 3 months)',
  'Management Interviews (last 3 months)',
  'Latest Annual Report',
  'DRHP',
  'Credit Report',
  'Live Price and Valuation',
  'Quarterly Quantitative Data (last 6 quarters)',
  'Yearly Quantitative Data (last 5 years)',
  'Web (cannot be combined with other sources)'
];

function createEmptyQuestion(order: number): TemplateQuestion {
  return {
    id: uid(),
    heading: '',
    question: '',
    guidance: '',
    answerFormats: ['text'],
    sortOrder: order,
  };
}

export default function TemplateBuilder({ onSave, onCancel, initialTemplate }: Props) {
  const [name, setName] = useState(initialTemplate?.name || '');
  const [sectors, setSectors] = useState<string[]>(initialTemplate?.sectors || []);
  const [questions, setQuestions] = useState<TemplateQuestion[]>(
    initialTemplate?.questions || [createEmptyQuestion(0)]
  );

  const addQuestion = () => {
    setQuestions([...questions, createEmptyQuestion(questions.length)]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter(q => q.id !== id).map((q, i) => ({ ...q, sortOrder: i })));
  };

  const updateQuestion = (id: string, updates: Partial<TemplateQuestion>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const moveQuestion = (id: string, dir: 'up' | 'down') => {
    const idx = questions.findIndex(q => q.id === id);
    if (idx === -1) return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    setQuestions(reordered.map((q, i) => ({ ...q, sortOrder: i })));
  };

  const toggleFormat = (id: string, format: AnswerFormat) => {
    const q = questions.find(q => q.id === id);
    if (!q) return;
    const has = q.answerFormats.includes(format);
    const newFormats = has
      ? q.answerFormats.filter(f => f !== format)
      : [...q.answerFormats, format];
    if (newFormats.length === 0) return; // Must have at least one
    updateQuestion(id, { answerFormats: newFormats });
  };

  const toggleSector = (sector: string) => {
    setSectors(prev =>
      prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const validQuestions = questions.filter(q => q.question.trim());
    if (validQuestions.length === 0) return;

    onSave({
      id: initialTemplate?.id || uid(),
      name: name.trim(),
      sectors,
      questions: validQuestions,
      createdAt: initialTemplate?.createdAt || new Date().toISOString(),
    });
  };

  const isValid = name.trim() && questions.some(q => q.question.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-neutral-200 animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-accent-600 rounded-t-2xl">
          <h2 className="text-base font-semibold text-white">
            {initialTemplate ? 'Edit Template' : 'Create New Template'}
          </h2>
          <button onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Template Name */}
          <div>
            <label className="text-xs font-semibold text-neutral-700 mb-1.5 block">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Deep Dive Research Report"
              className="w-full h-10 px-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
            />
          </div>

          {/* Sectors */}
          <div>
            <label className="text-xs font-semibold text-neutral-700 mb-1.5 block">Sectors</label>
            <div className="flex flex-wrap gap-1.5">
              {SECTOR_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSector(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    sectors.includes(s)
                      ? 'bg-accent-100 text-accent-700 ring-1 ring-accent-300'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Questions */}
          <div>
            <label className="text-xs font-semibold text-neutral-700 mb-3 block">Questions</label>
            <div className="space-y-4">
              {questions.map((q, qi) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-400">Question {qi + 1}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => moveQuestion(q.id, 'up')} className="p-1 text-neutral-400 hover:text-neutral-600">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveQuestion(q.id, 'down')} className="p-1 text-neutral-400 hover:text-neutral-600">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeQuestion(q.id)} className="p-1 text-neutral-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-500 mb-1 block">Heading (optional)</label>
                    <input
                      value={q.heading || ''}
                      onChange={(e) => updateQuestion(q.id, { heading: e.target.value })}
                      placeholder="Section heading displayed in the report"
                      className="w-full h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-300"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-500 mb-1 block">
                      Question <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={q.question}
                      onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                      placeholder="What should the AI research and answer?"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-300"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-500 mb-1 block">Guidance / Instructions (optional)</label>
                    <textarea
                      value={q.guidance || ''}
                      onChange={(e) => updateQuestion(q.id, { guidance: e.target.value })}
                      placeholder="Additional context or instructions for the AI"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-300"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
                        Source Priority Groups <span className="text-red-500">*</span>
                      </label>
                    </div>
                    
                    <div className="space-y-2 mb-2">
                      {(q.sourcePriorities || []).map((group, groupIndex) => (
                        <div key={groupIndex} className="p-3 bg-white border border-neutral-200 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-neutral-600">Priority Sources {groupIndex + 1}</span>
                            <button 
                              onClick={() => {
                                const newPriorities = [...(q.sourcePriorities || [])];
                                newPriorities.splice(groupIndex, 1);
                                updateQuestion(q.id, { sourcePriorities: newPriorities });
                              }}
                              className="text-[10px] text-red-500 hover:text-red-600 transition-colors"
                            >
                              Remove Group
                            </button>
                          </div>
                          
                          <div className="space-y-1.5">
                            {group.map((source, sourceIndex) => (
                              <div key={sourceIndex} className="flex items-center justify-between bg-neutral-50 px-2.5 py-1.5 rounded border border-neutral-100 text-[11px] text-neutral-700">
                                <span>{source}</span>
                                <button 
                                  onClick={() => {
                                    const newPriorities = [...(q.sourcePriorities || [])];
                                    const newGroup = [...newPriorities[groupIndex]];
                                    newGroup.splice(sourceIndex, 1);
                                    newPriorities[groupIndex] = newGroup;
                                    updateQuestion(q.id, { sourcePriorities: newPriorities });
                                  }}
                                  className="text-neutral-400 hover:text-red-500 transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <select
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const newPriorities = [...(q.sourcePriorities || [])];
                              const newGroup = [...newPriorities[groupIndex], e.target.value];
                              newPriorities[groupIndex] = newGroup;
                              updateQuestion(q.id, { sourcePriorities: newPriorities });
                            }}
                            className="w-full h-8 px-2 rounded border border-neutral-200 text-[11px] bg-white text-neutral-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                          >
                            <option value="">Select source to add...</option>
                            {PRIORITY_SOURCES.filter(s => !group.includes(s)).map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        const newPriorities = [...(q.sourcePriorities || []), []];
                        updateQuestion(q.id, { sourcePriorities: newPriorities });
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium rounded transition-colors inline-flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add Priority Group
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-500 mb-1.5 block">
                      Answer Format <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-3">
                      {(['text', 'table', 'chart', 'sentiment'] as AnswerFormat[]).map(fmt => (
                        <label key={fmt} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={q.answerFormats.includes(fmt)}
                            onChange={() => toggleFormat(q.id, fmt)}
                            className="rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                          />
                          <span className="text-xs text-neutral-600 capitalize">{fmt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addQuestion}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:text-accent-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Question
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 rounded-b-2xl">
          <Button variant="outline" onClick={onCancel} className="rounded-lg">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!isValid}
            className="rounded-lg bg-accent-600 hover:bg-accent-700"
          >
            {initialTemplate ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      </div>
    </div>
  );
}
