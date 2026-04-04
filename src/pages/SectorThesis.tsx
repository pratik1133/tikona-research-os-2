import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFrameworkFromPlaybook, updateSectorPlaybook } from '@/lib/pipeline-api';
import type { SectorPlaybook } from '@/types/pipeline';
import {
  Search, ChevronRight, Save, X, RefreshCw,
  Layers, CalendarDays, Hash, ArrowLeft, Pencil, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

// ========================
// Sector Thesis Page
// ========================

export default function SectorThesis() {
  const [playbooks, setPlaybooks] = useState<SectorPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPlaybook, setSelectedPlaybook] = useState<SectorPlaybook | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // ---------- Fetch all playbooks ----------
  const fetchPlaybooks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sector_playbooks')
        .select('*')
        .order('sector_name');

      if (error) throw error;
      setPlaybooks(data || []);
    } catch (err) {
      console.error('Failed to fetch sector playbooks:', err);
      toast.error('Failed to load sector playbooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlaybooks(); }, [fetchPlaybooks]);

  // ---------- Select a playbook ----------
  const handleSelect = (pb: SectorPlaybook) => {
    setSelectedPlaybook(pb);
    setDraft(getFrameworkFromPlaybook(pb));
    setEditMode(false);
  };

  // ---------- Save edited framework ----------
  const handleSave = async () => {
    if (!selectedPlaybook) return;
    setSaving(true);
    try {
      const updated = await updateSectorPlaybook(selectedPlaybook.id, {
        framework_content: draft,
      });
      // Refresh the list
      setPlaybooks(prev =>
        prev.map(p => (p.id === updated.id ? updated : p))
      );
      setSelectedPlaybook(updated);
      setEditMode(false);
      toast.success(`${updated.sector_name} framework saved (v${updated.version})`);
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Failed to save sector framework');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Filter ----------
  const filtered = playbooks.filter(pb =>
    pb.sector_name.toLowerCase().includes(search.toLowerCase())
  );

  // ---------- Simple markdown renderer ----------
  const renderMarkdown = (md: string) => {
    return md
      .replace(/^#### (.+)$/gm, '<h5 class="text-sm font-semibold text-neutral-800 mt-5 mb-1">$1</h5>')
      .replace(/^### (.+)$/gm, '<h4 class="text-base font-semibold text-neutral-800 mt-6 mb-1.5">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="text-lg font-bold text-neutral-900 mt-7 mb-2 pb-1 border-b border-neutral-200">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 class="text-xl font-bold text-neutral-900 mt-8 mb-2">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-neutral-900">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-3 border-accent-300 pl-3 my-2 text-neutral-600 italic">$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li class="ml-5 list-disc text-neutral-700 leading-relaxed text-[13px]">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-5 list-decimal text-neutral-700 leading-relaxed text-[13px]">$2</li>')
      .replace(/\n{2,}/g, '</p><p class="text-[13px] text-neutral-700 leading-relaxed mt-2">')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="flex h-full">
      {/* ===== LEFT PANEL: Sector List ===== */}
      <div className="w-80 border-r border-neutral-200 bg-white flex flex-col shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-neutral-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-accent-600" />
                Sector Thesis
              </h1>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {playbooks.length} sector framework{playbooks.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={fetchPlaybooks}
              className="h-7 w-7 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-accent-600 hover:border-accent-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sectors..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-300"
            />
          </div>
        </div>

        {/* Sector List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-5 w-5 text-neutral-300 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Layers className="h-8 w-8 text-neutral-200 mx-auto mb-2" />
              <p className="text-xs text-neutral-400">
                {search ? 'No matching sectors' : 'No sector frameworks yet'}
              </p>
              <p className="text-[10px] text-neutral-300 mt-1">
                Generate a sector framework in the Research Pipeline first
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map(pb => {
                const isSelected = selectedPlaybook?.id === pb.id;
                return (
                  <button
                    key={pb.id}
                    onClick={() => handleSelect(pb)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all group ${
                      isSelected
                        ? 'bg-accent-50 border-l-2 border-accent-500'
                        : 'hover:bg-neutral-50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                      isSelected
                        ? 'bg-accent-100 text-accent-700'
                        : 'bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200'
                    }`}>
                      {pb.sector_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-medium truncate ${
                        isSelected ? 'text-accent-800' : 'text-neutral-800'
                      }`}>
                        {pb.sector_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <Hash className="h-2.5 w-2.5" /> v{pb.version}
                        </span>
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <CalendarDays className="h-2.5 w-2.5" /> {pb.last_updated}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                      isSelected ? 'text-accent-500' : 'text-neutral-300 group-hover:text-neutral-400'
                    }`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== RIGHT PANEL: Framework Viewer/Editor ===== */}
      <div className="flex-1 flex flex-col bg-[#f8f8f6] overflow-hidden">
        {selectedPlaybook ? (
          <>
            {/* Toolbar */}
            <div className="h-14 px-6 flex items-center justify-between border-b border-neutral-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSelectedPlaybook(null); setEditMode(false); }}
                  className="h-7 w-7 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 transition-colors lg:hidden"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <div>
                  <h2 className="text-sm font-bold text-neutral-900">
                    {selectedPlaybook.sector_name}
                  </h2>
                  <p className="text-[10px] text-neutral-400">
                    Version {selectedPlaybook.version} · Last updated {selectedPlaybook.last_updated}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <button
                      onClick={() => {
                        setDraft(getFrameworkFromPlaybook(selectedPlaybook));
                        setEditMode(false);
                      }}
                      className="h-8 px-3 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors flex items-center gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="h-8 px-4 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode(true)}
                    className="h-8 px-4 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit Framework
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {editMode ? (
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <Pencil className="h-3.5 w-3.5 text-accent-600" />
                    <span className="text-[11px] font-semibold text-accent-700 uppercase tracking-wider">Editing Mode</span>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full min-h-[calc(100vh-220px)] rounded-xl border border-neutral-300 bg-white p-5 text-[13px] text-neutral-800 font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 shadow-sm"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center gap-2 mb-4">
                    <Eye className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Preview Mode</span>
                  </div>
                  <div
                    className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 md:p-8"
                    dangerouslySetInnerHTML={{
                      __html: `<div class="prose prose-sm max-w-none"><p class="text-[13px] text-neutral-700 leading-relaxed">${renderMarkdown(getFrameworkFromPlaybook(selectedPlaybook))}</p></div>`,
                    }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="h-16 w-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Layers className="h-8 w-8 text-neutral-300" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-600 mb-1">Select a Sector</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Choose a sector from the sidebar to view and edit its research framework.
                These frameworks are used by the AI pipeline to generate company-specific research reports.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
