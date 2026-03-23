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
import { useSectors } from '@/hooks/usePipelineSession';
import { useAuth } from '@/contexts/AuthContext';
import {
  createPipelineSession,
  transitionPipelineStatus,
  updatePipelineOutput,
  saveResearchSection,
  clearResearchSections,
  listPipelineSessions,
  deletePipelineSession,
  getPipelineSession,
  getResearchSections,
  getFrameworkFromPlaybook,
  getSectorPlaybook,
} from '@/lib/pipeline-api';
import {
  createVault,
  processVaultResponse,
  saveSessionDocuments,
  generateFinancialModel,
} from '@/lib/api';
import { ingestDocument } from '@/lib/ai';
import { runStage0, runStage1, runStage2, DEFAULT_PROMPTS } from '@/lib/pipeline-ai';
import type { PromptOverrides } from '@/lib/pipeline-ai';
import PromptEditor from '@/components/pipeline/PromptEditor';
import type { PipelineSession, PipelineProgress, PipelineStatus } from '@/types/pipeline';
import { PIPELINE_STAGE_LABELS, PIPELINE_MODELS, DEFAULT_PIPELINE_MODEL, getStageNumber } from '@/types/pipeline';
import type { MasterCompany, EquityUniverse } from '@/types/database';
import type { VaultDocument } from '@/types/vault';
import DocumentUploadDialog from '@/components/DocumentUploadDialog';
import { cn } from '@/lib/utils';
import {
  Search,
  Building2,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
  BarChart3,
  FolderOpen,
  Upload,
  Check,
  Trash2,
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

  // --- Financial Model State ---
  const [financialModelStatus, setFinancialModelStatus] = useState<'idle' | 'generating' | 'success' | 'skipped'>('idle');
  const [financialModelFileUrl, setFinancialModelFileUrl] = useState<string | null>(null);

  // --- Pipeline Stage State ---
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('company_selected');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);

  // --- Stage Outputs ---
  const [stage0Content, setStage0Content] = useState<string>('');
  const [stage0IsExisting, setStage0IsExisting] = useState(false);
  const [sectorFrameworkMarkdown, setSectorFrameworkMarkdown] = useState<string>('');
  const [stage1Thesis, setStage1Thesis] = useState<string>('');
  const [stage2Sections, setStage2Sections] = useState<Array<{ key: string; title: string; content: string }>>([]);

  // --- Prompt Visibility & Overrides ---
  const [showStage0Prompt, setShowStage0Prompt] = useState(false);
  const [showStage1Prompt, setShowStage1Prompt] = useState(false);
  const [showStage2Prompt, setShowStage2Prompt] = useState(false);
  const [stage0Prompts, setStage0Prompts] = useState<PromptOverrides>({});
  const [stage1Prompts, setStage1Prompts] = useState<PromptOverrides>({});
  const [stage2Prompts, setStage2Prompts] = useState<PromptOverrides>({});

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
    getPipelineSession(sessionId).then((s) => {
      if (s) {
        setSession(s);
        setPipelineStatus((s.pipeline_status ?? 'company_selected') as PipelineStatus);
        setSelectedModel(s.selected_model ?? DEFAULT_PIPELINE_MODEL);
        // Load stage outputs from session
        if (s.sector_framework) {
          const fw = s.sector_framework;
          setStage0Content(fw.overview || JSON.stringify(fw, null, 2));
        }
        if (s.thesis_output) setStage1Thesis(s.thesis_output);
        // Try to recover sectorFrameworkMarkdown from playbook
        const sectorName = s.sector || selectedSector;
        if (sectorName) {
          getSectorPlaybook(sectorName).then((pb) => {
            if (pb) setSectorFrameworkMarkdown(getFrameworkFromPlaybook(pb));
          });
        }
      }
    });
    getResearchSections(sessionId, 'stage2').then((sections) => {
      if (sections.length > 0) {
        setStage2Sections(sections.map(s => ({ key: s.section_key, title: s.section_title, content: s.content })));
      }
    });
  }, [sessionId]);

  // --- Company Selection ---
  const handleSelectCompany = useCallback((company: MasterCompany) => {
    setSelectedCompany(company);
    setSearchInput(company.company_name);
    setIsDropdownOpen(false);
  }, []);

  // --- Create Session (company_selected state) ---
  const handleCreateSession = async () => {
    if (!selectedCompany || !user?.email) return;
    const sector = selectedSector || financials?.sector || financials?.broad_sector || 'General';
    if (!selectedSector) setSelectedSector(sector);
    setIsCreatingSession(true);
    setShowRecent(false);

    try {
      const newSession = await createPipelineSession({
        company_name: selectedCompany.company_name,
        company_nse_code: selectedCompany.nse_symbol ?? '',
        sector,
        created_by: user.email,
        selected_model: selectedModel,
      });
      setSessionId(newSession.session_id);
      setSession(newSession);
      setPipelineStatus('company_selected');
      toast.success('Pipeline session created');
    } catch (err) {
      toast.error(`Failed to create session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // --- Generate Financial Model → then Create Vault ---
  const handleGenerateFinancialModel = async () => {
    if (!sessionId || !selectedCompany) return;
    const sector = selectedSector || session?.sector || 'General';

    try {
      // Transition to financial_model_generating
      await transitionPipelineStatus(sessionId, 'financial_model_generating', pipelineStatus);
      setPipelineStatus('financial_model_generating');
      setFinancialModelStatus('generating');

      // First create the vault (need folder for financial model)
      toast.info('Creating Drive vault...');
      setVaultStatus('loading');
      const vaultResponse = await createVault(selectedCompany.nse_symbol ?? '', sector);
      const { folderId, folderUrl, documents } = processVaultResponse(vaultResponse);
      setVaultLink(folderUrl);
      setVaultId(folderId);
      setVaultDocuments(documents);
      setVaultStatus('success');

      // Now generate financial model into the vault folder
      toast.info('Generating financial model...');
      const modelResult = await generateFinancialModel(
        selectedCompany.nse_symbol ?? '',
        selectedCompany.company_name,
        sector,
        folderId
      );
      setFinancialModelStatus('success');
      setFinancialModelFileUrl(modelResult.fileUrl);
      toast.success(`Financial model generated: ${modelResult.fileName}`);

      // Transition to financial_model_done → then vault_ready (vault was already created)
      await transitionPipelineStatus(sessionId, 'financial_model_done', 'financial_model_generating');
      // Since vault was created alongside, go straight to vault_ready
      await transitionPipelineStatus(sessionId, 'vault_creating', 'financial_model_done');
      await transitionPipelineStatus(sessionId, 'vault_ready', 'vault_creating');
      setPipelineStatus('vault_ready');

      // Refresh session
      const updated = await getPipelineSession(sessionId);
      if (updated) setSession(updated);
    } catch (err) {
      toast.error(`Financial model failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setFinancialModelStatus('skipped');
      // Try to recover — go back to company_selected
      try { await transitionPipelineStatus(sessionId, 'company_selected'); } catch {}
      setPipelineStatus('company_selected');
    }
  };

  // --- Skip Financial Model → Create Vault directly ---
  const handleSkipToVault = async () => {
    if (!sessionId || !selectedCompany) return;
    const sector = selectedSector || session?.sector || 'General';

    try {
      await transitionPipelineStatus(sessionId, 'vault_creating', pipelineStatus);
      setPipelineStatus('vault_creating');
      setVaultStatus('loading');
      setFinancialModelStatus('skipped');

      toast.info('Creating Drive vault...');
      const vaultResponse = await createVault(selectedCompany.nse_symbol ?? '', sector);
      const { folderId, folderUrl, documents } = processVaultResponse(vaultResponse);
      setVaultLink(folderUrl);
      setVaultId(folderId);
      setVaultDocuments(documents);
      setVaultStatus('success');
      toast.success('Drive vault created');

      await transitionPipelineStatus(sessionId, 'vault_ready', 'vault_creating');
      setPipelineStatus('vault_ready');

      const updated = await getPipelineSession(sessionId);
      if (updated) setSession(updated);
    } catch (err) {
      toast.error(`Vault creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setVaultStatus('error');
      try { await transitionPipelineStatus(sessionId, 'company_selected'); } catch {}
      setPipelineStatus('company_selected');
    }
  };

  // --- Document Ingestion ---
  const handleIngestDocuments = async () => {
    if (!sessionId || selectedDocumentIds.length === 0) return;

    try {
      await transitionPipelineStatus(sessionId, 'documents_ingesting', pipelineStatus);
      setPipelineStatus('documents_ingesting');
      setIngestionStatus('ingesting');

      const docsToIngest = vaultDocuments.filter(d => selectedDocumentIds.includes(d.id));
      setIngestionProgress({ current: 0, total: docsToIngest.length });

      // Save documents to session_documents table
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

      // Ingest each document (creates embeddings)
      for (let i = 0; i < docsToIngest.length; i++) {
        setIngestionProgress({ current: i + 1, total: docsToIngest.length });
        await ingestDocument(docsToIngest[i].id, docsToIngest[i].name, sessionId);
      }

      setIngestionStatus('done');
      await transitionPipelineStatus(sessionId, 'documents_ready', 'documents_ingesting');
      setPipelineStatus('documents_ready');
      toast.success(`${docsToIngest.length} documents ingested`);
    } catch (err) {
      setIngestionStatus('error');
      toast.error(`Ingestion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      try { await transitionPipelineStatus(sessionId, 'vault_ready'); } catch {}
      setPipelineStatus('vault_ready');
    }
  };

  // --- Stage 0: Sector Framework ---
  const handleRunStage0 = useCallback(async () => {
    if (!sessionId || !session) return;
    setIsRunning(true);
    try {
      await transitionPipelineStatus(sessionId, 'stage0_generating', pipelineStatus);
      setPipelineStatus('stage0_generating');

      const { framework, frameworkMarkdown, tokensUsed, isExisting } = await runStage0(
        sessionId,
        session.company_name,
        session.company_nse_code,
        selectedSector || session?.sector || '',
        selectedModel,
        setProgress,
        stage0Prompts
      );

      const content = framework.overview || JSON.stringify(framework, null, 2);
      setStage0Content(content);
      setSectorFrameworkMarkdown(frameworkMarkdown);
      setStage0IsExisting(isExisting);

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
        content: frameworkMarkdown,
        tokens_used: tokensUsed,
      });

      await transitionPipelineStatus(sessionId, 'stage0_review', 'stage0_generating');
      setPipelineStatus('stage0_review');
      toast.success(isExisting ? 'Existing sector framework loaded' : 'Sector framework generated');
    } catch (err) {
      toast.error(`Stage 0 failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPipelineStatus('documents_ready');
      try { await transitionPipelineStatus(sessionId, 'documents_ready'); } catch {}
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [sessionId, session, pipelineStatus, selectedSector, selectedModel, stage0Prompts]);

  // --- Stage 1: Investment Thesis (single LLM call) ---
  const handleRunStage1 = useCallback(async () => {
    if (!sessionId || !session) return;
    setIsRunning(true);
    try {
      await transitionPipelineStatus(sessionId, 'stage1_generating', pipelineStatus);
      setPipelineStatus('stage1_generating');

      const { thesis, tokensUsed } = await runStage1(
        sessionId,
        session.company_name,
        session.company_nse_code,
        selectedSector || session?.sector || '',
        financials ?? null,
        sectorFrameworkMarkdown,
        null,
        selectedModel,
        setProgress,
        stage1Prompts
      );

      setStage1Thesis(thesis);

      await updatePipelineOutput(sessionId, {
        thesis_output: thesis,
        total_tokens_used: (session.total_tokens_used || 0) + tokensUsed,
      });

      await clearResearchSections(sessionId, 'stage1');
      await saveResearchSection({
        session_id: sessionId,
        section_key: 'investment_thesis',
        section_title: 'Investment Thesis',
        stage: 'stage1',
        content: thesis,
        sort_order: 0,
        tokens_used: tokensUsed,
      });

      await transitionPipelineStatus(sessionId, 'stage1_review', 'stage1_generating');
      setPipelineStatus('stage1_review');
      toast.success('Investment thesis generated');
    } catch (err) {
      toast.error(`Stage 1 failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPipelineStatus('stage0_approved');
      try { await transitionPipelineStatus(sessionId, 'stage0_approved'); } catch {}
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [sessionId, session, pipelineStatus, financials, selectedSector, selectedModel, sectorFrameworkMarkdown, stage1Prompts]);

  // --- Stage 2: Full Report ---
  const handleRunStage2 = useCallback(async () => {
    if (!sessionId || !session || !stage1Thesis) return;
    setIsRunning(true);
    try {
      await transitionPipelineStatus(sessionId, 'stage2_generating', pipelineStatus);
      setPipelineStatus('stage2_generating');

      const { sections: reportSections, tokensUsed } = await runStage2(
        sessionId,
        session.company_name,
        session.company_nse_code,
        selectedSector || session?.sector || '',
        financials ?? null,
        stage1Thesis,
        sectorFrameworkMarkdown,
        null,
        selectedModel,
        setProgress,
        stage2Prompts
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
  }, [sessionId, session, pipelineStatus, financials, selectedSector, selectedModel, stage1Thesis, sectorFrameworkMarkdown, stage2Prompts]);

  // --- Approve Handlers ---
  const handleApprove = async (stage: 'stage0' | 'stage1' | 'stage2') => {
    if (!sessionId) return;
    const newStatus: PipelineStatus =
      stage === 'stage0' ? 'stage0_approved' :
      stage === 'stage1' ? 'stage1_approved' : 'stage2_approved';
    try {
      await transitionPipelineStatus(sessionId, newStatus, pipelineStatus);
      setPipelineStatus(newStatus);
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
        setPipelineStatus('company_selected');
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
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Research Pipeline</h1>
        </div>
        <p className="text-sm text-neutral-500">
          AI-powered equity research — Sector Framework → Investment Thesis → Full Report
        </p>
      </div>

      {/* ==================== STEP 1: Company + Model Selection ==================== */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-600 text-white text-xs font-bold">1</span>
          <h2 className="text-base font-semibold text-neutral-900">Select Company & Model</h2>
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
                    <span className="ml-2 text-xs text-neutral-400">{company.nse_symbol}</span>
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
                <Button onClick={handleCreateSession} disabled={isCreatingSession}>
                  {isCreatingSession ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Start Pipeline
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
              const st = (s.pipeline_status ?? 'company_selected') as PipelineStatus;
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

          {/* ==================== STEP 2: Choose Path — Financial Model or Skip to Vault ==================== */}
          {pipelineStatus === 'company_selected' && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-accent-700 text-xs font-bold">2</span>
                <h2 className="text-base font-semibold text-neutral-900">Choose Your Path</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option A: Generate Financial Model */}
                <button
                  onClick={handleGenerateFinancialModel}
                  className="group rounded-xl border-2 border-neutral-200 bg-white p-6 text-left hover:border-accent-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                      <BarChart3 className="h-5 w-5 text-blue-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-900">Generate Financial Model First</h3>
                  </div>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Generate an Excel financial model, save it to the Drive vault, then proceed to document ingestion.
                    Recommended if you need financial projections for the analysis.
                  </p>
                </button>

                {/* Option B: Skip to Vault */}
                <button
                  onClick={handleSkipToVault}
                  className="group rounded-xl border-2 border-neutral-200 bg-white p-6 text-left hover:border-accent-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors">
                      <FolderOpen className="h-5 w-5 text-green-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-900">Skip to Create Vault</h3>
                  </div>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Create a Drive vault with existing documents and proceed directly to document ingestion.
                    Use this if financial model isn't needed or already exists.
                  </p>
                </button>
              </div>
            </section>
          )}

          {/* ==================== Financial Model In-Progress / Status ==================== */}
          {(pipelineStatus === 'financial_model_generating' || pipelineStatus === 'financial_model_done') && (
            <div className={cn(
              'mb-6 rounded-xl border px-5 py-4 flex items-start gap-3',
              pipelineStatus === 'financial_model_generating' ? 'border-blue-100 bg-blue-50' : 'border-green-100 bg-green-50',
            )}>
              <div className="mt-0.5">
                {pipelineStatus === 'financial_model_generating' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  pipelineStatus === 'financial_model_generating' ? 'text-blue-800' : 'text-green-800',
                )}>
                  {pipelineStatus === 'financial_model_generating'
                    ? 'Generating financial model & creating vault...'
                    : 'Financial model generated and saved to Drive vault'}
                </p>
                {financialModelFileUrl && (
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

          {/* Financial Model status indicator (for vault_ready and beyond) */}
          {financialModelStatus === 'success' && getStageNumber(pipelineStatus) >= 1 && (
            <div className="mb-4 rounded-lg border border-green-100 bg-green-50 px-4 py-2.5 flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs text-green-700 font-medium">Financial model saved to vault</span>
              {financialModelFileUrl && (
                <a href={financialModelFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline flex items-center gap-1 ml-auto">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          {financialModelStatus === 'skipped' && getStageNumber(pipelineStatus) >= 1 && (
            <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5 flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-amber-700 font-medium">Financial model skipped</span>
            </div>
          )}

          {/* ==================== STEP 3: Documents & Vault ==================== */}
          {(getStageNumber(pipelineStatus) >= 1 || pipelineStatus === 'vault_creating') && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                  getStageNumber(pipelineStatus) > 2 ? 'bg-green-100 text-green-700' :
                  getStageNumber(pipelineStatus) >= 1 ? 'bg-accent-100 text-accent-700' :
                  'bg-neutral-200 text-neutral-600'
                )}>
                  {getStageNumber(pipelineStatus) > 2 ? <Check className="h-3.5 w-3.5" /> : '3'}
                </span>
                <h2 className="text-base font-semibold text-neutral-900">Documents & Vault</h2>
              </div>

              {vaultStatus === 'loading' && (
                <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
                  <Spinner size="sm" />
                  <p className="text-sm text-neutral-500 mt-2">Creating vault...</p>
                </div>
              )}

              {vaultStatus === 'error' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
                  <p className="text-sm text-red-600 mb-2">Vault creation failed</p>
                  <Button onClick={handleSkipToVault} variant="outline" size="sm">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </Button>
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
                              disabled={ingestionStatus === 'done'}
                            />
                            <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                            <span className="text-sm text-neutral-700 truncate flex-1">{doc.name}</span>
                            <span className="text-xs text-neutral-400">{(doc.size / 1024).toFixed(0)} KB</span>
                          </label>
                        ))}
                      </div>
                      {/* Select All / Deselect All */}
                      {ingestionStatus !== 'done' && vaultDocuments.length > 1 && (
                        <div className="mt-2 pt-2 border-t border-neutral-100 flex gap-2">
                          <button
                            onClick={() => setSelectedDocumentIds(vaultDocuments.map(d => d.id))}
                            className="text-xs text-accent-600 hover:underline"
                          >
                            Select all
                          </button>
                          <span className="text-xs text-neutral-300">|</span>
                          <button
                            onClick={() => setSelectedDocumentIds([])}
                            className="text-xs text-neutral-500 hover:underline"
                          >
                            Deselect all
                          </button>
                        </div>
                      )}
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
          )}

          {/* ==================== STAGE 0: Sector Framework ==================== */}
          {getStageNumber(pipelineStatus) >= 2 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    currentStage > 3 ? 'bg-green-100 text-green-700' :
                    currentStage === 3 ? 'bg-accent-100 text-accent-700' :
                    'bg-neutral-200 text-neutral-600'
                  )}>
                    {currentStage > 3 ? <Check className="h-3.5 w-3.5" /> : '4'}
                  </span>
                  <h2 className="text-base font-semibold text-neutral-900">Stage 0: Sector Framework</h2>
                  {stage0IsExisting && stage0Content && (
                    <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                      Loaded from playbook
                    </span>
                  )}
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
                  {pipelineStatus === 'documents_ready' && (
                    <Button onClick={handleRunStage0} disabled={isRunning} size="sm">
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      Generate Framework
                    </Button>
                  )}
                </div>
              </div>

              {showStage0Prompt && (
                <PromptEditor
                  stageKey="pipeline_stage0"
                  title="Sector Framework Prompt"
                  defaultSystem={DEFAULT_PROMPTS.stage0.system}
                  defaultUser={DEFAULT_PROMPTS.stage0.user}
                  userEmail={user?.email}
                  onChange={setStage0Prompts}
                  className="mb-4"
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
                  content={sectorFrameworkMarkdown || stage0Content}
                  isApproved={currentStage > 3}
                  isGenerating={pipelineStatus === 'stage0_generating'}
                  onApprove={() => handleApprove('stage0')}
                  onRegenerate={handleRunStage0}
                  onEdit={(c) => { setStage0Content(c); setSectorFrameworkMarkdown(c); }}
                />
              )}
            </section>
          )}

          {/* ==================== STAGE 1: Investment Thesis ==================== */}
          {(currentStage >= 4 || pipelineStatus === 'stage0_approved' || pipelineStatus.startsWith('stage1')) && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    currentStage > 4 ? 'bg-green-100 text-green-700' :
                    currentStage === 4 ? 'bg-accent-100 text-accent-700' :
                    'bg-neutral-200 text-neutral-600'
                  )}>
                    {currentStage > 4 ? <Check className="h-3.5 w-3.5" /> : '5'}
                  </span>
                  <h2 className="text-base font-semibold text-neutral-900">Stage 1: Investment Thesis</h2>
                  <span className="text-xs text-neutral-400">(1 LLM call · RAG + Framework + Financials)</span>
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

              {showStage1Prompt && (
                <PromptEditor
                  stageKey="pipeline_stage1"
                  title="Investment Thesis Prompt (Single Call)"
                  defaultSystem={DEFAULT_PROMPTS.stage1.system}
                  defaultUser={DEFAULT_PROMPTS.stage1.user}
                  userEmail={user?.email}
                  onChange={setStage1Prompts}
                  className="mb-4"
                />
              )}

              {pipelineStatus === 'stage1_generating' && !stage1Thesis && (
                <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                  <Spinner size="sm" />
                  <p className="text-sm text-neutral-500 mt-2">Generating investment thesis...</p>
                </div>
              )}

              {stage1Thesis && (
                <StageReview
                  title="Investment Thesis"
                  content={stage1Thesis}
                  isApproved={currentStage > 4}
                  isGenerating={pipelineStatus === 'stage1_generating'}
                  onApprove={() => handleApprove('stage1')}
                  onRegenerate={handleRunStage1}
                  onEdit={(c) => setStage1Thesis(c)}
                />
              )}
            </section>
          )}

          {/* ==================== STAGE 2: Full Report ==================== */}
          {(currentStage >= 5 || pipelineStatus === 'stage1_approved' || pipelineStatus.startsWith('stage2')) && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    currentStage > 5 ? 'bg-green-100 text-green-700' :
                    currentStage === 5 ? 'bg-accent-100 text-accent-700' :
                    'bg-neutral-200 text-neutral-600'
                  )}>
                    {currentStage > 5 ? <Check className="h-3.5 w-3.5" /> : '6'}
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

              {showStage2Prompt && (
                <PromptEditor
                  stageKey="pipeline_stage2"
                  title="Full Report Prompt (1 unified call)"
                  defaultSystem={DEFAULT_PROMPTS.stage2.system}
                  defaultUser={DEFAULT_PROMPTS.stage2.user}
                  userEmail={user?.email}
                  onChange={setStage2Prompts}
                  className="mb-4"
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

