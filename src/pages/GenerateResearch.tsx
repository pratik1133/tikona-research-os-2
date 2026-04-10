import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Search,
  X,
  Building2,
  Upload,
  Sparkles,
  Brain,
  Edit2,
  Check,
  Plus,
  DownloadCloud,
  Trash2,
  Save,
  ExternalLink,
  RefreshCw,
  Mic,
  Volume2,
  Video,
  Clapperboard,
  Send,
  ChevronUp,
  ChevronDown,
  Type,
  MoreHorizontal,
  Undo2,
  ChevronsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanySearch, useCompanyFinancials } from '@/hooks/useCompanySearch';
import {
  createVault,
  processVaultResponse,
  deleteDocument,
  saveResearchSession,
  saveSessionDocuments,
  createResearchReport,
  updateReportSection,
  updateCustomSection,
  updateSectionHeading,
  addReportSectionColumn,
  dropReportSectionColumn,
  listPromptTemplates,
  updatePromptTemplate,
  createPromptTemplate,
  deletePromptTemplate,
  publishReport,
  finalizeReport,
} from '@/lib/api';
import {
  ingestDocument,
  generateSingleSection,
  generateSectionHeading,
  REPORT_SECTIONS,
  type ReportSection,
  type CustomPrompt,
} from '@/lib/ai';
import { supabase, getCurrentUserEmail } from '@/lib/supabase';
import type { MasterCompany, TextSectionKey } from '@/types/database';
import type { VaultDocument } from '@/types/vault';
import FileManager from '@/components/FileManager';
import DocumentUploadDialog from '@/components/DocumentUploadDialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type VaultStatus = 'idle' | 'loading' | 'success' | 'error';
type IngestionStatus = 'idle' | 'ingesting' | 'done' | 'error';

interface SectionState {
  key: string;
  title: string;
  headingPrompt: string; // Prompt to generate a dynamic heading
  generatedHeading: string; // AI-generated heading for this section
  prompt: string;
  output: string;
  status: 'idle' | 'generating' | 'generated' | 'confirmed';
  tokensUsed?: number;
  isEditingPrompt: boolean;
  isEditingOutput: boolean;
  isEditingHeadingPrompt: boolean;
  isEditingHeading: boolean; // true when user is inline-editing the generated heading
  promptTemplateId?: string; // ID from prompt_templates table (if loaded from DB)
  promptDirty?: boolean; // true when prompt was edited but not saved to DB
  searchKeywords?: string[]; // keywords for RAG retrieval (custom sections)
  isCustom?: boolean; // true for user-added custom sections
  headingStatus?: 'idle' | 'generating' | 'generated'; // Status for heading generation
}

function formatCurrency(value: number | null): string {
  if (value == null) return '-';
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value == null) return '-';
  return `${value.toFixed(2)}${suffix}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return '-';
  return `${value.toFixed(2)}%`;
}

export default function GenerateResearch() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<MasterCompany | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>('idle');
  const [vaultLink, setVaultLink] = useState<string | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ingestion state
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus>('idle');
  const [ingestionProgress, setIngestionProgress] = useState({ current: 0, total: 0 });

  // Sections state for 3-column editor
  const [sections, setSections] = useState<SectionState[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [, setCustomPrompts] = useState<CustomPrompt[]>([]);

  // Refs to hold current values for async callbacks (avoids stale closures)
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const reportIdRef = useRef(reportId);
  reportIdRef.current = reportId;
  const selectedDocIdsRef = useRef(selectedDocumentIds);
  selectedDocIdsRef.current = selectedDocumentIds;

  // Custom section dialog
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionHeadingPrompt, setNewSectionHeadingPrompt] = useState('');
  const [newSectionPrompt, setNewSectionPrompt] = useState('');
  const [newSectionKeywords, setNewSectionKeywords] = useState('');

  // Card UI state
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [expandedOutputKey, setExpandedOutputKey] = useState<string | null>(null);
  const [editPromptModalKey, setEditPromptModalKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Update Universal Prompt confirmation dialog
  const [isPromptUpdateDialogOpen, setIsPromptUpdateDialogOpen] = useState(false);
  const [promptUpdateSectionKey, setPromptUpdateSectionKey] = useState<string | null>(null);

  // PPT/PDF state
  const [pptGenerating, setPptGenerating] = useState(false);
  const [pptDialogOpen, setPptDialogOpen] = useState(false);
  const [pptElapsedSeconds, setPptElapsedSeconds] = useState(0);
  const [pptFileUrl, setPptFileUrl] = useState<string | null>(null);
  const [pptFileId, setPptFileId] = useState<string | null>(null);
  const [pptFileName, setPptFileName] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfFileId, setPdfFileId] = useState<string | null>(null);
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // increment to force iframe refresh
  const pptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Podcast state
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [podcastScript, setPodcastScript] = useState<string | null>(null);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);

  // Video state
  const [videoScript, setVideoScript] = useState<string>('');
  const [videoFileUrl, setVideoFileUrl] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoElapsedSeconds, setVideoElapsedSeconds] = useState(0);

  // Publish state
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Cleanup PPT timer on unmount
  useEffect(() => {
    return () => {
      if (pptTimerRef.current) {
        clearInterval(pptTimerRef.current);
      }
    };
  }, []);

  // Close dropdown menu on outside click
  useEffect(() => {
    if (!openMenuKey) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuKey(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuKey]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Search master_company
  const { data: results, isLoading: searchLoading } = useCompanySearch(debouncedSearch);

  // Fetch equity_universe data for selected company
  const { data: financials, isLoading: financialsLoading, refetch: refetchFinancials } = useCompanyFinancials(
    selectedCompany
      ? {
        nse_symbol: selectedCompany.nse_symbol,
        isin: selectedCompany.isin,
        bse_code: selectedCompany.bse_code,
      }
      : null
  );

  // Refresh data via n8n webhook
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open dropdown when results arrive
  useEffect(() => {
    if (results && results.length > 0 && searchInput.trim().length >= 2 && !selectedCompany) {
      setIsDropdownOpen(true);
    }
  }, [results, searchInput, selectedCompany]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toUpperCase();
      setSearchInput(value);
      if (selectedCompany) {
        setSelectedCompany(null);
        setVaultStatus('idle');
        setVaultLink(null);
        setVaultId(null);
        setVaultDocuments([]);
        setSelectedDocumentIds([]);
        setErrorMessage(null);
        setSessionId(null);
        setIngestionStatus('idle');
        setSections([]);
        setReportId(null);
      }
    },
    [selectedCompany]
  );

  const handleSelect = useCallback((company: MasterCompany) => {
    setSelectedCompany(company);
    setSearchInput(company.nse_symbol || company.company_name);
    setIsDropdownOpen(false);
  }, []);

  const handleClear = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedCompany(null);
    setIsDropdownOpen(false);
    setVaultStatus('idle');
    setVaultLink(null);
    setVaultId(null);
    setVaultDocuments([]);
    setSelectedDocumentIds([]);
    setErrorMessage(null);
    setSessionId(null);
    setIngestionStatus('idle');
    setSections([]);
    setReportId(null);
  }, []);

  const handleRefreshData = useCallback(async () => {
    const code = selectedCompany?.nse_symbol || selectedCompany?.isin;
    if (!code || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const response = await fetch('https://n8n.tikonacapital.com/webhook/fetch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Upsert the returned data into equity_universe
      if (result && typeof result === 'object') {
        // Determine the lookup key — use isin_code as the unique identifier
        const isinCode = result.isin_code || selectedCompany.isin;
        if (isinCode) {
          // Check if record exists
          const { data: existing } = await supabase
            .from('equity_universe')
            .select('company_id')
            .eq('isin_code', isinCode)
            .maybeSingle();

          // Remove fields that shouldn't be overwritten or aren't DB columns
          const { company_id, created_at, updated_at, ...updateFields } = result;

          if (existing) {
            // Update existing record
            await supabase
              .from('equity_universe')
              .update({ ...updateFields, updated_at: new Date().toISOString() })
              .eq('isin_code', isinCode);
          } else {
            // Insert new record
            await supabase
              .from('equity_universe')
              .insert({ ...updateFields, isin_code: isinCode });
          }
        }
      }

      // Refetch from DB to show latest data
      await refetchFinancials();
      toast.success('Financial data refreshed successfully');
    } catch (error) {
      console.error('[RefreshData] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedCompany, isRefreshing, refetchFinancials]);

  const handleGenerateResearch = useCallback(async () => {
    if (!selectedCompany?.nse_symbol) return;

    setVaultStatus('loading');
    setErrorMessage(null);
    setVaultLink(null);
    setVaultId(null);
    setVaultDocuments([]);
    setSelectedDocumentIds([]);

    try {
      const sector = financials?.sector || financials?.broad_sector || 'General';

      const response = await createVault(selectedCompany.nse_symbol, sector);

      if (response.status === 'success' && response.folder_link) {
        const { folderId, folderUrl, documents } = processVaultResponse(response);

        setVaultLink(folderUrl);
        setVaultId(folderId);
        setVaultDocuments(documents);
        setVaultStatus('success');

        // Auto-save session to database
        try {
          const userEmail = await getCurrentUserEmail();
          if (!userEmail) {
            throw new Error('Not logged in. Please sign in and try again.');
          }
            const session = await saveResearchSession({
              user_email: userEmail,
              nse_symbol: selectedCompany.nse_symbol ?? '',
              company_name: selectedCompany.company_name,
              sector,
              status: 'document_review',
            });
            setSessionId(session.session_id);

            // Save document metadata to session_documents
            // Filter out documents without valid IDs (e.g., folder objects from n8n)
            const validDocs = documents.filter((doc) => {
              if (!doc.id) {
                console.warn('[GenerateResearch] Skipping document without ID:', doc.name);
                return false;
              }
              return true;
            });

            if (validDocs.length > 0) {
              await saveSessionDocuments(
                validDocs.map((doc) => ({
                  session_id: session.session_id,
                  drive_file_id: doc.id,
                  file_name: doc.name,
                  mime_type: doc.mimeType,
                  file_size: doc.size,
                  view_url: doc.viewUrl,
                  download_url: doc.downloadUrl,
                  document_type: doc.type,
                  category: doc.category,
                }))
              );
            }

            if (validDocs.length < documents.length) {
              console.warn(`[GenerateResearch] ${documents.length - validDocs.length} documents skipped (missing ID)`);
            }

            toast.success('Session saved automatically');
        } catch (saveError) {
          console.error('[GenerateResearch] Failed to auto-save session:', saveError);
          toast.error(
            `Session save failed: ${saveError instanceof Error ? saveError.message : 'Unknown error'}. AI features require a saved session.`
          );
        }
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('[GenerateResearch] Error creating vault:', error);
      setVaultStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to create vault. Please try again.'
      );
    }
  }, [selectedCompany, financials]);

  const handleReset = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedCompany(null);
    setVaultStatus('idle');
    setVaultLink(null);
    setVaultId(null);
    setVaultDocuments([]);
    setSelectedDocumentIds([]);
    setErrorMessage(null);
    setSessionId(null);
    setIngestionStatus('idle');
    setSections([]);
    setReportId(null);
  }, []);

  const handleFileDelete = useCallback(async (fileId: string) => {
    const docToDelete = vaultDocuments.find(doc => doc.id === fileId);
    if (!docToDelete) return;

    if (!window.confirm(`Delete "${docToDelete.name}"? This cannot be undone.`)) return;

    try {
      setVaultDocuments((prev) => prev.filter((doc) => doc.id !== fileId));
      setSelectedDocumentIds((prev) => prev.filter((id) => id !== fileId));
      await deleteDocument(fileId);
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('[GenerateResearch] Error deleting file:', error);
      setVaultDocuments((prev) => [...prev, docToDelete]);
      toast.error(
        error instanceof Error
          ? `Failed to delete: ${error.message}`
          : 'Failed to delete file. Please try again.'
      );
    }
  }, [vaultDocuments]);

  const handleFileSelect = useCallback((fileIds: string[]) => {
    setSelectedDocumentIds(fileIds);
  }, []);

  const handleUploadComplete = useCallback(
    (newDoc: VaultDocument) => {
      setVaultDocuments((prev) => [...prev, newDoc]);
      toast.success(`Uploaded: ${newDoc.name}`);

      if (sessionId) {
        saveSessionDocuments([
          {
            session_id: sessionId,
            drive_file_id: newDoc.id,
            file_name: newDoc.name,
            mime_type: newDoc.mimeType,
            file_size: newDoc.size,
            view_url: newDoc.viewUrl,
            download_url: newDoc.downloadUrl,
            document_type: newDoc.type,
            category: newDoc.category,
          },
        ]).catch((err) => console.error('Failed to save uploaded doc to session:', err));
      }
    },
    [sessionId]
  );

  // ========================
  // Ingestion
  // ========================
  const handleIngestDocuments = useCallback(async () => {
    if (!sessionId || vaultDocuments.length === 0) {
      toast.error('No documents to ingest');
      return;
    }

    const docsToIngest = selectedDocumentIds.length > 0
      ? vaultDocuments.filter((d) => selectedDocumentIds.includes(d.id))
      : vaultDocuments;

    if (docsToIngest.length === 0) {
      toast.error('No documents selected for ingestion');
      return;
    }

    setIngestionStatus('ingesting');
    setIngestionProgress({ current: 0, total: docsToIngest.length });

    let successCount = 0;
    for (let i = 0; i < docsToIngest.length; i++) {
      const doc = docsToIngest[i];
      setIngestionProgress({ current: i + 1, total: docsToIngest.length });

      try {
        await ingestDocument(doc.id, doc.name, sessionId);
        successCount++;
      } catch (error) {
        console.error(`[GenerateResearch] Ingestion failed for ${doc.name}:`, error);
        toast.error(`Ingestion failed: ${doc.name}`);
      }
    }

    if (successCount > 0) {
      setIngestionStatus('done');
      toast.success(`${successCount}/${docsToIngest.length} documents ingested for AI`);

      // Load custom prompts from database
      let loadedPrompts: CustomPrompt[] = [];
      let templates: { id: string; section_key: string; title: string; heading_prompt?: string; prompt_text: string; search_keywords: string[]; is_default: boolean; user_email: string | null }[] = [];
      try {
        const userEmail = await getCurrentUserEmail();
        templates = await listPromptTemplates(userEmail || undefined);
        loadedPrompts = templates.map((t) => ({
          sectionKey: t.section_key,
          title: t.title,
          promptText: t.prompt_text,
          searchKeywords: t.search_keywords || [],
        }));
        setCustomPrompts(loadedPrompts);
        console.log('[GenerateResearch] Loaded', loadedPrompts.length, 'custom prompts from database');
      } catch (err) {
        console.error('[GenerateResearch] Failed to load custom prompts:', err);
        // Continue with default prompts
      }

      // Initialize sections - start with the 7 hardcoded defaults, override with DB prompts,
      // then append any extra DB sections that don't match any hardcoded section.
      const usedTemplateIds = new Set<string>();

      const defaultSections: SectionState[] = REPORT_SECTIONS.map((s) => {
        // Find matching custom prompt by section key (case-insensitive match)
        const matchingTemplate = templates.find(
          (t) => t.section_key.toLowerCase() === s.key.toLowerCase() ||
            t.section_key.toLowerCase() === s.title.toLowerCase()
        );

        if (matchingTemplate) usedTemplateIds.add(matchingTemplate.id);

        return {
          key: s.key,
          title: matchingTemplate?.title || s.title,
          headingPrompt: matchingTemplate?.heading_prompt || s.headingPrompt || '',
          generatedHeading: '',
          prompt: matchingTemplate?.prompt_text || s.prompt,
          output: '',
          status: 'idle' as const,
          isEditingPrompt: false,
          isEditingOutput: false,
          isEditingHeadingPrompt: false,
          isEditingHeading: false,
          promptTemplateId: matchingTemplate?.id,
          promptDirty: false,
          searchKeywords: matchingTemplate?.search_keywords || s.searchKeywords,
        };
      });

      // Append custom sections from DB that don't match any hardcoded section
      const extraSections: SectionState[] = templates
        .filter((t) => !usedTemplateIds.has(t.id))
        .map((t) => ({
          key: t.section_key,
          title: t.title,
          headingPrompt: t.heading_prompt || '',
          generatedHeading: '',
          prompt: t.prompt_text,
          output: '',
          status: 'idle' as const,
          isEditingPrompt: false,
          isEditingOutput: false,
          isEditingHeadingPrompt: false,
          isEditingHeading: false,
          promptTemplateId: t.id,
          promptDirty: false,
          searchKeywords: t.search_keywords || [t.title.toLowerCase()],
          isCustom: true,
        }));

      const initialSections = [...defaultSections, ...extraSections];
      setSections(initialSections);
      console.log(`[GenerateResearch] Loaded ${defaultSections.length} default + ${extraSections.length} custom sections`);

      // Create report record
      try {
        const userEmail = await getCurrentUserEmail();
        const report = await createResearchReport({
          session_id: sessionId,
          user_email: userEmail || 'unknown',
          company_name: selectedCompany?.company_name || '',
          nse_symbol: selectedCompany?.nse_symbol || '',
        });
        setReportId(report.report_id);
      } catch (err) {
        console.error('[GenerateResearch] Failed to create report record:', err);
      }
    } else {
      setIngestionStatus('error');
      toast.error('All document ingestions failed');
    }
  }, [sessionId, vaultDocuments, selectedDocumentIds, selectedCompany]);

  // ========================
  // Section Generation
  // ========================
  const handleGenerateSection = useCallback(async (key: string) => {
    if (!sessionId || !selectedCompany) return;

    // Read current values from refs to avoid stale closures
    const currentSections = sectionsRef.current;
    const currentReportId = reportIdRef.current;

    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, status: 'generating' as const } : s))
    );

    try {
      const section = currentSections.find((s) => s.key === key);
      if (!section) return;

      const sectionKeywords = section.searchKeywords
        || REPORT_SECTIONS.find((r) => r.key === key)?.searchKeywords
        || [section.title.toLowerCase()];

      const reportSection: ReportSection = {
        key: key as TextSectionKey,
        title: section.title,
        headingPrompt: section.headingPrompt,
        searchKeywords: sectionKeywords,
        prompt: section.prompt,
      };

      const customPromptOverride: CustomPrompt = {
        sectionKey: key,
        title: section.title,
        promptText: section.prompt,
        searchKeywords: sectionKeywords,
      };

      const { content, tokensUsed } = await generateSingleSection(
        sessionId,
        selectedCompany.company_name,
        selectedCompany.nse_symbol || '',
        financials || null,
        reportSection,
        customPromptOverride,
        selectedDocIdsRef.current.length > 0 ? selectedDocIdsRef.current : null
      );

      setSections((prev) =>
        prev.map((s) =>
          s.key === key
            ? { ...s, output: content, status: 'generated' as const, tokensUsed }
            : s
        )
      );

      // Save to database
      if (currentReportId) {
        try {
          if (section.isCustom) {
            await updateCustomSection(currentReportId, key, content);
          } else {
            await updateReportSection(currentReportId, key as TextSectionKey, content);
          }
        } catch (err) {
          console.error(`[GenerateResearch] Failed to save section ${key}:`, err);
        }
      }

      toast.success(`Generated: ${section.title}`);
    } catch (error) {
      console.error(`[GenerateResearch] Generation failed for ${key}:`, error);
      setSections((prev) =>
        prev.map((s) => (s.key === key ? { ...s, status: 'idle' as const } : s))
      );
      toast.error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [sessionId, selectedCompany, financials]);

  const handleGenerateHeading = useCallback(async (key: string) => {
    if (!selectedCompany) return;

    const currentSections = sectionsRef.current;
    const currentReportId = reportIdRef.current;
    const section = currentSections.find((s) => s.key === key);
    if (!section) return;

    const headingPrompt = section.headingPrompt || `Generate a professional, concise heading for the "${section.title}" section of an equity research report.`;

    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, headingStatus: 'generating' as const } : s))
    );

    try {
      const heading = await generateSectionHeading(
        selectedCompany.company_name,
        section.title,
        headingPrompt
      );

      setSections((prev) =>
        prev.map((s) =>
          s.key === key
            ? { ...s, generatedHeading: heading, headingStatus: 'generated' as const }
            : s
        )
      );

      // Save to database
      if (currentReportId) {
        await updateSectionHeading(currentReportId, key, heading, !!section.isCustom);
      }

      toast.success('Heading generated');
    } catch (error) {
      console.error(`[GenerateResearch] Heading generation failed for ${key}:`, error);
      setSections((prev) =>
        prev.map((s) => (s.key === key ? { ...s, headingStatus: 'idle' as const } : s))
      );
      toast.error(`Heading generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [selectedCompany]);

  const handleGenerateAll = useCallback(async () => {
    const startTime = Date.now();
    let totalTokens = 0;
    const currentSections = sectionsRef.current;
    for (const section of currentSections) {
      if (section.status === 'idle') {
        await handleGenerateSection(section.key);
        totalTokens += sectionsRef.current.find(s => s.key === section.key)?.tokensUsed ?? 0;
      }
    }

    // Finalize report with tokens and timing
    const currentReportId = reportIdRef.current;
    if (currentReportId) {
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      try {
        await finalizeReport(currentReportId, totalTokens, elapsedSeconds);
      } catch (err) {
        console.error('[GenerateResearch] Failed to finalize report:', err);
      }
    }
  }, [handleGenerateSection]);

  const handleToggleEditOutput = useCallback((key: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, isEditingOutput: !s.isEditingOutput } : s))
    );
  }, []);

  const handleUpdateHeadingPrompt = useCallback((key: string, newHeadingPrompt: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, headingPrompt: newHeadingPrompt } : s))
    );
  }, []);

  const handleSaveHeadingPrompt = useCallback(async (key: string) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section?.promptTemplateId) return;

    try {
      await updatePromptTemplate(section.promptTemplateId, {
        heading_prompt: section.headingPrompt,
      });
      toast.success('Heading prompt saved');
    } catch (error) {
      console.error('[GenerateResearch] Failed to save heading prompt:', error);
      toast.error('Failed to save heading prompt');
    }
  }, []);

  const handleToggleEditHeading = useCallback((key: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, isEditingHeading: !s.isEditingHeading } : s))
    );
  }, []);

  const handleUpdateHeading = useCallback((key: string, newHeading: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, generatedHeading: newHeading } : s))
    );
  }, []);

  const handleSaveHeading = useCallback(async (key: string) => {
    const currentSections = sectionsRef.current;
    const currentReportId = reportIdRef.current;
    const section = currentSections.find((s) => s.key === key);
    if (!section || !currentReportId) return;

    try {
      await updateSectionHeading(currentReportId, key, section.generatedHeading, !!section.isCustom);
      toast.success('Heading saved');
    } catch (error) {
      console.error('[GenerateResearch] Failed to save heading:', error);
      toast.error('Failed to save heading');
    }
  }, []);

  const handleHeadingBlur = useCallback((key: string) => {
    handleSaveHeading(key);
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, isEditingHeading: false } : s))
    );
  }, [handleSaveHeading]);

  const handleUpdatePrompt = useCallback((key: string, newPrompt: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, prompt: newPrompt, promptDirty: true } : s))
    );
  }, []);

  // Save edited prompt back to prompt_templates table
  const handleSavePromptToLibrary = useCallback(async (key: string) => {
    const currentSections = sectionsRef.current;
    const section = currentSections.find((s) => s.key === key);
    if (!section) return;

    try {
      if (section.promptTemplateId) {
        await updatePromptTemplate(section.promptTemplateId, {
          prompt_text: section.prompt,
          title: section.title,
        });
      } else {
        const created = await createPromptTemplate({
          section_key: key,
          title: section.title,
          prompt_text: section.prompt,
          search_keywords: section.searchKeywords || REPORT_SECTIONS.find((r) => r.key === key)?.searchKeywords || [],
        });
        setSections((prev) =>
          prev.map((s) => (s.key === key ? { ...s, promptTemplateId: created.id, promptDirty: false } : s))
        );
      }

      setSections((prev) =>
        prev.map((s) => (s.key === key ? { ...s, promptDirty: false } : s))
      );
      toast.success(`Prompt saved to library: ${section.title}`);
    } catch (error) {
      console.error('[GenerateResearch] Failed to save prompt to library:', error);
      toast.error('Failed to save prompt to library');
    }
  }, []);

  // "This Session Only" — close editing, keep local change, don't save to library
  const handlePromptSessionOnly = useCallback(() => {
    if (promptUpdateSectionKey) {
      setSections((prev) =>
        prev.map((s) =>
          s.key === promptUpdateSectionKey
            ? { ...s, isEditingPrompt: false }
            : s
        )
      );
    }
    setIsPromptUpdateDialogOpen(false);
    setPromptUpdateSectionKey(null);
  }, [promptUpdateSectionKey]);

  // "Update Universal Prompt" — save to library and close editing
  const handlePromptUpdateUniversal = useCallback(async () => {
    if (promptUpdateSectionKey) {
      await handleSavePromptToLibrary(promptUpdateSectionKey);
      setSections((prev) =>
        prev.map((s) =>
          s.key === promptUpdateSectionKey
            ? { ...s, isEditingPrompt: false }
            : s
        )
      );
    }
    setIsPromptUpdateDialogOpen(false);
    setPromptUpdateSectionKey(null);
  }, [promptUpdateSectionKey, handleSavePromptToLibrary]);

  const handleUpdateOutput = useCallback((key: string, newOutput: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, output: newOutput } : s))
    );
  }, []);

  const handleConfirmSection = useCallback(async (key: string) => {
    const currentSections = sectionsRef.current;
    const currentReportId = reportIdRef.current;
    const section = currentSections.find((s) => s.key === key);

    // Optimistically confirm
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, status: 'confirmed' as const, isEditingPrompt: false, isEditingOutput: false, isEditingHeadingPrompt: false, isEditingHeading: false } : s))
    );

    // Save to DB — rollback on failure
    if (section && currentReportId) {
      try {
        if (section.isCustom) {
          await updateCustomSection(currentReportId, key, section.output);
        } else {
          await updateReportSection(currentReportId, key as TextSectionKey, section.output);
        }
        toast.success('Section confirmed');
      } catch (err) {
        console.error(`[GenerateResearch] Failed to save confirmed section ${key}:`, err);
        // Rollback — revert to generated state
        setSections((prev) =>
          prev.map((s) => (s.key === key ? { ...s, status: 'generated' as const } : s))
        );
        toast.error('Failed to save section. Reverted to draft.');
      }
    } else {
      toast.success('Section confirmed');
    }
  }, []);

  const handleUnconfirmSection = useCallback((key: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, status: 'generated' as const } : s))
    );
  }, []);

  const handleConfirmAll = useCallback(async () => {
    const currentSections = sectionsRef.current;
    const unconfirmed = currentSections.filter(s => s.output && s.status !== 'confirmed');
    if (unconfirmed.length === 0) return;
    for (const section of unconfirmed) {
      await handleConfirmSection(section.key);
    }
    toast.success(`${unconfirmed.length} sections confirmed`);
  }, [handleConfirmSection]);

  const handleAddSection = useCallback(async () => {
    if (!newSectionTitle || !newSectionPrompt) {
      toast.error('Please provide both title and prompt');
      return;
    }

    const keywords = newSectionKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const sectionKey = newSectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const searchKws = keywords.length > 0 ? keywords : [newSectionTitle.toLowerCase()];

    // 1. Create the column in research_reports (cs_<sectionKey>)
    try {
      await addReportSectionColumn(sectionKey);
    } catch (err) {
      console.error('[GenerateResearch] Failed to create column:', err);
      toast.error(`Failed to create column for section: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }

    // 2. Persist to prompt_templates DB so it appears in Prompt Library too
    let templateId: string | undefined;
    try {
      const created = await createPromptTemplate({
        section_key: sectionKey,
        title: newSectionTitle,
        heading_prompt: newSectionHeadingPrompt.trim() || undefined,
        prompt_text: newSectionPrompt,
        search_keywords: searchKws,
      });
      templateId = created.id;
    } catch (err) {
      console.error('[GenerateResearch] Failed to save section to prompt library:', err);
      toast.error('Column created but failed to save prompt to library');
    }

    const newSection: SectionState = {
      key: sectionKey,
      title: newSectionTitle,
      headingPrompt: newSectionHeadingPrompt.trim(),
      generatedHeading: '',
      prompt: newSectionPrompt,
      output: '',
      status: 'idle',
      isEditingPrompt: false,
      isEditingOutput: false,
      isEditingHeadingPrompt: false,
          isEditingHeading: false,
      searchKeywords: searchKws,
      isCustom: true,
      promptTemplateId: templateId,
      promptDirty: false,
    };

    setSections((prev) => [...prev, newSection]);
    setNewSectionTitle('');
    setNewSectionHeadingPrompt('');
    setNewSectionPrompt('');
    setNewSectionKeywords('');
    setIsAddSectionOpen(false);
    toast.success('Custom section added');
  }, [newSectionTitle, newSectionHeadingPrompt, newSectionPrompt, newSectionKeywords]);

  const handleDeleteSection = useCallback(async (key: string) => {
    const section = sectionsRef.current.find((s) => s.key === key);

    if (!section) return;

    // Protect the 7 default sections from deletion
    if (!section.isCustom) {
      toast.error('Default sections cannot be deleted');
      return;
    }

    if (!window.confirm('Delete this section? This cannot be undone.')) {
      return;
    }

    if (section?.isCustom) {
      if (section.promptTemplateId) {
        try {
          await deletePromptTemplate(section.promptTemplateId);
        } catch (err) {
          console.error('[GenerateResearch] Failed to delete section from prompt library:', err);
        }
      }
      try {
        await dropReportSectionColumn(key);
      } catch (err) {
        console.error('[GenerateResearch] Failed to drop column:', err);
      }
    }
    setSections((prev) => prev.filter((s) => s.key !== key));
    toast.success('Section deleted');
  }, []);

  const handleMoveSection = useCallback((index: number, direction: 'up' | 'down') => {
    setSections((prev) => {
      const newSections = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newSections.length) return prev;
      [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
      return newSections;
    });
  }, []);

  const hasFinancialData =
    financials?.current_price != null || financials?.market_cap != null;

  // Check if all sections are confirmed
  const allSectionsConfirmed = sections.length > 0 && sections.every(s => s.status === 'confirmed');

  // PPT generation handler - calls n8n webhook
  const handleCreatePPT = useCallback(async () => {
    if (!reportId || !selectedCompany || !vaultId) return;

    setPptGenerating(true);
    setPptDialogOpen(true);
    setPptElapsedSeconds(0);

    // Start elapsed timer
    pptTimerRef.current = setInterval(() => {
      setPptElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const response = await fetch('https://n8n.tikonacapital.com/webhook/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          sessionId: sessionId,
          sections: sections.reduce((acc, s) => ({ ...acc, [s.key]: s.output }), {}),
          sectionHeadings: sections.reduce((acc, s) => ({ ...acc, [s.key]: s.generatedHeading || s.title }), {}),
          companyName: selectedCompany.company_name,
          nseSymbol: selectedCompany.nse_symbol || '',
          vaultId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PPT] Webhook error:', errorText);
        throw new Error(`PPT generation failed: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log('[PPT] Webhook response:', responseText);

      if (!responseText) {
        throw new Error('Empty response from PPT generation webhook');
      }

      const data = JSON.parse(responseText);

      // n8n returns the Supabase updated row: [{ report_id, ppt_file_id, ppt_file_url, ... }]
      // or a Drive file object: { id, name, mimeType }
      const row = Array.isArray(data) ? data[0] : data;

      // Support both response formats: Supabase row (ppt_file_id) or Drive file (id)
      const fileId = row?.ppt_file_id || row?.id;

      if (!fileId) {
        console.error('[PPT] Invalid response format:', data);
        throw new Error('PPT generation completed but returned invalid file data');
      }

      const fileUrl = row?.ppt_file_url || `https://drive.google.com/file/d/${fileId}/view`;
      setPptFileId(fileId);
      setPptFileUrl(fileUrl);
      setPptFileName(row?.name || `${selectedCompany.company_name}_Report.pptx`);
      setPreviewKey((k) => k + 1);

      // n8n already saves ppt_file_id/ppt_file_url to Supabase via "Update a row" node

      toast.success('PPT created successfully!');
    } catch (error) {
      console.error('[PPT] Generation error:', error);
      toast.error(error instanceof Error ? error.message : 'PPT generation failed');
      setPptDialogOpen(false);
    } finally {
      if (pptTimerRef.current) {
        clearInterval(pptTimerRef.current);
        pptTimerRef.current = null;
      }
      setPptGenerating(false);
    }
  }, [reportId, selectedCompany, vaultId, sections, sessionId]);

  // PDF conversion handler — calls n8n webhook to convert PPT → PDF
  const handleConfirmAndConvert = useCallback(async () => {
    if (!reportId || !pptFileId || !selectedCompany || !vaultId) return;

    setPdfGenerating(true);
    try {
      const response = await fetch('https://n8n.tikonacapital.com/webhook/convert-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          pptFileId,
          companyName: selectedCompany.company_name,
          vaultId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PDF] Webhook error:', errorText);
        throw new Error(`PDF conversion failed: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log('[PDF] Webhook response:', responseText);

      if (!responseText) {
        throw new Error('Empty response from PDF conversion webhook');
      }

      const data = JSON.parse(responseText);

      // n8n returns the PDF file object: { id, name, mimeType, ... }
      const pdfFile = Array.isArray(data) ? data[0] : data;

      if (!pdfFile?.id) {
        console.error('[PDF] Invalid response format:', data);
        throw new Error('PDF conversion completed but returned invalid file data');
      }

      const pdfUrl = `https://drive.google.com/file/d/${pdfFile.id}/view`;
      setPdfFileId(pdfFile.id);
      setPdfFileUrl(pdfUrl);

      // Save PDF URL to research_reports table
      const { error: updateError } = await supabase
        .from('research_reports')
        .update({
          pdf_file_id: pdfFile.id,
          pdf_file_url: pdfUrl,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('report_id', reportId);

      if (updateError) {
        console.error('[PDF] Failed to save PDF URL to database:', updateError);
      }

      toast.success('PDF generated successfully!');
    } catch (error) {
      console.error('[PDF] Conversion error:', error);
      toast.error(error instanceof Error ? error.message : 'PDF conversion failed');
    } finally {
      setPdfGenerating(false);
    }
  }, [reportId, pptFileId, selectedCompany, vaultId]);

  // --- Podcast Handlers ---

  // Poll Supabase until a column has a non-null value (n8n webhooks respond immediately)
  const pollSupabaseColumn = useCallback(async (
    column: string,
    maxAttempts = 20,
    intervalMs = 5000,
  ): Promise<string | null> => {
    if (!reportId) {
      console.error('[Poll] No reportId available');
      return null;
    }
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[Podcast] Polling ${column} — attempt ${attempt}/${maxAttempts}`);
      const { data, error } = await supabase
        .from('research_reports')
        .select(column)
        .eq('report_id', reportId)
        .single();

      const record = data as Record<string, unknown> | null;
      if (!error && record?.[column]) {
        return record[column] as string;
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    return null;
  }, [reportId]);

  const handleGenerateScripts = useCallback(async () => {
    if (!reportId) return;
    setScriptGenerating(true);
    try {
      // Include custom section content so n8n can use it for script generation
      const customSectionContent = sections
        .filter((s) => s.isCustom && s.output)
        .reduce((acc, s) => ({ ...acc, [s.key]: { title: s.title, content: s.output } }), {});

      const response = await fetch('https://n8n.tikonacapital.com/webhook/generate-media-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          custom_sections: Object.keys(customSectionContent).length > 0 ? customSectionContent : undefined,
        }),
      });
      if (!response.ok) throw new Error('Script generation failed');

      toast.info('Script generation started. This may take 1-2 minutes...');

      // Poll Supabase until n8n finishes writing the script (up to ~100s)
      const script = await pollSupabaseColumn('podcast_script');

      if (script) {
        setPodcastScript(script);
        toast.success('Podcast script generated!');
      } else {
        toast.error('Script generation timed out. The workflow may still be running — try refreshing the page in a minute.');
      }
    } catch (err) {
      console.error('[Podcast] Script generation error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setScriptGenerating(false);
    }
  }, [reportId, pollSupabaseColumn, sections]);

  const handleGeneratePodcast = useCallback(async () => {
    if (!reportId || !podcastScript) return;
    setAudioGenerating(true);
    try {
      const response = await fetch('https://n8n.tikonacapital.com/webhook/synthesize-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_text: podcastScript, report_id: reportId }),
      });
      if (!response.ok) throw new Error('Audio generation failed');

      toast.info('Audio generation started. This may take 1-2 minutes...');

      // Poll Supabase until n8n finishes saving the audio URL (up to ~100s)
      const url = await pollSupabaseColumn('audio_file_url');

      if (url) {
        setAudioFileUrl(url);
        toast.success('Podcast audio generated!');
      } else {
        toast.error('Audio generation timed out. The workflow may still be running — try refreshing the page in a minute.');
      }
    } catch (err) {
      console.error('[Podcast] Audio generation error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate podcast audio');
    } finally {
      setAudioGenerating(false);
    }
  }, [reportId, podcastScript, pollSupabaseColumn]);

  // --- Video Handlers ---

  const handleGenerateVideo = useCallback(async () => {
    if (!reportId || !selectedCompany) return;
    setVideoGenerating(true);
    setVideoElapsedSeconds(0);

    // Start timer for UX feedback
    const timer = setInterval(() => {
      setVideoElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      // Direct call to user's n8n webhook
      const customSectionContent = sections
        .filter((s) => s.isCustom && s.output)
        .reduce((acc, s) => ({ ...acc, [s.key]: { title: s.title, content: s.output } }), {});

      const response = await fetch('https://n8n.tikonacapital.com/webhook/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          company_name: selectedCompany.company_name,
          nse_symbol: selectedCompany.nse_symbol,
          custom_sections: Object.keys(customSectionContent).length > 0 ? customSectionContent : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Video generation request failed');
      }

      toast.info('Video generation started. This process includes script writing, audio synthesis, and video rendering. It may take 3-5 minutes.');

      // Poll for video_file_url
      // We increase the polling duration since video rendering is slow
      // 60 attempts * 5000ms = 300 seconds (5 minutes)
      const url = await pollSupabaseColumn('video_file_url', 60, 5000);

      if (url) {
        setVideoFileUrl(url);

        // Also try to fetch the script if available
        const script = await pollSupabaseColumn('video_script', 5, 1000);
        if (script) setVideoScript(script);

        toast.success('Video generation complete!');
      } else {
        toast.warning('Video generation is taking longer than expected. Please check back later.');
      }

    } catch (error) {
      console.error('[Video] Generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start video generation');
    } finally {
      clearInterval(timer);
      setVideoGenerating(false);
    }
  }, [reportId, selectedCompany, pollSupabaseColumn, sections]);



  // Determine current workflow step
  const steps = [
    { label: 'Select Company', done: !!selectedCompany },
    { label: 'Create Vault', done: vaultStatus === 'success' },
    { label: 'Ingest Docs', done: ingestionStatus === 'done' },
    { label: 'Draft Report', done: allSectionsConfirmed },
    { label: 'Export', done: !!pdfFileUrl },
  ];
  const currentStep = !selectedCompany ? 0
    : vaultStatus !== 'success' ? 1
    : ingestionStatus !== 'done' ? 2
    : !allSectionsConfirmed ? 3
    : 4; // Export step (active whether generating PPT or done)

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <header className="border-b border-neutral-200/80 bg-white px-7 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50">
              <Sparkles className="h-5 w-5 text-accent-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Generate Research Report</h1>
              <p className="text-sm text-neutral-500">
                {selectedCompany ? selectedCompany.company_name : 'Search for a company to begin'}
              </p>
            </div>
          </div>

          {/* Workflow Stepper */}
          {selectedCompany && (
            <div className="hidden sm:flex items-center gap-1">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1">
                  <div className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    step.done ? 'bg-green-50 text-green-700' :
                      i === currentStep ? 'bg-accent-50 text-accent-700' :
                        'bg-neutral-50 text-neutral-400'
                  )}>
                    {step.done ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-xs">{i + 1}</span>
                    )}
                    <span className="hidden md:inline">{step.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={cn('w-4 h-px', step.done ? 'bg-green-300' : 'bg-neutral-200')} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-canvas p-7">
        <div className="mx-auto max-w-full">
          {/* Search Input */}
          <div className="mb-6" ref={dropdownRef}>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Stock Ticker Symbol
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="e.g., TATAMOTORS, RELIANCE"
                value={searchInput}
                onChange={handleInputChange}
                onFocus={() => {
                  if (results && results.length > 0 && !selectedCompany) {
                    setIsDropdownOpen(true);
                  }
                }}
                disabled={vaultStatus === 'loading' || vaultStatus === 'success'}
                className="pl-9 pr-9 h-11 text-base font-mono uppercase"
                autoComplete="off"
                autoFocus
              />
              {searchInput && vaultStatus !== 'success' && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {searchLoading && (
                <div className="absolute right-9 top-1/2 -translate-y-1/2">
                  <Spinner size="sm" />
                </div>
              )}

              {/* Dropdown Results */}
              {isDropdownOpen && results && results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg overflow-hidden">
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {results.map((company) => (
                      <li key={company.company_id}>
                        <button
                          onClick={() => handleSelect(company)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-50">
                            <Building2 className="h-4 w-4 text-accent-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              {company.company_name}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {company.nse_symbol || '-'} · {company.isin || '-'}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Enter NSE symbol or company name to search
            </p>
          </div>

          {/* Company Info Card */}
          {selectedCompany && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
                {/* Card Header */}
                <div className="border-b border-neutral-100 px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-neutral-900">
                        {selectedCompany.company_name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                        {selectedCompany.nse_symbol && (
                          <span className="font-mono">
                            NSE: {selectedCompany.nse_symbol}
                          </span>
                        )}
                        {selectedCompany.bse_code && (
                          <span className="font-mono">BSE: {selectedCompany.bse_code}</span>
                        )}
                        {selectedCompany.isin && (
                          <span className="font-mono">{selectedCompany.isin}</span>
                        )}
                        {financials?.sector && (
                          <span className="bg-accent-50 text-accent-700 px-2 py-0.5 rounded text-xs font-medium">
                            {financials.sector}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshData}
                        disabled={isRefreshing || !(selectedCompany?.nse_symbol || selectedCompany?.isin)}
                        className="h-8"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5 mr-2', isRefreshing && 'animate-spin')} />
                        {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                      </Button>
                      {!financialsLoading && (
                      <div
                        className={cn(
                          'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
                          hasFinancialData
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        )}
                      >
                        {hasFinancialData ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Data Available
                          </>
                        ) : (
                          <>
                            <TrendingUp className="h-3.5 w-3.5" />
                            No Financial Data
                          </>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                </div>

                {/* Expanded Metrics with Tabs */}
                <div className="px-6 py-5">
                  {financialsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Spinner size="sm" />
                      <span className="ml-2 text-sm text-neutral-500">
                        Loading financials...
                      </span>
                    </div>
                  ) : hasFinancialData ? (
                    <Tabs defaultValue="market" className="w-full">
                      <TabsList className="w-full grid grid-cols-5">
                        <TabsTrigger value="market">Market</TabsTrigger>
                        <TabsTrigger value="valuation">Valuation</TabsTrigger>
                        <TabsTrigger value="profitability">Profitability</TabsTrigger>
                        <TabsTrigger value="growth">Growth</TabsTrigger>
                        <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
                      </TabsList>

                      <TabsContent value="market">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                          <MetricCard label="Current Price" value={financials?.current_price != null ? `₹${financials.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'} />
                          <MetricCard label="Market Cap" value={formatCurrency(financials?.market_cap ?? null)} />
                          <MetricCard label="52W High" value={financials?.high_52_week != null ? `₹${financials.high_52_week.toLocaleString('en-IN')}` : '-'} />
                          <MetricCard label="52W Low" value={financials?.low_52_week != null ? `₹${financials.low_52_week.toLocaleString('en-IN')}` : '-'} />
                          <MetricCard label="Enterprise Value" value={formatCurrency(financials?.enterprise_value ?? null)} />
                          <MetricCard label="Book Value" value={formatNumber(financials?.book_value ?? null)} />
                          <MetricCard label="EPS (TTM)" value={formatNumber(financials?.eps_ttm ?? null)} />
                          <MetricCard label="Volume" value={financials?.volume != null ? financials.volume.toLocaleString('en-IN') : '-'} />
                        </div>
                      </TabsContent>

                      <TabsContent value="valuation">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                          <MetricCard label="P/E (TTM)" value={formatNumber(financials?.pe_ttm ?? null, 'x')} />
                          <MetricCard label="EV/EBITDA (TTM)" value={formatNumber(financials?.ev_ebitda_ttm ?? null, 'x')} />
                          <MetricCard label="P/S (TTM)" value={formatNumber(financials?.ps_ttm ?? null, 'x')} />
                          <MetricCard label="P/E Avg 3yr" value={formatNumber(financials?.pe_avg_3yr ?? null, 'x')} />
                          <MetricCard label="P/E FY26E" value={formatNumber(financials?.pe_fy2026e ?? null, 'x')} />
                          <MetricCard label="EV/EBITDA FY26E" value={formatNumber(financials?.ev_ebitda_fy2026e ?? null, 'x')} />
                          <MetricCard label="Consensus Target" value={financials?.consensus_target_price != null ? `₹${financials.consensus_target_price.toLocaleString('en-IN')}` : '-'} />
                          <MetricCard label="Consensus Upside" value={formatPercent(financials?.consensus_upside_pct ?? null)} />
                        </div>
                      </TabsContent>

                      <TabsContent value="profitability">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                          <MetricCard label="ROE" value={formatPercent(financials?.roe ?? null)} />
                          <MetricCard label="ROCE" value={formatPercent(financials?.roce ?? null)} />
                          <MetricCard label="ROIC" value={formatPercent(financials?.roic ?? null)} />
                          <MetricCard label="EBITDA Margin (TTM)" value={formatPercent(financials?.ebitda_margin_ttm ?? null)} />
                          <MetricCard label="PAT Margin (TTM)" value={formatPercent(financials?.pat_margin_ttm ?? null)} />
                          <MetricCard label="OPM Last Year" value={formatPercent(financials?.opm_last_year ?? null)} />
                          <MetricCard label="Asset Turnover" value={formatNumber(financials?.asset_turnover_ratio ?? null, 'x')} />
                          <MetricCard label="WC/Sales Ratio" value={formatNumber(financials?.working_capital_to_sales_ratio ?? null)} />
                        </div>
                      </TabsContent>

                      <TabsContent value="growth">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                          <MetricCard label="Revenue CAGR (2yr)" value={formatPercent(financials?.revenue_cagr_hist_2yr ?? null)} />
                          <MetricCard label="Revenue CAGR Fwd" value={formatPercent(financials?.revenue_cagr_fwd_2yr ?? null)} />
                          <MetricCard label="PAT CAGR (2yr)" value={formatPercent(financials?.pat_cagr_hist_2yr ?? null)} />
                          <MetricCard label="PAT CAGR Fwd" value={formatPercent(financials?.pat_cagr_fwd_2yr ?? null)} />
                          <MetricCard label="Sales Growth YoY" value={formatPercent(financials?.sales_growth_yoy_qtr ?? null)} />
                          <MetricCard label="Profit Growth YoY" value={formatPercent(financials?.profit_growth_yoy_qtr ?? null)} />
                          <MetricCard label="EPS CAGR (2yr)" value={formatPercent(financials?.eps_cagr_hist_2yr ?? null)} />
                          <MetricCard label="EBITDA CAGR (2yr)" value={formatPercent(financials?.ebitda_cagr_hist_2yr ?? null)} />
                        </div>
                      </TabsContent>

                      <TabsContent value="balance">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                          <MetricCard label="Debt" value={formatCurrency(financials?.debt ?? null)} />
                          <MetricCard label="Cash" value={formatCurrency(financials?.cash_equivalents ?? null)} />
                          <MetricCard label="Net Debt" value={formatCurrency(financials?.net_debt ?? null)} />
                          <MetricCard label="Net Worth" value={formatCurrency(financials?.net_worth ?? null)} />
                          <MetricCard label="Promoter Holding" value={formatPercent(financials?.promoter_holding_pct ?? null)} />
                          <MetricCard label="Unpledged Promoter" value={formatPercent(financials?.unpledged_promoter_holding_pct ?? null)} />
                          <MetricCard label="Net Block" value={formatCurrency(financials?.net_block ?? null)} />
                          <MetricCard label="CWIP/Net Block" value={formatPercent(financials?.cwip_to_net_block_ratio ?? null)} />
                        </div>
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="text-center py-4 text-sm text-neutral-500">
                      No financial data available for this company.
                    </div>
                  )}
                </div>

                {/* Success State - Show File Manager + AI Actions */}
                {vaultStatus === 'success' && vaultLink && vaultId && (
                  <div className="border-t border-neutral-100 px-6 py-5">
                    <div className="mb-4 flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 flex-shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-900">
                          Vault Created Successfully!
                        </p>
                        <p className="text-sm text-green-700 mt-1">
                          Your research folder is ready with {vaultDocuments.length} documents
                          {sessionId && ' (session saved)'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsUploadOpen(true)}
                        >
                          <Upload className="h-3.5 w-3.5 mr-2" />
                          Upload
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleReset}>
                          New Research
                        </Button>
                      </div>
                    </div>

                    {/* File Manager Component */}
                    <FileManager
                      folderId={vaultId}
                      folderUrl={vaultLink}
                      documents={vaultDocuments}
                      selectedDocumentIds={selectedDocumentIds}
                      onFileSelect={handleFileSelect}
                      onFileDelete={handleFileDelete}
                    />

                    {/* Upload Dialog */}
                    <DocumentUploadDialog
                      open={isUploadOpen}
                      onOpenChange={setIsUploadOpen}
                      folderId={vaultId}
                      nseSymbol={selectedCompany?.nse_symbol || ''}
                      onUploadComplete={handleUploadComplete}
                    />

                    {/* ======================== */}
                    {/* Ingestion Step */}
                    {/* ======================== */}
                    {sessionId && (
                      <div className="mt-6">
                        <div className="rounded-lg border border-neutral-200 bg-white p-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-full',
                                ingestionStatus === 'done' ? 'bg-green-100' : 'bg-accent-50'
                              )}>
                                {ingestionStatus === 'done' ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                ) : (
                                  <Brain className="h-5 w-5 text-accent-600" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-neutral-900">
                                  Ingest Documents for AI
                                </p>
                                <p className="text-xs text-neutral-500 mt-1">
                                  {ingestionStatus === 'idle' && 'Process documents into vector chunks for RAG retrieval'}
                                  {ingestionStatus === 'ingesting' && `Processing ${ingestionProgress.current}/${ingestionProgress.total} documents...`}
                                  {ingestionStatus === 'done' && 'Documents ingested and ready for AI generation'}
                                  {ingestionStatus === 'error' && 'Ingestion failed. Please try again.'}
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={handleIngestDocuments}
                              disabled={ingestionStatus === 'ingesting' || vaultDocuments.length === 0}
                              variant={ingestionStatus === 'done' ? 'outline' : 'default'}
                              size="sm"
                              className="min-w-[155px]"
                            >
                              {ingestionStatus === 'ingesting' ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                  Ingesting...
                                </>
                              ) : ingestionStatus === 'done' ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                  Re-ingest
                                </>
                              ) : (
                                <>
                                  <Brain className="h-3.5 w-3.5 mr-2" />
                                  Ingest Documents
                                </>
                              )}
                            </Button>
                          </div>

                          {/* Ingestion progress bar */}
                          {ingestionStatus === 'ingesting' && (
                            <div className="mt-3">
                              <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                                <div
                                  className="h-full bg-accent-600 rounded-full transition-all duration-500"
                                  style={{ width: `${(ingestionProgress.current / ingestionProgress.total) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ======================== */}
                    {/* 3-Column Drafting Workspace */}
                    {/* ======================== */}
                    {ingestionStatus === 'done' && sections.length > 0 && (
                      <div className="mt-6">
                        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
                          {/* Header with Generate All button */}
                          <div className="border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-50">
                                <Sparkles className="h-5 w-5 text-accent-600" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-neutral-900">
                                  Research Report Drafting Workspace
                                </h3>
                                <p className="text-xs text-neutral-500 mt-1">
                                  {sections.filter((s) => s.status === 'confirmed').length}/{sections.length} sections confirmed
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setIsAddSectionOpen(true)}>
                                <Plus className="h-3.5 w-3.5 mr-2" />
                                Add Section
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleGenerateAll}
                                disabled={sections.some((s) => s.status === 'generating')}
                                className="min-w-[130px]"
                              >
                                {sections.some((s) => s.status === 'generating') ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                                    Generate All
                                  </>
                                )}
                              </Button>
                              {sections.some(s => s.output && s.status !== 'confirmed') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleConfirmAll}
                                  className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                >
                                  <Check className="h-3.5 w-3.5 mr-2" />
                                  Confirm All
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCreatePPT}
                                disabled={!allSectionsConfirmed || pptGenerating}
                              >
                                {pptGenerating ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                ) : (
                                  <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                                )}
                                Create PPT
                              </Button>
                            </div>
                          </div>

                          {/* Section Cards */}
                          <div className="space-y-3 px-6 py-4">
                            {sections.map((section, idx) => (
                              <div
                                key={section.key}
                                className={cn(
                                  'rounded-xl border shadow-sm transition-all',
                                  section.status === 'confirmed'
                                    ? 'border-l-4 border-l-green-500 border-t-neutral-200 border-r-neutral-200 border-b-neutral-200 bg-green-50/30'
                                    : section.status === 'generating'
                                      ? 'border-l-4 border-l-accent-500 border-t-neutral-200 border-r-neutral-200 border-b-neutral-200 bg-accent-50/20'
                                      : section.output
                                        ? 'border-l-4 border-l-amber-400 border-t-neutral-200 border-r-neutral-200 border-b-neutral-200 bg-white'
                                        : 'border-neutral-200 bg-white'
                                )}
                              >
                                <div className="p-4">
                                  {/* ── Card Header ── */}
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="flex flex-col gap-1 shrink-0">
                                      <button
                                        onClick={() => handleMoveSection(idx, 'up')}
                                        disabled={idx === 0}
                                        className="h-5 w-5 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                      >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleMoveSection(idx, 'down')}
                                        disabled={idx === sections.length - 1}
                                        className="h-5 w-5 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                      >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <span className={cn(
                                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                      section.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        section.status === 'generating' ? 'bg-accent-100 text-accent-700' :
                                          section.status === 'generated' ? 'bg-amber-100 text-amber-700' :
                                            'bg-neutral-100 text-neutral-500'
                                    )}>
                                      {section.status === 'confirmed' ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-neutral-900 leading-tight">{section.title}</p>
                                    </div>
                                    {section.tokensUsed ? (
                                      <span className="text-xs text-neutral-400 shrink-0">{section.tokensUsed.toLocaleString()} tokens</span>
                                    ) : null}
                                    {section.status !== 'confirmed' && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditPromptModalKey(section.key)}
                                        className="text-xs h-7 text-neutral-500 hover:text-neutral-800 shrink-0"
                                      >
                                        <Edit2 className="h-3 w-3 mr-1" />
                                        Prompts
                                      </Button>
                                    )}
                                    <span className={cn(
                                      'text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0',
                                      section.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        section.status === 'generating' ? 'bg-accent-100 text-accent-700' :
                                          section.status === 'generated' ? 'bg-amber-100 text-amber-700' :
                                            'bg-neutral-100 text-neutral-500'
                                    )}>
                                      {section.status === 'confirmed' ? 'Confirmed' :
                                        section.status === 'generating' ? 'Generating...' :
                                          section.status === 'generated' ? 'Generated' : 'Idle'}
                                    </span>
                                  </div>

                                  {/* ── Heading Row (compact inline) ── */}
                                  <div className="flex items-center gap-2 mb-3 px-1">
                                    <span className="text-xs text-neutral-400 uppercase font-semibold tracking-wider shrink-0">Heading:</span>
                                    {section.isEditingHeading ? (
                                      <input
                                        type="text"
                                        value={section.generatedHeading}
                                        onChange={(e) => handleUpdateHeading(section.key, e.target.value)}
                                        onBlur={() => handleHeadingBlur(section.key)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleHeadingBlur(section.key); }}
                                        autoFocus
                                        className="flex-1 text-sm font-medium border border-neutral-200 rounded px-2 py-0.5 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                                      />
                                    ) : (
                                      <span
                                        className={cn(
                                          'text-sm flex-1 min-w-0 truncate',
                                          section.generatedHeading ? 'font-medium text-neutral-800 cursor-pointer hover:text-accent-700' : 'text-neutral-400 italic'
                                        )}
                                        onClick={() => section.generatedHeading && section.status !== 'confirmed' && handleToggleEditHeading(section.key)}
                                        title={section.generatedHeading ? 'Click to edit' : undefined}
                                      >
                                        {section.generatedHeading || 'Not generated'}
                                      </span>
                                    )}
                                    {section.generatedHeading && !section.isEditingHeading && section.status !== 'confirmed' && (
                                      <button
                                        onClick={() => handleToggleEditHeading(section.key)}
                                        className="text-neutral-400 hover:text-neutral-700 shrink-0"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>

                                  {/* ── AI Output Area ── */}
                                  <div className={cn(
                                    'rounded-lg border px-3 py-3 mb-3',
                                    section.status === 'confirmed' ? 'border-green-200 bg-green-50/50' :
                                      section.output ? 'border-amber-200 bg-amber-50/30' :
                                        'border-neutral-200 bg-neutral-50/50'
                                  )}>
                                    <p className={cn(
                                      'text-xs font-semibold uppercase tracking-wider mb-2',
                                      section.status === 'confirmed' ? 'text-green-500' :
                                        section.output ? 'text-amber-500' : 'text-neutral-400'
                                    )}>AI Output</p>
                                    {section.status === 'generating' ? (
                                      <div className="flex items-center gap-2 text-sm text-neutral-600 py-3">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>Generating content...</span>
                                      </div>
                                    ) : section.isEditingOutput ? (
                                      <textarea
                                        value={section.output}
                                        onChange={(e) => handleUpdateOutput(section.key, e.target.value)}
                                        className="w-full min-h-[200px] text-sm border border-neutral-200 rounded-lg p-3 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 resize-y"
                                        disabled={section.status === 'confirmed'}
                                      />
                                    ) : section.output ? (
                                      <div>
                                        <div className={cn(
                                          'text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed overflow-hidden',
                                          expandedOutputKey === section.key ? '' : 'max-h-[120px]'
                                        )}>
                                          {section.output}
                                        </div>
                                        {section.output.length > 400 && (
                                          <button
                                            onClick={() => setExpandedOutputKey(expandedOutputKey === section.key ? null : section.key)}
                                            className="text-xs text-accent-600 hover:text-accent-800 mt-2 flex items-center gap-1"
                                          >
                                            <ChevronsDown className={cn('h-3 w-3 transition-transform', expandedOutputKey === section.key && 'rotate-180')} />
                                            {expandedOutputKey === section.key ? 'Show less' : 'Show more'}
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 py-3 text-sm text-neutral-400">
                                        <div className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                                        Not generated yet
                                      </div>
                                    )}
                                  </div>

                                  {/* ── Action Bar ── */}
                                  <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                                    {section.status === 'confirmed' ? (
                                      <>
                                        <div className="flex items-center gap-2 text-xs text-green-700 font-medium px-3 py-2 bg-green-100 rounded-md">
                                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                          Confirmed
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleUnconfirmSection(section.key)}
                                          className="text-xs h-7 text-neutral-500 hover:text-neutral-700"
                                        >
                                          <Undo2 className="h-3 w-3 mr-1" />
                                          Undo
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <div className="flex gap-2">
                                          {/* Generate / Regenerate */}
                                          {(section.status === 'idle' || section.status === 'generated') && (
                                            <Button
                                              size="sm"
                                              variant={section.output ? 'outline' : 'default'}
                                              onClick={() => handleGenerateSection(section.key)}
                                              className="text-xs h-8"
                                            >
                                              <Sparkles className="h-3.5 w-3.5 mr-2" />
                                              {section.output ? 'Regenerate' : 'Generate'}
                                            </Button>
                                          )}
                                          {/* Gen. Heading */}
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleGenerateHeading(section.key)}
                                            disabled={section.headingStatus === 'generating'}
                                            className="text-xs h-8"
                                          >
                                            {section.headingStatus === 'generating' ? (
                                              <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Heading...</>
                                            ) : (
                                              <><Type className="h-3.5 w-3.5 mr-2" /> {section.generatedHeading ? 'Regen Heading' : 'Gen. Heading'}</>
                                            )}
                                          </Button>
                                          {/* Confirm */}
                                          {section.output && (
                                            <Button
                                              size="sm"
                                              onClick={() => handleConfirmSection(section.key)}
                                              className="text-xs h-8"
                                            >
                                              <Check className="h-3.5 w-3.5 mr-2" />
                                              Confirm
                                            </Button>
                                          )}
                                        </div>
                                        <div className="flex gap-1 items-center">
                                          {/* More dropdown — only show if there are actions */}
                                          {(section.promptDirty || section.output) && (
                                            <div className="relative" ref={openMenuKey === section.key ? menuRef : undefined}>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setOpenMenuKey(openMenuKey === section.key ? null : section.key)}
                                                className="text-xs h-8 w-8 p-0 text-neutral-500"
                                              >
                                                <MoreHorizontal className="h-4 w-4" />
                                              </Button>
                                              {openMenuKey === section.key && (
                                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-20 py-1">
                                                  {section.promptDirty && (
                                                    <button
                                                      className="w-full text-left px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                                                      onClick={() => { handleSavePromptToLibrary(section.key); setOpenMenuKey(null); }}
                                                    >
                                                      <Save className="h-3 w-3" /> Save Prompt to Library
                                                    </button>
                                                  )}
                                                  {section.output && (
                                                    <button
                                                      className="w-full text-left px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                                                      onClick={() => { handleToggleEditOutput(section.key); setOpenMenuKey(null); }}
                                                    >
                                                      <FileText className="h-3 w-3" /> Edit Output
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {/* Delete */}
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDeleteSection(section.key)}
                                            className="text-xs h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* PPT/PDF Workflow UI */}
                          {pptFileUrl && (
                            <div className="border-t border-neutral-200 px-6 py-5">
                              <div className="rounded-xl border border-green-200 bg-green-50/50 p-5">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-green-900">
                                        PowerPoint Created
                                      </p>
                                      <p className="text-xs text-green-700 mt-1">
                                        Review in Google Drive, then convert to PDF
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setPptDialogOpen(true)}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                      Preview & Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.open(pptFileUrl, '_blank')}
                                    >
                                      <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                                      Open in Drive
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={handleConfirmAndConvert}
                                      disabled={pdfGenerating}
                                      className="min-w-[135px]"
                                    >
                                      {pdfGenerating ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                          Converting...
                                        </>
                                      ) : (
                                        <>
                                          <FileText className="h-3.5 w-3.5 mr-2" />
                                          Convert to PDF
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* PDF Download UI */}
                              {pdfFileId && (
                                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-100/50 p-5">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200">
                                        <FileText className="h-5 w-5 text-neutral-600" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-semibold text-neutral-900">
                                          PDF Report Ready
                                        </p>
                                        <p className="text-xs text-neutral-700 mt-1">
                                          Your final research report is ready for download
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(pdfFileUrl!, '_blank')}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                        View PDF
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => window.open(`https://drive.google.com/uc?export=download&id=${pdfFileId}`, '_blank')}
                                      >
                                        <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                                        Download PDF
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Podcast Generation UI */}
                              {pdfFileId && (
                                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/50 p-5">
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-50">
                                      <Mic className="h-5 w-5 text-accent-600" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-neutral-900">
                                        Podcast Generation
                                      </p>
                                      <p className="text-xs text-neutral-500 mt-1">
                                        Generate an AI podcast from your research report
                                      </p>
                                    </div>
                                  </div>

                                  {/* Step 1: Generate Script */}
                                  {!podcastScript && (
                                    <Button
                                      onClick={handleGenerateScripts}
                                      disabled={scriptGenerating}
                                      className="bg-accent-600 hover:bg-accent-700 min-w-[210px]"
                                    >
                                      {scriptGenerating ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Generating Script...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-4 w-4 mr-2" />
                                          Generate Podcast Script
                                        </>
                                      )}
                                    </Button>
                                  )}

                                  {/* Step 2: Show Script + Generate Audio button */}
                                  {podcastScript && (
                                    <div className="space-y-4">
                                      <div>
                                        <label className="text-xs font-medium text-neutral-700 mb-2 block">
                                          Podcast Script
                                        </label>
                                        <textarea
                                          value={podcastScript}
                                          onChange={(e) => setPodcastScript(e.target.value)}
                                          rows={10}
                                          className="w-full max-h-64 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400"
                                        />
                                        <p className="mt-1 text-xs text-neutral-400">
                                          Edit the script above before generating audio.
                                        </p>
                                      </div>

                                      {!audioFileUrl && (
                                        <Button
                                          onClick={handleGeneratePodcast}
                                          disabled={audioGenerating}
                                          className="bg-accent-600 hover:bg-accent-700 min-w-[210px]"
                                        >
                                          {audioGenerating ? (
                                            <>
                                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                              Generating Audio...
                                            </>
                                          ) : (
                                            <>
                                              <Volume2 className="h-4 w-4 mr-2" />
                                              Generate Podcast Audio
                                            </>
                                          )}
                                        </Button>
                                      )}

                                      {/* Step 3: Audio Player */}
                                      {audioFileUrl && (
                                        <div className="rounded-lg border border-neutral-200 bg-white p-4">
                                          <p className="text-xs font-medium text-neutral-700 mb-2 flex items-center gap-2">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                            Podcast Ready
                                          </p>
                                          <audio
                                            controls
                                            className="w-full mb-3"
                                            src={audioFileUrl}
                                          >
                                            Your browser does not support the audio element.
                                          </audio>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => window.open(audioFileUrl, '_blank')}
                                          >
                                            <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                                            Download MP3
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Video Generation UI */}
                              {pdfFileId && (
                                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                                      <Video className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-blue-900">
                                        Video Generation
                                      </p>
                                      <p className="text-xs text-blue-700 mt-1">
                                        Create an AI-narrated video summary of your report
                                      </p>
                                    </div>
                                  </div>

                                  {!videoFileUrl ? (
                                    <div className="space-y-4">
                                      <p className="text-sm text-neutral-600">
                                        Transform your research report into an engaging video summary.
                                        This process automatically generates a script, synthesizes voiceover, and compiles visuals.
                                      </p>

                                      <Button
                                        onClick={handleGenerateVideo}
                                        disabled={videoGenerating}
                                        className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto sm:min-w-[220px]"
                                      >
                                        {videoGenerating ? (
                                          <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Generating Video ({Math.floor(videoElapsedSeconds / 60)}:{(videoElapsedSeconds % 60).toString().padStart(2, '0')})...
                                          </>
                                        ) : (
                                          <>
                                            <Clapperboard className="h-4 w-4 mr-2" />
                                            Generate Video Summary
                                          </>
                                        )}
                                      </Button>

                                      {videoGenerating && (
                                        <p className="text-xs text-neutral-500 animate-pulse">
                                          This process usually takes 3-5 minutes. Please feel free to work on other tasks while this runs in the background.
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="space-y-4">
                                      <div className="rounded-lg border border-blue-200 bg-white p-4">
                                        <p className="text-xs font-medium text-blue-800 mb-2 flex items-center gap-2">
                                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                          Video Ready
                                        </p>

                                        {/* Video Player */}
                                        <div className="aspect-video w-full bg-black rounded-lg overflow-hidden mb-3 relative group">
                                          <video
                                            controls
                                            className="w-full h-full object-contain"
                                            src={videoFileUrl}
                                          >
                                            Your browser does not support the video tag.
                                          </video>
                                        </div>

                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => window.open(videoFileUrl, '_blank')}
                                            className="w-full"
                                          >
                                            <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                                            Download MP4
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Video Script Display (if available) */}
                                      {videoScript && (
                                        <div className="mt-4">
                                          <details className="group">
                                            <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-700">
                                              <span className="group-open:rotate-90 transition-transform">▶</span>
                                              View Video Script
                                            </summary>
                                            <div className="mt-2 text-xs text-neutral-600 bg-white p-3 rounded border border-neutral-200 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                              {videoScript}
                                            </div>
                                          </details>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Publish to Customers */}
                              {pdfFileId && (
                                <div className="mt-4 rounded-xl border border-green-200 bg-green-50/50 p-5">
                                  <div className="flex items-start gap-3 mb-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                                      <Send className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-semibold text-neutral-900">
                                        Publish Report
                                      </h4>
                                      <p className="text-xs text-neutral-500 mt-1">
                                        Make this report visible to customers in the Investor Portal
                                      </p>
                                    </div>
                                  </div>

                                  {isPublished ? (
                                    <div className="flex items-center gap-2 text-green-700 bg-green-100 rounded-lg px-4 py-3">
                                      <CheckCircle2 className="h-4 w-4" />
                                      <span className="text-sm font-medium">Published to customers</span>
                                    </div>
                                  ) : (
                                    <Button
                                      onClick={async () => {
                                        if (!reportId) return;
                                        setIsPublishing(true);
                                        try {
                                          await publishReport(reportId);
                                          setIsPublished(true);
                                          toast.success('Report published to customers');
                                        } catch (err) {
                                          toast.error(err instanceof Error ? err.message : 'Failed to publish');
                                        } finally {
                                          setIsPublishing(false);
                                        }
                                      }}
                                      disabled={isPublishing}
                                      className="w-full min-w-[200px]"
                                    >
                                      {isPublishing ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Publishing...
                                        </>
                                      ) : (
                                        <>
                                          <Send className="h-4 w-4 mr-2" />
                                          Publish to Customers
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error State */}
                {vaultStatus === 'error' && errorMessage && (
                  <div className="border-t border-neutral-100 bg-red-50 px-6 py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-900">
                          Failed to Create Vault
                        </p>
                        <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Footer */}
                {vaultStatus !== 'success' && (
                  <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
                    <Button
                      onClick={handleGenerateResearch}
                      disabled={
                        !selectedCompany.nse_symbol ||
                        vaultStatus === 'loading' ||
                        financialsLoading
                      }
                      className="w-full sm:w-auto sm:min-w-[200px]"
                      size="lg"
                    >
                      {vaultStatus === 'loading' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Vault...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Generate Research
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!selectedCompany && !searchInput && (
            <div className="text-center py-16">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
                <Search className="h-7 w-7 text-accent-300" />
              </div>
              <h3 className="mt-4 text-sm font-medium text-neutral-900">
                Search for a company
              </h3>
              <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
                Enter a stock ticker symbol above to find a company and initialize a
                research vault.
              </p>
            </div>
          )}

          {/* No Results State */}
          {!selectedCompany &&
            searchInput.trim().length >= 2 &&
            !searchLoading &&
            results?.length === 0 && (
              <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="mt-3 text-sm font-medium text-neutral-900">
                  No company found
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  No results for &quot;{searchInput}&quot;. Try a different ticker symbol.
                </p>
              </div>
            )}
        </div>
      </div>

      {/* PPT Generation & Preview Dialog */}
      <Dialog open={pptDialogOpen} onOpenChange={(open) => {
        if (!pptGenerating) setPptDialogOpen(open);
      }}>
        <DialogContent className={cn(
          'transition-all duration-300',
          pptGenerating ? 'sm:max-w-md' : 'sm:max-w-[90vw] sm:max-h-[90vh]'
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pptGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-600" />
                  Generating Report
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  {pptFileName || 'Report'} — Review & Edit
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {pptGenerating
                ? 'Your research report is being generated. This typically takes 4-5 minutes. Please do not close this window.'
                : 'Review the presentation below. Click "Edit in Google Slides" to make changes, then "Refresh Preview" to see your updates.'}
            </DialogDescription>
          </DialogHeader>

          {/* Generation Progress */}
          {pptGenerating && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-center py-6">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-4 border-neutral-100" />
                  <div className="absolute inset-0 h-20 w-20 rounded-full border-4 border-accent-600 border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-neutral-600" />
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-2xl font-mono font-semibold text-neutral-900">
                  {Math.floor(pptElapsedSeconds / 60)}:{(pptElapsedSeconds % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-xs text-neutral-500 mt-1">Elapsed time</p>
              </div>

              <div className="space-y-2 bg-neutral-50 rounded-lg p-4">
                {[
                  { label: 'Fetching report content', time: 10 },
                  { label: 'Generating charts from financial data', time: 60 },
                  { label: 'Populating master template', time: 120 },
                  { label: 'Uploading to Google Drive', time: 200 },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-3">
                    {pptElapsedSeconds >= step.time ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : pptElapsedSeconds >= (i > 0 ? [10, 60, 120, 200][i - 1] : 0) ? (
                      <Loader2 className="h-4 w-4 text-neutral-600 animate-spin shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-neutral-300 shrink-0" />
                    )}
                    <span className={cn(
                      'text-sm',
                      pptElapsedSeconds >= step.time ? 'text-green-700' :
                        pptElapsedSeconds >= (i > 0 ? [10, 60, 120, 200][i - 1] : 0) ? 'text-neutral-700 font-medium' :
                          'text-neutral-400'
                    )}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview + Actions (after generation) */}
          {!pptGenerating && pptFileId && (
            <div className="flex flex-col gap-4">
              {/* Generation time badge */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-500">
                  Generated in {Math.floor(pptElapsedSeconds / 60)}m {pptElapsedSeconds % 60}s
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPreviewKey(Date.now());
                      toast.info('Refreshing preview... If changes are not visible, wait 10-15 seconds after editing and try again.');
                    }}
                    title="Refresh preview after editing"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Refresh Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`https://docs.google.com/presentation/d/${pptFileId}/edit`, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Edit in Google Slides
                  </Button>
                </div>
              </div>

              {/* Google Drive Preview iframe */}
              <div className="rounded-lg border border-neutral-200 overflow-hidden bg-neutral-100" style={{ height: '60vh' }}>
                <iframe
                  key={previewKey}
                  src={`https://drive.google.com/file/d/${pptFileId}/preview?v=${previewKey}`}
                  className="w-full h-full border-0"
                  allow="autoplay"
                  title="PPT Preview"
                />
              </div>

              {/* Action buttons */}
              <DialogFooter className="flex gap-2 sm:gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPptDialogOpen(false)}
                >
                  Close
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(pptFileUrl!, '_blank')}
                  >
                    <DownloadCloud className="h-4 w-4 mr-2" />
                    Open in Drive
                  </Button>
                  <Button
                    onClick={handleConfirmAndConvert}
                    disabled={pdfGenerating}
                    className="min-w-[210px]"
                  >
                    {pdfGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Converting to PDF...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Confirm & Convert to PDF
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>

              {/* PDF Ready banner */}
              {pdfFileId && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-900">PDF Ready</p>
                      <p className="text-xs text-green-700">Your final report has been converted to PDF</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => window.open(pdfFileUrl!, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      View PDF
                    </Button>
                    <Button size="sm" onClick={() => window.open(`https://drive.google.com/uc?export=download&id=${pdfFileId}`, '_blank')}>
                      <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Prompts Modal */}
      <Dialog open={!!editPromptModalKey} onOpenChange={(open) => { if (!open) setEditPromptModalKey(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Prompts — {sections.find((s) => s.key === editPromptModalKey)?.title}</DialogTitle>
            <DialogDescription>
              Edit the content generation prompt and heading prompt for this section.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const section = sections.find((s) => s.key === editPromptModalKey);
            if (!section) return null;
            return (
              <div className="space-y-5 pt-2">
                {/* Content Prompt */}
                <div>
                  <Label className="text-sm font-semibold text-neutral-700 mb-2 block">Content Prompt</Label>
                  <p className="text-xs text-neutral-500 mb-2">This prompt is used to generate the main content for this section.</p>
                  <textarea
                    value={section.prompt}
                    onChange={(e) => handleUpdatePrompt(section.key, e.target.value)}
                    className="w-full min-h-[180px] text-sm font-mono border border-neutral-200 rounded-lg p-3 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 resize-y"
                  />
                </div>
                {/* Heading Prompt */}
                <div>
                  <Label className="text-sm font-semibold text-neutral-700 mb-2 block">Heading Prompt</Label>
                  <p className="text-xs text-neutral-500 mb-2">This prompt is used to generate a short dynamic heading (4-5 words) for this section.</p>
                  <textarea
                    value={section.headingPrompt}
                    onChange={(e) => handleUpdateHeadingPrompt(section.key, e.target.value)}
                    placeholder="e.g., Create a compelling heading that captures the company's core identity..."
                    className="w-full min-h-[80px] text-sm border border-neutral-200 rounded-lg p-3 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400 resize-y"
                  />
                </div>
                {/* Search Keywords */}
                <div>
                  <Label className="text-sm font-semibold text-neutral-700 mb-2 block">Search Keywords</Label>
                  <p className="text-xs text-neutral-500 mb-2">Comma-separated keywords used to find relevant document chunks for this section. These control what context the AI receives.</p>
                  <Input
                    value={(section.searchKeywords || []).join(', ')}
                    onChange={(e) => {
                      const kws = e.target.value.split(',').map((k) => k.trim()).filter(Boolean);
                      setSections((prev) =>
                        prev.map((s) => s.key === section.key ? { ...s, searchKeywords: kws, promptDirty: true } : s)
                      );
                    }}
                    placeholder="e.g., company, background, history, founded, headquarters"
                    className="text-sm font-mono"
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 pt-2">
            {sections.find((s) => s.key === editPromptModalKey)?.promptDirty && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (editPromptModalKey) handleSavePromptToLibrary(editPromptModalKey); }}
              >
                <Save className="h-3.5 w-3.5 mr-2" />
                Save to Library
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (editPromptModalKey) {
                  handleSaveHeadingPrompt(editPromptModalKey);
                }
                setEditPromptModalKey(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Section Dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Section</DialogTitle>
            <DialogDescription>
              Create a new custom section for your research report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="section-title">Section Title</Label>
              <Input
                id="section-title"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                placeholder="e.g., Competitive Positioning"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="section-heading-prompt">Heading Prompt</Label>
              <textarea
                id="section-heading-prompt"
                value={newSectionHeadingPrompt}
                onChange={(e) => setNewSectionHeadingPrompt(e.target.value)}
                placeholder="e.g., Create a compelling heading that captures the company's competitive positioning and market dominance..."
                className="w-full mt-2 min-h-[60px] text-sm border border-neutral-300 rounded-md p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 resize-y"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Instructions for AI to generate a dynamic heading for this section
              </p>
            </div>
            <div>
              <Label htmlFor="section-prompt">Prompt</Label>
              <textarea
                id="section-prompt"
                value={newSectionPrompt}
                onChange={(e) => setNewSectionPrompt(e.target.value)}
                placeholder="Write the instructions for the AI to generate this section..."
                className="w-full mt-2 min-h-[120px] text-sm border border-neutral-300 rounded-md p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              />
            </div>
            <div>
              <Label htmlFor="section-keywords">Search Keywords</Label>
              <Input
                id="section-keywords"
                value={newSectionKeywords}
                onChange={(e) => setNewSectionKeywords(e.target.value)}
                placeholder="e.g., competition, market share, peers, moat"
                className="mt-2"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Comma-separated keywords to find relevant document chunks for this section
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSectionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSection}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Update Universal Prompt Confirmation Dialog */}
      <Dialog open={isPromptUpdateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // Treat closing the dialog as "session only"
          handlePromptSessionOnly();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Universal Prompt?</DialogTitle>
            <DialogDescription>
              You've edited the prompt for "{sections.find((s) => s.key === promptUpdateSectionKey)?.title}".
              Would you like to save this as the default prompt for all future reports?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={handlePromptSessionOnly}>
              This Session Only
            </Button>
            <Button onClick={handlePromptUpdateUniversal}>
              <Save className="h-3.5 w-3.5 mr-2" />
              Update Universal Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
