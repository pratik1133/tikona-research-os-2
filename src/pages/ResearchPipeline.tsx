import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PipelineProgressBar from '@/components/pipeline/PipelineProgressBar';
import StageReview from '@/components/pipeline/StageReview';
import { useCompanySearch, useCompanyFinancials } from '@/hooks/useCompanySearch';
import {
  usePipelineSession,
  useSectors,
  useResearchSections,
} from '@/hooks/usePipelineSession';
import { useAuth } from '@/contexts/AuthContext';
import {
  createPipelineSession,
  transitionPipelineStatus,
  updatePipelineOutput,
  saveResearchSection,
  clearResearchSections,
  listPipelineSessions,
  deletePipelineSession,
} from '@/lib/pipeline-api';
import {
  createVault,
  processVaultResponse,
  deleteDocument,
  saveSessionDocuments,
  generateFinancialModel,
} from '@/lib/api';
import { ingestDocument } from '@/lib/ai';
import { runStage0, runStage1, runStage2, REPORT_SECTION_DEFS } from '@/lib/pipeline-ai';
import type { PipelineSession, PipelineProgress, PipelineStatus } from '@/types/pipeline';
import { PIPELINE_STAGE_LABELS, PIPELINE_MODELS, DEFAULT_PIPELINE_MODEL, getStageNumber } from '@/types/pipeline';
import type { MasterCompany, EquityUniverse } from '@/types/database';
import type { VaultDocument } from '@/types/vault';
import FileManager from '@/components/FileManager';
import DocumentUploadDialog from '@/components/DocumentUploadDialog';
import { cn } from '@/lib/utils';
import {
  Search,
  Building2,
  Zap,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Cpu,
  FolderOpen,
  Upload,
  Check,
  ArrowRight,
  Trash2,
  Clock,
  Plus,
  ExternalLink,
  RefreshCw,
  Loader2,
  Eye,
  EyeOff,
  TableProperties,
  Sparkles,
} from 'lucide-react';

// ========================
// Formatting Helpers
// ========================

function formatCurrency(value: number | null): string {
  if (value == null) return '-';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return '-';
  return `${value.toFixed(2)}%`;
}

// ========================
// Main Page Component
// ========================

export default function ResearchPipeline() {
  const { user } = useAuth();

  // --- Company Search State ---
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<MasterCompany | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- Setup State ---
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PIPELINE_MODEL);

  // --- Session State ---
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // --- Vault & Documents ---
  const [vaultStatus, setVaultStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [vaultLink, setVaultLink] = useState<string | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // --- Ingestion State ---
  const [ingestionStatus, setIngestionStatus] = useState<'idle' | 'ingesting' | 'done' | 'error'>('idle');
  const [ingestionProgress, setIngestionProgress] = useState({ current: 0, total: 0 });

  // --- Pipeline Stage State ---
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('documents_ready');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);

  // --- Stage Outputs ---
  const [stage0Content, setStage0Content] = useState<string>('');
  const [stage1Condensed, setStage1Condensed] = useState<string>('');
  const [stage1Thesis, setStage1Thesis] = useState<string>('');
  const [stage2Sections, setStage2Sections] = useState<Array<{ key: string; title: string; content: string }>>([]);

  // --- Financial Model State ---
  const [financialModelStatus, setFinancialModelStatus] = useState<'idle' | 'generating' | 'success' | 'skipped'>('idle');
  const [financialModelFileUrl, setFinancialModelFileUrl] = useState<string | null>(null);

  // --- Prompt Visibility ---
  const [showStage0Prompt, setShowStage0Prompt] = useState(false);
  const [showStage1Prompt, setShowStage1Prompt] = useState(false);
  const [showStage2Prompt, setShowStage2Prompt] = useState(false);

  // --- Recent Sessions ---
  const [recentSessions, setRecentSessions] = useState<PipelineSession[]>([]);
  const [showRecent, setShowRecent] = useState(true);

  // --- Data Queries ---
  const { data: companies } = useCompanySearch(debouncedSearch);
  const { data: financials } = useCompanyFinancials(selectedCompany);
  const { data: sectors } = useSectors();

  // Auto-fill sector from financials when available
  useEffect(() => {
    if (financials && !selectedSector) {
      const sector = financials.sector || financials.broad_sector || '';
      if (sector) setSelectedSector(sector);
    }
  }, [financials, selectedSector]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isDropdownOpen]);

  // Load recent sessions
  useEffect(() => {
    if (!user?.email) return;
    listPipelineSessions({ createdBy: user.email, pageSize: 5 })
      .then(({ data }) => setRecentSessions(data))
      .catch(() => {});
  }, [user?.email]);

  // Load session data when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    import('@/lib/pipeline-api').then(({ getPipelineSession, getResearchSections }) => {
      getPipelineSession(sessionId).then((s) => {
        if (s) {
          setSession(s);
          setPipelineStatus((s.pipeline_status ?? 'documents_ready') as PipelineStatus);
          setSelectedModel(s.selected_model ?? DEFAULT_PIPELINE_MODEL);
          // Load stage outputs
          if (s.sector_framework) {
            const fw = s.sector_framework as any;
            setStage0Content(typeof fw.overview === 'string' ? fw.overview : JSON.stringify(fw, null, 2));
          }
          if (s.thesis_condensed) setStage1Condensed(s.thesis_condensed);
          if (s.thesis_output) setStage1Thesis(s.thesis_output);
        }
      });
      getResearchSections(sessionId, 'stage2').then((sections) => {
        if (sections.length > 0) {
          setStage2Sections(sections.map(s => ({ key: s.section_key, title: s.section_title, content: s.content })));
        }
      });
    });
  }, [sessionId]);

  // --- Company Selection ---
  const handleSelectCompany = useCallback((company: MasterCompany) => {
    setSelectedCompany(company);
    setSearchInput(company.company_name);
    setIsDropdownOpen(false);
    // Auto-fill sector
    if (company.sector) setSelectedSector(company.sector);
  }, []);

  // --- Vault Creation (manual, for cases where vault wasn't auto-created) ---
  const handleCreateVault = async (folderId?: string | null) => {
    if (!selectedCompany?.nse_symbol) return;
    const sector = selectedSector || financials?.sector || financials?.broad_sector || 'General';
    setVaultStatus('loading');
    try {
      const response = await createVault(selectedCompany.nse_symbol, sector);
      const { folderId: newFolderId, folderUrl, documents } = processVaultResponse(response);
      setVaultLink(folderUrl);
      setVaultId(newFolderId);
      setVaultDocuments(documents);
      setVaultStatus('success');
      toast.success('Vault created');
      return newFolderId;
    } catch (err) {
      setVaultStatus('error');
      toast.error(`Vault creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  // --- Session Creation: Financial Model → Vault → Session ---
  const handleStartPipeline = async () => {
    if (!selectedCompany || !user?.email) return;
    const sector = selectedSector || financials?.sector || financials?.broad_sector || 'General';
    if (!selectedSector) setSelectedSector(sector);
    setIsCreatingSession(true);
    setShowRecent(false);

    let createdFolderId: string | null = null;

    try {
      // ── Step 1: Create vault first (we need the folder ID for financial model) ──
      toast.info('Creating Drive vault...');
      setVaultStatus('loading');
      try {
        const vaultResponse = await createVault(selectedCompany.nse_symbol ?? '', sector);
        const { folderId, folderUrl, documents } = processVaultResponse(vaultResponse);
        createdFolderId = folderId;
        setVaultLink(folderUrl);
        setVaultId(folderId);
        setVaultDocuments(documents);
        setVaultStatus('success');
        toast.success('Drive vault created');
      } catch (vaultErr) {
        console.warn('[Pipeline] Vault creation failed — continuing without vault:', vaultErr);
        setVaultStatus('error');
        toast.warning('Vault creation failed — you can create it manually later');
      }

      // ── Step 2: Generate financial model (into the vault folder) ──
      if (createdFolderId) {
        toast.info('Generating financial model...');
        setFinancialModelStatus('generating');
        try {
          const modelResult = await generateFinancialModel(
            selectedCompany.nse_symbol ?? '',
            selectedCompany.company_name,
            sector,
            createdFolderId
          );
          setFinancialModelStatus('success');
          setFinancialModelFileUrl(modelResult.fileUrl);
          toast.success(`Financial model generated: ${modelResult.fileName}`);
        } catch (modelErr) {
          console.warn('[Pipeline] Financial model generation failed:', modelErr);
          setFinancialModelStatus('skipped');
          toast.warning('Financial model generation failed — pipeline will continue');
        }
      } else {
        setFinancialModelStatus('skipped');
      }

      // ── Step 3: Create Supabase pipeline session ──
      const newSession = await createPipelineSession({
        company_name: selectedCompany.company_name,
        company_nse_code: selectedCompany.nse_symbol ?? '',
        sector,
        created_by: user.email,
        selected_model: selectedModel,
      });
      setSessionId(newSession.session_id);
      setSession(newSession);
      setPipelineStatus('documents_ready');
      toast.success('Report generator session started');
    } catch (err) {
      toast.error(`Failed to start session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // --- Document Ingestion ---
  const handleIngestDocuments = async () => {
    if (!sessionId || selectedDocumentIds.length === 0) return;
    setIngestionStatus('ingesting');
    const docsToIngest = vaultDocuments.filter(d => selectedDocumentIds.includes(d.id));
    setIngestionProgress({ current: 0, total: docsToIngest.length });

    try {
      // Save documents to session
      await saveSessionDocuments(
        docsToIngest.map(d => ({
          session_id: sessionId,
          drive_file_id: d.id,
          file_name: d.name,
          mime_type: d.mimeType,
          file_size: d.size,
          view_url: d.viewUrl,
          download_url: d.downloadUrl,
          document_type: d.type,
          category: d.category,
        }))
      );

      // Ingest each document
      for (let i = 0; i < docsToIngest.length; i++) {
        setIngestionProgress({ current: i + 1, total: docsToIngest.length });
        await ingestDocument(docsToIngest[i].id, docsToIngest[i].name, sessionId);
      }

      setIngestionStatus('done');
      toast.success(`${docsToIngest.length} documents ingested`);
    } catch (err) {
      setIngestionStatus('error');
      toast.error(`Ingestion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // --- Stage Runners ---
  const handleRunStage0 = useCallback(async () => {
    if (!sessionId || !session) return;
    setIsRunning(true);
    try {
      await transitionPipelineStatus(sessionId, 'stage0_generating', pipelineStatus);
      setPipelineStatus('stage0_generating');

      const { framework, tokensUsed } = await runStage0(
        sessionId,
        session.company_name,
        session.company_nse_code,
        selectedSector || session?.sector || '',
        selectedModel,
        setProgress
      );

      const content = typeof framework.overview === 'string' ? framework.overview : JSON.stringify(framework, null, 2);
      setStage0Content(content);

      await updatePipelineOutput(sessionId, {
        sector_framework: framework,
        total_tokens_used: (session.total_tokens_used || 0) + tokensUsed,
      });

      await clearResearchSections(sessionId, 'stage0');
      await saveResearchSection({
        session_id: sessionId,
        section_key: 'sector_framework',
        section_title: 'Sector Framework',
        stage: 'stage0',
        content,
        tokens_used: tokensUsed,
      });

      await transitionPipelineStatus(sessionId, 'stage0_review', 'stage0_generating');
      setPipelineStatus('stage0_review');
      toast.success('Sector framework generated');
    } catch (err) {
      toast.error(`Stage 0 failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPipelineStatus('documents_ready');
      try { await transitionPipelineStatus(sessionId, 'documents_ready'); } catch {}
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [sessionId, session, pipelineStatus, selectedSector, selectedModel]);

  const handleRunStage1 = useCallback(async () => {
    if (!sessionId || !session) return;
    setIsRunning(true);
    try {
      await transitionPipelineStatus(sessionId, 'stage1_generating', pipelineStatus);
      setPipelineStatus('stage1_generating');

      const sectorFramework = session.sector_framework as any;
      const { condensed, thesis, tokensUsed } = await runStage1(
        sessionId,
        session.company_name,
        session.company_nse_code,
        selectedSector || session?.sector || '',
        financials ?? null,
        sectorFramework,
        null,
        selectedModel,
        setProgress
      );

      setStage1Condensed(condensed);
      setStage1Thesis(thesis);

      await updatePipelineOutput(sessionId, {
        thesis_condensed: condensed,
        thesis_output: thesis,
        total_tokens_used: (session.total_tokens_used || 0) + tokensUsed,
      });

      await clearResearchSections(sessionId, 'stage1');
      await saveResearchSection({
        session_id: sessionId,
        section_key: 'condensed_analysis',
        section_title: 'Condensed Analysis',
        stage: 'stage1',
        content: condensed,
        sort_order: 0,
        tokens_used: Math.round(tokensUsed / 2),
      });
      await saveResearchSection({
        session_id: sessionId,
        section_key: 'investment_thesis',
        section_title: 'Investment Thesis',
        stage: 'stage1',
        content: thesis,
        sort_order: 1,
        tokens_used: Math.round(tokensUsed / 2),
      });

      await transitionPipelineStatus(sessionId, 'stage1_review', 'stage1_generating');
      setPipelineStatus('stage1_review');
      toast.success('Thesis generated');
    } catch (err) {
      toast.error(`Stage 1 failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPipelineStatus('stage0_approved');
      try { await transitionPipelineStatus(sessionId, 'stage0_approved'); } catch {}
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [sessionId, session, pipelineStatus, financials, selectedSector, selectedModel]);

  const handleRunStage2 = useCallback(async () => {
    if (!sessionId || !session || !session.thesis_output) return;
    setIsRunning(true);
    try {
      await transitionPipelineStatus(sessionId, 'stage2_generating', pipelineStatus);
      setPipelineStatus('stage2_generating');

      const sectorFramework = session.sector_framework as any;
      const { sections: reportSections, tokensUsed } = await runStage2(
        sessionId,
        session.company_name,
        session.company_nse_code,
        selectedSector || session?.sector || '',
        financials ?? null,
        session.thesis_output,
        sectorFramework,
        null,
        selectedModel,
        setProgress
      );

      setStage2Sections(reportSections);

      await clearResearchSections(sessionId, 'stage2');
      for (let i = 0; i < reportSections.length; i++) {
        await saveResearchSection({
          session_id: sessionId,
          section_key: reportSections[i].key,
          section_title: reportSections[i].title,
          stage: 'stage2',
          content: reportSections[i].content,
          sort_order: i,
          tokens_used: Math.round(tokensUsed / reportSections.length),
        });
      }

      const fullReport = reportSections.map(s => `# ${s.title}\n\n${s.content}`).join('\n\n---\n\n');
      await updatePipelineOutput(sessionId, {
        report_content: fullReport,
        total_tokens_used: (session.total_tokens_used || 0) + tokensUsed,
      });

      await transitionPipelineStatus(sessionId, 'stage2_review', 'stage2_generating');
      setPipelineStatus('stage2_review');
      toast.success('Report generated');
    } catch (err) {
      toast.error(`Stage 2 failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPipelineStatus('stage1_approved');
      try { await transitionPipelineStatus(sessionId, 'stage1_approved'); } catch {}
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [sessionId, session, pipelineStatus, financials, selectedSector, selectedModel]);

  // --- Approve Handlers ---
  const handleApprove = async (stage: 'stage0' | 'stage1' | 'stage2') => {
    if (!sessionId) return;
    const newStatus: PipelineStatus =
      stage === 'stage0' ? 'stage0_approved' :
      stage === 'stage1' ? 'stage1_approved' : 'stage2_approved';
    try {
      await transitionPipelineStatus(sessionId, newStatus, pipelineStatus);
      setPipelineStatus(newStatus);
      // Refresh session for updated data
      const { getPipelineSession } = await import('@/lib/pipeline-api');
      const updated = await getPipelineSession(sessionId);
      if (updated) setSession(updated);
      toast.success(`${stage === 'stage0' ? 'Sector framework' : stage === 'stage1' ? 'Thesis' : 'Report'} approved`);
    } catch (err) {
      toast.error(`Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handlePublish = async () => {
    if (!sessionId) return;
    try {
      await transitionPipelineStatus(sessionId, 'published', pipelineStatus);
      setPipelineStatus('published');
      toast.success('Report published!');
    } catch (err) {
      toast.error(`Publish failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // --- Resume a recent session ---
  const handleResumeSession = (s: PipelineSession) => {
    setSessionId(s.session_id);
    setSelectedCompany({
      company_id: 0,
      company_name: s.company_name,
      nse_symbol: s.company_nse_code,
      isin: null,
      bse_code: null,
      date_of_listing: null,
      paid_up_value: null,
      face_value: null,
      created_at: '',
      accord_code: null,
      google_code: null,
      bloomberg_ticker: null,
      yahoo_code: null,
      modified_at: null,
    });
    setSearchInput(s.company_name);
    setSelectedSector(s.sector ?? '');
    setShowRecent(false);
  };

  // --- Delete session ---
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session?')) return;
    try {
      await deletePipelineSession(id);
      setRecentSessions(prev => prev.filter(s => s.session_id !== id));
      if (sessionId === id) {
        setSessionId(null);
        setSession(null);
        setPipelineStatus('documents_ready');
      }
      toast.success('Session deleted');
    } catch (err) {
      toast.error('Failed to delete session');
    }
  };

  // Determine current step number
  const currentStage = getStageNumber(pipelineStatus);
  const hasSession = !!sessionId;

  // ========================
  // RENDER
  // ========================

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Sparkles className="h-5 w-5 text-accent-600" />
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Report Generator</h1>
        </div>
        <p className="text-sm text-neutral-500">
          AI-powered equity research report generator — Sector Framework → Investment Thesis → Full Report
        </p>
      </div>

      {/* ==================== STEP 1: Company Selection ==================== */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-600 text-white text-xs font-bold">1</span>
          <h2 className="text-base font-semibold text-neutral-900">Select Company</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Company Search */}
          <div className="lg:col-span-2 relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setIsDropdownOpen(true);
                  if (selectedCompany && e.target.value !== selectedCompany.company_name) {
                    setSelectedCompany(null);
                  }
                }}
                onFocus={() => searchInput.length >= 2 && setIsDropdownOpen(true)}
                placeholder="Search company name or NSE symbol..."
                className="pl-9 h-11"
                disabled={hasSession}
              />
            </div>

            {isDropdownOpen && companies && companies.length > 0 && !hasSession && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {companies.map((company) => (
                  <button
                    key={company.company_id}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 border-b border-neutral-50 last:border-0"
                    onClick={() => handleSelectCompany(company)}
                  >
                    <span className="font-medium text-neutral-900">{company.company_name}</span>
                    <span className="ml-2 text-xs text-neutral-400">
                      {company.nse_symbol}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={hasSession}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="AI Model" />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Company Info Card + Start Button */}
        {selectedCompany && financials && (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50">
                  <Building2 className="h-4 w-4 text-accent-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">{selectedCompany.company_name}</h3>
                  <p className="text-xs text-neutral-400">
                    {selectedCompany.nse_symbol}
                    {selectedSector ? ` · ${selectedSector}` : ''}
                    {financials.broad_sector && financials.broad_sector !== selectedSector ? ` · ${financials.broad_sector}` : ''}
                  </p>
                </div>
              </div>
              {!hasSession && (
                <Button onClick={handleStartPipeline} disabled={isCreatingSession}>
                  {isCreatingSession ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Generate Report
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <MetricCard label="Market Cap" value={formatCurrency(financials.market_cap)} />
              <MetricCard label="Price" value={formatCurrency(financials.current_price)} />
              <MetricCard label="P/E (TTM)" value={financials.pe_ttm?.toFixed(1) ?? '-'} />
              <MetricCard label="ROE" value={formatPercent(financials.roe)} />
              <MetricCard label="ROCE" value={formatPercent(financials.roce)} />
              <MetricCard label="EBITDA Margin" value={formatPercent(financials.ebitda_margin_ttm)} />
            </div>
          </div>
        )}
      </section>

      {/* ==================== Recent Sessions (before session is created) ==================== */}
      {!hasSession && showRecent && recentSessions.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">Recent Pipelines</h3>
          <div className="space-y-2">
            {recentSessions.map((s) => {
              const st = (s.pipeline_status ?? 'documents_ready') as PipelineStatus;
              return (
                <div
                  key={s.session_id}
                  onClick={() => handleResumeSession(s)}
                  className="group flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:shadow-sm hover:border-neutral-300 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="h-4 w-4 text-neutral-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-neutral-800 truncate block">{s.company_name}</span>
                      <span className="text-xs text-neutral-400">{s.company_nse_code} · {s.sector}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'text-[10px] font-medium px-2 py-0.5 rounded-full',
                      st === 'published' ? 'bg-green-50 text-green-700' :
                      st.includes('review') ? 'bg-amber-50 text-amber-700' :
                      st.includes('generating') ? 'bg-blue-50 text-blue-700' :
                      'bg-neutral-100 text-neutral-600'
                    )}>
                      {PIPELINE_STAGE_LABELS[st]}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={(e) => handleDeleteSession(s.session_id, e)}
                      className="p-1 rounded text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ==================== After session is created — Pipeline workflow ==================== */}
      {hasSession && (
        <>
          {/* Progress Bar */}
          <PipelineProgressBar status={pipelineStatus} className="mb-8" />

          {/* Progress indicator for running stages */}
          {progress && (
            <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <span className="text-sm text-blue-700">{progress.message}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* ==================== Financial Model Status Card ==================== */}
          {(financialModelStatus !== 'idle') && (
            <div className={cn(
              'mb-6 rounded-xl border px-5 py-4 flex items-start gap-3',
              financialModelStatus === 'generating' && 'border-blue-100 bg-blue-50',
              financialModelStatus === 'success' && 'border-green-100 bg-green-50',
              financialModelStatus === 'skipped' && 'border-amber-100 bg-amber-50',
            )}>
              <div className="mt-0.5">
                {financialModelStatus === 'generating' && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                )}
                {financialModelStatus === 'success' && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
                {financialModelStatus === 'skipped' && (
                  <FileText className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  financialModelStatus === 'generating' && 'text-blue-800',
                  financialModelStatus === 'success' && 'text-green-800',
                  financialModelStatus === 'skipped' && 'text-amber-800',
                )}>
                  {financialModelStatus === 'generating' && 'Generating financial model (Excel)...'}
                  {financialModelStatus === 'success' && 'Financial model generated and saved to Drive vault'}
                  {financialModelStatus === 'skipped' && 'Financial model generation skipped or failed'}
                </p>
                {financialModelStatus === 'success' && financialModelFileUrl && (
                  <a
                    href={financialModelFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    Open in Drive <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ==================== STEP 2: Documents (Vault) ==================== */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                vaultStatus === 'success' ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'
              )}>
                {vaultStatus === 'success' ? <Check className="h-3.5 w-3.5" /> : '2'}
              </span>
              <h2 className="text-base font-semibold text-neutral-900">Documents & Vault</h2>
            </div>

            {vaultStatus === 'idle' && (
              <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
                <FolderOpen className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm text-neutral-500 mb-1">Drive vault is created automatically when you start the generator.</p>
                <p className="text-xs text-neutral-400 mb-3">If it failed, you can retry manually.</p>
                <Button onClick={() => handleCreateVault()} variant="outline" size="sm">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Create Vault Manually
                </Button>
              </div>
            )}

            {vaultStatus === 'loading' && (
              <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
                <Spinner size="sm" />
                <p className="text-sm text-neutral-500 mt-2">Creating vault...</p>
              </div>
            )}

            {vaultStatus === 'success' && (
              <div className="rounded-xl border border-neutral-200 bg-white">
                <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-accent-500" />
                    <span className="text-sm font-medium text-neutral-700">Vault</span>
                    {vaultLink && (
                      <a href={vaultLink} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-500 hover:underline flex items-center gap-1">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setIsUploadOpen(true)}>
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Upload
                    </Button>
                    {selectedDocumentIds.length > 0 && ingestionStatus !== 'done' && (
                      <Button
                        size="sm"
                        onClick={handleIngestDocuments}
                        disabled={ingestionStatus === 'ingesting'}
                      >
                        {ingestionStatus === 'ingesting' ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            {ingestionProgress.current}/{ingestionProgress.total}
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 mr-1" />
                            Ingest ({selectedDocumentIds.length})
                          </>
                        )}
                      </Button>
                    )}
                    {ingestionStatus === 'done' && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Ingested
                      </span>
                    )}
                  </div>
                </div>

                {/* Document List */}
                {vaultDocuments.length > 0 ? (
                  <div className="p-4">
                    <div className="space-y-1.5">
                      {vaultDocuments.map((doc) => (
                        <label
                          key={doc.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDocumentIds.includes(doc.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDocumentIds(prev => [...prev, doc.id]);
                              } else {
                                setSelectedDocumentIds(prev => prev.filter(id => id !== doc.id));
                              }
                            }}
                            className="rounded border-neutral-300"
                          />
                          <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span className="text-sm text-neutral-700 truncate flex-1">{doc.name}</span>
                          <span className="text-xs text-neutral-400">{(doc.size / 1024).toFixed(0)} KB</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-xs text-neutral-400">No documents in vault. Upload files to continue.</p>
                  </div>
                )}
              </div>
            )}

            {/* Upload Dialog */}
            {vaultId && (
              <DocumentUploadDialog
                open={isUploadOpen}
                onOpenChange={setIsUploadOpen}
                folderId={vaultId}
                onUploadComplete={(doc) => {
                  setVaultDocuments(prev => [...prev, doc]);
                  toast.success(`${doc.name} uploaded`);
                }}
              />
            )}
          </section>

          {/* ==================== STAGE 0: Sector Framework ==================== */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                  currentStage > 1 ? 'bg-green-100 text-green-700' :
                  currentStage === 1 ? 'bg-accent-100 text-accent-700' :
                  'bg-neutral-200 text-neutral-600'
                )}>
                  {currentStage > 1 ? <Check className="h-3.5 w-3.5" /> : '3'}
                </span>
                <h2 className="text-base font-semibold text-neutral-900">Stage 0: Sector Framework</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowStage0Prompt(!showStage0Prompt)}
                  className="text-neutral-500 text-xs"
                >
                  {showStage0Prompt ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                  {showStage0Prompt ? 'Hide Prompt' : 'View Prompt'}
                </Button>
                {(pipelineStatus === 'documents_ready' || pipelineStatus === 'documents_ingesting') && (
                  <Button onClick={handleRunStage0} disabled={isRunning} size="sm">
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Generate Framework
                  </Button>
                )}
              </div>
            </div>

            {/* Prompt Viewer */}
            {showStage0Prompt && (
              <PromptViewer
                title="Sector Framework Prompt"
                systemPrompt={`You are a senior equity research analyst specializing in Indian equity markets.\nYou are building a comprehensive sector knowledge framework for the [SECTOR] sector.\nYour output will serve as the analytical foundation for all future research in this sector.\n\nCRITICAL FORMATTING RULES:\n- Output in clean markdown ONLY.\n- Do NOT use any markdown tables. Use bullet points or numbered lists instead.\n- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.\n- Every sentence must carry analytical weight — no filler.`}
                userPrompt={`Create a comprehensive sector framework for the [SECTOR] sector covering:\n1. Sector Overview (TAM, growth phase)\n2. Key Metrics to Track (KPIs, industry-specific ratios)\n3. Value Chain (where value is created/captured)\n4. Competitive Dynamics (market structure, moats, pricing)\n5. Regulatory Landscape (key regulations, policy changes)\n6. Growth Drivers (structural, government initiatives, demand catalysts)\n7. Risk Factors (sector risks, cyclicality, disruption)\n8. Valuation Methodology (best methods, key multiples, historical ranges)\n9. Key Questions for Company Analysis (10 most important questions)\n\nBe specific to the Indian market context. Do NOT use markdown tables.`}
              />
            )}

            {pipelineStatus === 'stage0_generating' && !stage0Content && (
              <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                <Spinner size="sm" />
                <p className="text-sm text-neutral-500 mt-2">Generating sector framework...</p>
              </div>
            )}

            {stage0Content && (
              <StageReview
                title={`${selectedSector || session?.sector || ''} Sector Framework`}
                content={stage0Content}
                isApproved={currentStage > 1}
                isGenerating={pipelineStatus === 'stage0_generating'}
                onApprove={() => handleApprove('stage0')}
                onRegenerate={handleRunStage0}
                onEdit={(c) => setStage0Content(c)}
              />
            )}
          </section>

          {/* ==================== STAGE 1: Thesis ==================== */}
          {(currentStage >= 2 || pipelineStatus === 'stage0_approved' || pipelineStatus.startsWith('stage1')) && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    currentStage > 2 ? 'bg-green-100 text-green-700' :
                    currentStage === 2 ? 'bg-accent-100 text-accent-700' :
                    'bg-neutral-200 text-neutral-600'
                  )}>
                    {currentStage > 2 ? <Check className="h-3.5 w-3.5" /> : '4'}
                  </span>
                  <h2 className="text-base font-semibold text-neutral-900">Stage 1: Investment Thesis</h2>
                  <span className="text-xs text-neutral-400">(2 LLM calls)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowStage1Prompt(!showStage1Prompt)}
                    className="text-neutral-500 text-xs"
                  >
                    {showStage1Prompt ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showStage1Prompt ? 'Hide Prompt' : 'View Prompt'}
                  </Button>
                  {pipelineStatus === 'stage0_approved' && (
                    <Button onClick={handleRunStage1} disabled={isRunning} size="sm">
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      Generate Thesis
                    </Button>
                  )}
                </div>
              </div>

              {/* Stage 1 Prompt Viewer */}
              {showStage1Prompt && (
                <PromptViewer
                  title="Investment Thesis Prompt (Call 2/2)"
                  systemPrompt={`You are the Head of Research at a leading Indian investment bank.\nYou are writing a definitive investment thesis for [COMPANY] (NSE: [SYMBOL]).\nThis thesis will be the foundation of a detailed research initiation report.\nYour thesis must be data-driven, nuanced, and actionable for institutional investors.\nTake a clear stance — BUY, SELL, or HOLD — and defend it rigorously.\n\nCRITICAL FORMATTING RULES:\n- Output in clean markdown ONLY.\n- Do NOT use any markdown tables. Use bullet points or numbered lists instead.\n- For the Recommendation Summary, use a numbered list with bold labels instead of a table.`}
                  userPrompt={`Based on the condensed research analysis and sector framework, generate a comprehensive investment thesis covering:\n\n## Investment Thesis\nClear 3-5 paragraph thesis with BUY/SELL/HOLD recommendation and conviction level.\n\n## Bull Case\n3-5 factors driving upside with quantified potential.\n\n## Bear Case\n3-5 factors that could go wrong with downside quantification.\n\n## Key Catalysts (Next 12-18 months)\n5-8 specific, time-bound catalysts.\n\n## Key Risks\n5-8 specific risks with severity (High/Medium/Low) and mitigant.\n\n## Valuation & Target Price Rationale\nValuation methodology, peer comparison, target multiple, implied target price range.\n\n## Recommendation Summary\n- **Recommendation:** BUY / SELL / HOLD\n- **Conviction:** HIGH / MEDIUM / LOW\n- **Key Thesis:** one-line summary\n- **Primary Catalyst:** most important near-term catalyst\n- **Primary Risk:** most important risk factor\n- **Valuation Method:** method and multiple used\n\nDo NOT use markdown tables anywhere.`}
                />
              )}

              {pipelineStatus === 'stage1_generating' && !stage1Thesis && (
                <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                  <Spinner size="sm" />
                  <p className="text-sm text-neutral-500 mt-2">Generating thesis (2 LLM calls)...</p>
                </div>
              )}

              {stage1Condensed && (
                <StageReview
                  title="Condensed Analysis"
                  content={stage1Condensed}
                  isApproved={currentStage > 2}
                  isGenerating={pipelineStatus === 'stage1_generating'}
                  onApprove={() => {}}
                  onRegenerate={handleRunStage1}
                  onEdit={(c) => setStage1Condensed(c)}
                  className="mb-3"
                />
              )}

              {stage1Thesis && (
                <StageReview
                  title="Investment Thesis"
                  content={stage1Thesis}
                  isApproved={currentStage > 2}
                  isGenerating={pipelineStatus === 'stage1_generating'}
                  onApprove={() => handleApprove('stage1')}
                  onRegenerate={handleRunStage1}
                  onEdit={(c) => setStage1Thesis(c)}
                />
              )}
            </section>
          )}

          {/* ==================== STAGE 2: Full Report ==================== */}
          {(currentStage >= 3 || pipelineStatus === 'stage1_approved' || pipelineStatus.startsWith('stage2')) && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    currentStage > 3 ? 'bg-green-100 text-green-700' :
                    currentStage === 3 ? 'bg-accent-100 text-accent-700' :
                    'bg-neutral-200 text-neutral-600'
                  )}>
                    {currentStage > 3 ? <Check className="h-3.5 w-3.5" /> : '5'}
                  </span>
                  <h2 className="text-base font-semibold text-neutral-900">Stage 2: Research Report</h2>
                  <span className="text-xs text-neutral-400">(1 LLM call · 10 sections)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowStage2Prompt(!showStage2Prompt)}
                    className="text-neutral-500 text-xs"
                  >
                    {showStage2Prompt ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showStage2Prompt ? 'Hide Prompt' : 'View Prompt'}
                  </Button>
                  {pipelineStatus === 'stage1_approved' && (
                    <Button onClick={handleRunStage2} disabled={isRunning} size="sm">
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      Generate Report
                    </Button>
                  )}
                </div>
              </div>

              {/* Stage 2 Prompt Viewer */}
              {showStage2Prompt && (
                <PromptViewer
                  title="Full Report Prompt (1 unified call)"
                  systemPrompt={`You are a senior equity research analyst at a leading Indian investment bank.\nYou are writing a complete, institutional-grade research initiation report on [COMPANY] (NSE: [SYMBOL]).\nYour report must be data-driven, thorough, and written in a professional tone for institutional investors.\n\nCRITICAL FORMATTING RULES:\n- Output in clean markdown ONLY.\n- Do NOT use any markdown tables. Use bullet points or numbered lists instead.\n- Each section MUST begin with the separator: ===SECTION===\n  followed immediately by the section title on the next line.\n- Do not add any text before the first ===SECTION=== marker.`}
                  userPrompt={`Write a complete equity research initiation report covering ALL 10 sections in one response:\n\n1. Executive Summary\n2. Company Background\n3. Business Model\n4. Management Analysis\n5. Industry Overview\n6. Key Industry Tailwinds\n7. Demand Drivers\n8. Industry Risks\n9. Financial Analysis\n10. Valuation\n\nEach section must:\n- Be preceded by "===SECTION===" separator with title on next line\n- Be 300–600 words\n- Cite specific numbers and data points\n- Maintain consistency with the investment thesis\n- Use bullet points and numbered lists (no markdown tables)\n\nContext provided: Investment thesis, sector framework, financial data, research document excerpts.`}
                />
              )}

              {pipelineStatus === 'stage2_generating' && stage2Sections.length === 0 && (
                <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                  <Spinner size="sm" />
                  <p className="text-sm text-neutral-500 mt-2">Generating full report (single LLM call)...</p>
                </div>
              )}

              {stage2Sections.map((section, i) => (
                <StageReview
                  key={section.key}
                  title={section.title}
                  content={section.content}
                  isApproved={pipelineStatus === 'stage2_approved' || pipelineStatus === 'published'}
                  isGenerating={pipelineStatus === 'stage2_generating'}
                  onApprove={() => {
                    // Only approve on last section
                    if (i === stage2Sections.length - 1) handleApprove('stage2');
                  }}
                  onRegenerate={handleRunStage2}
                  className="mb-3"
                />
              ))}
            </section>
          )}

          {/* ==================== Publish ==================== */}
          {pipelineStatus === 'stage2_approved' && (
            <div className="flex justify-center py-6">
              <Button size="lg" onClick={handlePublish}>
                <FileText className="h-4 w-4 mr-2" />
                Publish Report
              </Button>
            </div>
          )}

          {pipelineStatus === 'published' && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center mb-8">
              <Check className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-green-800">Report Published</h3>
              <p className="text-xs text-green-600 mt-1">
                This report is now visible to customers.
              </p>
            </div>
          )}

          {/* Session Info Footer */}
          <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-400">
            <div className="flex items-center gap-4">
              <span>Session: {sessionId?.slice(0, 8)}</span>
              <span>Model: {PIPELINE_MODELS.find(m => m.id === selectedModel)?.label || selectedModel}</span>
              {session?.total_tokens_used && session.total_tokens_used > 0 && (
                <span>Tokens: {session.total_tokens_used.toLocaleString()}</span>
              )}
            </div>
            {session?.created_at && (
              <span>Created: {new Date(session.created_at).toLocaleString()}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ========================
// Metric Card Component
// ========================

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2.5">
      <p className="text-[10px] text-neutral-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

// ========================
// Prompt Viewer Component
// ========================

function PromptViewer({
  title,
  systemPrompt,
  userPrompt,
}: {
  title: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  const [tab, setTab] = useState<'system' | 'user'>('system');

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-100 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <TableProperties className="h-3.5 w-3.5 text-amber-700" />
          <span className="text-xs font-semibold text-amber-800">{title}</span>
          <span className="text-[10px] text-amber-600 bg-amber-200 px-1.5 py-0.5 rounded-full">
            No tables · Markdown only
          </span>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-amber-300 text-xs">
          <button
            onClick={() => setTab('system')}
            className={cn(
              'px-3 py-1 font-medium transition-colors',
              tab === 'system' ? 'bg-amber-700 text-white' : 'bg-white text-amber-700 hover:bg-amber-50'
            )}
          >
            System
          </button>
          <button
            onClick={() => setTab('user')}
            className={cn(
              'px-3 py-1 font-medium transition-colors',
              tab === 'user' ? 'bg-amber-700 text-white' : 'bg-white text-amber-700 hover:bg-amber-50'
            )}
          >
            User
          </button>
        </div>
      </div>
      <pre className="p-4 text-xs text-amber-900 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
        {tab === 'system' ? systemPrompt : userPrompt}
      </pre>
    </div>
  );
}
