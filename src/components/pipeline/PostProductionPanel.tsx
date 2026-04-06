import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase, getCurrentUserEmail } from '@/lib/supabase';
import {
  createResearchReport,
  updateReportSection,
  addReportSectionColumn,
  updateCustomSection,
  updateSectionHeading,
  finalizeReport,
  getReportBySession,
  publishReport,
} from '@/lib/api';
import { createRecommendation } from '@/lib/recommendations-api';
import type { TextSectionKey, ResearchReport } from '@/types/database';
import type { RecommendationRating } from '@/types/recommendations';
import {
  Check,
  Loader2,
  FileText,
  Presentation,
  FileDown,
  Mic,
  Video,
  ExternalLink,
  Play,
  Download,
  ChevronDown,
  ChevronUp,
  Shield,
  Edit3,
  Send,
} from 'lucide-react';

// ========================
// Constants
// ========================

const N8N_BASE = 'https://n8n.tikonacapital.com/webhook';
const PPT_SERVICE_URL = import.meta.env.VITE_PPT_SERVICE_URL || N8N_BASE;

// Standard research_reports columns (7 text sections)
const STANDARD_SECTION_KEYS: TextSectionKey[] = [
  'company_background',
  'business_model',
  'management_analysis',
  'industry_overview',
  'industry_tailwinds',
  'demand_drivers',
  'industry_risks',
];

// Pipeline sections that don't have a standard column — use cs_ custom mechanism
const CUSTOM_SECTION_KEYS = [
  'investment_rationale',
  'corporate_governance',
  'saarthi_framework',
  'entry_review_exit_strategy',
  'scenario_analysis',
  'rating',
  'target_price',
  'upside_percentage',
  'market_cap',
  'market_cap_category',
  'current_market_price',
];

// ========================
// Props
// ========================

interface PostProductionPanelProps {
  sessionId: string;
  companyName: string;
  nseSymbol: string;
  vaultId: string | null;
  userEmail: string;
  stage2Sections: Array<{ id?: string; key: string; title: string; content: string }>;
  onPublished: () => void;
}

// ========================
// Component
// ========================

export default function PostProductionPanel({
  sessionId,
  companyName,
  nseSymbol,
  vaultId,
  userEmail,
  stage2Sections,
  onPublished,
}: PostProductionPanelProps) {
  // --- Report ---
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportCreating, setReportCreating] = useState(false);

  // --- PPT ---
  const [pptGenerating, setPptGenerating] = useState(false);
  const [pptElapsedSeconds, setPptElapsedSeconds] = useState(0);
  const [pptFileId, setPptFileId] = useState<string | null>(null);
  const [pptFileUrl, setPptFileUrl] = useState<string | null>(null);
  const pptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- PDF ---
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfFileId, setPdfFileId] = useState<string | null>(null);
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);

  // --- Podcast ---
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [podcastScript, setPodcastScript] = useState<string | null>(null);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);

  // --- Video ---
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoFileUrl, setVideoFileUrl] = useState<string | null>(null);
  const [videoElapsedSeconds, setVideoElapsedSeconds] = useState(0);

  // --- UI ---
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // --- Publish & Telegram ---
  const [isPublished, setIsPublished] = useState(false);
  const [telegramSending, setTelegramSending] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);

  // Refs for stable reportId in polling callbacks
  const reportIdRef = useRef(reportId);
  reportIdRef.current = reportId;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pptTimerRef.current) clearInterval(pptTimerRef.current);
    };
  }, []);

  // --- Restore state from existing report on mount ---
  useEffect(() => {
    getReportBySession(sessionId).then((report) => {
      if (report) {
        restoreFromReport(report);
      }
    }).catch(() => {});
  }, [sessionId]);

  function restoreFromReport(report: ResearchReport) {
    setReportId(report.report_id);
    if (report.ppt_file_id) setPptFileId(report.ppt_file_id);
    if (report.ppt_file_url) setPptFileUrl(report.ppt_file_url);
    if (report.pdf_file_id) setPdfFileId(report.pdf_file_id);
    if (report.pdf_file_url) setPdfFileUrl(report.pdf_file_url);
    if (report.podcast_script) setPodcastScript(report.podcast_script);
    if (report.audio_file_url) setAudioFileUrl(report.audio_file_url);
    if (report.video_file_url) setVideoFileUrl(report.video_file_url);
    if (report.is_published) {
      setIsPublished(true);
      if (report.plan) setSelectedPlan(report.plan);
    }
  }

  // ========================
  // Extract recommendation data from stage2 sections
  // ========================

  function getSectionValue(key: string): string {
    const sec = stage2Sections.find((s) => s.key === key);
    return sec?.content?.trim() ?? '';
  }

  function parseNumber(val: string): number | null {
    if (!val) return null;
    // Match first number in string (handles "₹1,234.56 per share" etc.)
    const match = val.match(/[\d,]+\.?\d*/);
    if (!match) return null;
    const n = parseFloat(match[0].replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  // ========================
  // Poll Supabase column (async n8n pattern)
  // ========================

  const pollSupabaseColumn = useCallback(async (
    column: string,
    maxAttempts = 20,
    intervalMs = 5000,
  ): Promise<string | null> => {
    const rid = reportIdRef.current;
    if (!rid) return null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from('research_reports')
        .select(column)
        .eq('report_id', rid)
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
  }, []);

  // ========================
  // Step 1: Create report record from stage2 sections
  // ========================

  const handleCreateReport = async () => {
    if (reportId || stage2Sections.length === 0) return;
    setReportCreating(true);

    try {
      // Get fresh email from auth session to prevent RLS failures
      const freshEmail = await getCurrentUserEmail();
      const emailToUse = freshEmail || userEmail;

      // Create the research_reports row
      const report = await createResearchReport({
        session_id: sessionId,
        user_email: emailToUse,
        company_name: companyName,
        nse_symbol: nseSymbol,
      });
      const rid = report.report_id;
      setReportId(rid);
      reportIdRef.current = rid;

      // Ensure custom columns exist
      for (const key of CUSTOM_SECTION_KEYS) {
        try {
          await addReportSectionColumn(key);
        } catch {
          // Column may already exist — safe to ignore
        }
      }

      // Populate sections
      for (const section of stage2Sections) {
        if (STANDARD_SECTION_KEYS.includes(section.key as TextSectionKey)) {
          await updateReportSection(rid, section.key as TextSectionKey, section.content);
          await updateSectionHeading(rid, section.key, section.title, false);
        } else if (CUSTOM_SECTION_KEYS.includes(section.key)) {
          await updateCustomSection(rid, section.key, section.content);
          await updateSectionHeading(rid, section.key, section.title, true);
        }
      }

      // Finalize
      await finalizeReport(rid, 0, 0);
      toast.success('Report record created — ready for production');
    } catch (err) {
      toast.error(`Failed to create report: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setReportId(null);
    } finally {
      setReportCreating(false);
    }
  };

  // ========================
  // Step 2: Generate PPT
  // ========================

  const handleCreatePPT = useCallback(async () => {
    if (!reportId) return;

    setPptGenerating(true);
    setPptElapsedSeconds(0);

    pptTimerRef.current = setInterval(() => {
      setPptElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const sections = stage2Sections.reduce<Record<string, string>>(
        (acc, s) => ({ ...acc, [s.key]: s.content }), {}
      );
      const sectionHeadings = stage2Sections.reduce<Record<string, string>>(
        (acc, s) => ({ ...acc, [s.key]: s.title }), {}
      );

      const response = await fetch(`${PPT_SERVICE_URL}/generate-ppt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          sessionId,
          sections,
          sectionHeadings,
          companyName,
          nseSymbol,
          vaultId,
        }),
      });

      if (!response.ok) throw new Error(`PPT generation failed: ${response.statusText}`);

      const responseText = await response.text();
      if (!responseText) throw new Error('Empty response from PPT webhook');

      const data = JSON.parse(responseText);
      const row = Array.isArray(data) ? data[0] : data;
      const fileId = row?.ppt_file_id || row?.id;

      if (!fileId) throw new Error('PPT generation returned invalid file data');

      const fileUrl = row?.ppt_file_url || `https://drive.google.com/file/d/${fileId}/view`;
      setPptFileId(fileId);
      setPptFileUrl(fileUrl);
      toast.success('PPT created successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PPT generation failed');
    } finally {
      if (pptTimerRef.current) {
        clearInterval(pptTimerRef.current);
        pptTimerRef.current = null;
      }
      setPptGenerating(false);
    }
  }, [reportId, vaultId, stage2Sections, sessionId, companyName, nseSymbol]);

  // ========================
  // Step 3: Convert to PDF
  // ========================

  const handleConvertPDF = useCallback(async () => {
    if (!reportId || !pptFileId) return;

    setPdfGenerating(true);
    try {
      const response = await fetch(`${N8N_BASE}/convert-to-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, pptFileId, companyName, vaultId }),
      });

      if (!response.ok) throw new Error(`PDF conversion failed: ${response.statusText}`);

      const responseText = await response.text();
      if (!responseText) throw new Error('Empty response from PDF webhook');

      const data = JSON.parse(responseText);
      const pdfFile = Array.isArray(data) ? data[0] : data;

      if (!pdfFile?.id) throw new Error('PDF conversion returned invalid file data');

      const pdfUrl = `https://drive.google.com/file/d/${pdfFile.id}/view`;
      setPdfFileId(pdfFile.id);
      setPdfFileUrl(pdfUrl);

      // Save to DB
      await supabase
        .from('research_reports')
        .update({ pdf_file_id: pdfFile.id, pdf_file_url: pdfUrl, status: 'completed', updated_at: new Date().toISOString() })
        .eq('report_id', reportId);

      toast.success('PDF generated!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF conversion failed');
    } finally {
      setPdfGenerating(false);
    }
  }, [reportId, pptFileId, companyName, vaultId]);

  // ========================
  // Step 4: Generate Podcast Script → Audio
  // ========================

  const handleGenerateScript = useCallback(async () => {
    if (!reportId) return;
    setScriptGenerating(true);
    try {
      const response = await fetch(`${N8N_BASE}/generate-media-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId }),
      });
      if (!response.ok) throw new Error('Script generation failed');

      toast.info('Script generation started — may take 1-2 minutes...');
      const script = await pollSupabaseColumn('podcast_script');

      if (script) {
        setPodcastScript(script);
        toast.success('Podcast script generated!');
      } else {
        toast.error('Script generation timed out. Try refreshing in a minute.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setScriptGenerating(false);
    }
  }, [reportId, pollSupabaseColumn]);

  const handleGenerateAudio = useCallback(async () => {
    if (!reportId || !podcastScript) return;
    setAudioGenerating(true);
    try {
      const response = await fetch(`${N8N_BASE}/synthesize-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_text: podcastScript, report_id: reportId }),
      });
      if (!response.ok) throw new Error('Audio generation failed');

      toast.info('Audio generation started — may take 1-2 minutes...');
      const url = await pollSupabaseColumn('audio_file_url');

      if (url) {
        setAudioFileUrl(url);
        toast.success('Podcast audio generated!');
      } else {
        toast.error('Audio generation timed out. Try refreshing in a minute.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      setAudioGenerating(false);
    }
  }, [reportId, podcastScript, pollSupabaseColumn]);

  // ========================
  // Step 5: Generate Video
  // ========================

  const handleGenerateVideo = useCallback(async () => {
    if (!reportId) return;
    setVideoGenerating(true);
    setVideoElapsedSeconds(0);

    const timer = setInterval(() => {
      setVideoElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const response = await fetch(`${N8N_BASE}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          company_name: companyName,
          nse_symbol: nseSymbol,
        }),
      });

      if (!response.ok) throw new Error('Video generation failed');

      toast.info('Video generation started — may take 3-5 minutes...');
      const url = await pollSupabaseColumn('video_file_url', 60, 5000);

      if (url) {
        setVideoFileUrl(url);
        toast.success('Video generated!');
      } else {
        toast.warning('Video generation taking longer than expected. Check back later.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate video');
    } finally {
      clearInterval(timer);
      setVideoGenerating(false);
    }
  }, [reportId, companyName, nseSymbol, pollSupabaseColumn]);

  // ========================
  // Publish
  // ========================

  const handlePublish = async () => {
    if (!reportId || !selectedPlan) {
      toast.error('Please select a plan before publishing');
      return;
    }
    try {
      await publishReport(reportId, selectedPlan);
      setIsPublished(true);
      onPublished();
    } catch (err) {
      toast.error(`Failed to publish: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // ========================
  // Step 6: Send Recommendation to Telegram
  // ========================

  const handleSendRecommendation = async () => {
    if (!reportId || !selectedPlan) return;
    setTelegramSending(true);

    try {
      // Fetch report record to get cs_ columns
      const report = await getReportBySession(sessionId);
      const reportData = report as any;

      const rawRating = String(reportData?.cs_rating || getSectionValue('rating') || '').toUpperCase();
      const rating: RecommendationRating = rawRating.includes('SELL') ? 'SELL' : 'BUY';

      const cmpRaw = String(reportData?.cs_current_market_price || getSectionValue('current_market_price') || '');
      const tpRaw = String(reportData?.cs_target_price || getSectionValue('target_price') || '');
      const cmp = parseNumber(cmpRaw);
      const targetPrice = parseNumber(tpRaw);
      if (!targetPrice) {
        toast.error('Target price not found in report');
        setTelegramSending(false);
        return;
      }

      await createRecommendation({
        company_name: companyName,
        nse_symbol: nseSymbol,
        rating,
        cmp,
        target_price: targetPrice,
        validity_type: '1_year',
        validity_date: null,
        plans: [selectedPlan as any],
        trade_notes: null,
        report_file_url: pdfFileUrl || null,
        session_id: sessionId,
        send_telegram: true,
        created_by: userEmail,
        pdf_file_id: pdfFileId,
      });

      setTelegramSent(true);
      toast.success('Recommendation sent to Telegram!');
    } catch (err) {
      toast.error(`Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTelegramSending(false);
    }
  };

  // ========================
  // Helpers
  // ========================

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const isAnyGenerating = pptGenerating || pdfGenerating || scriptGenerating || audioGenerating || videoGenerating || reportCreating;

  // ========================
  // RENDER
  // ========================

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
        <h2 className="text-sm font-semibold text-neutral-900">Production Workflow</h2>
        <p className="text-[10px] text-neutral-400 mt-0.5">Generate deliverables from the approved report</p>
      </div>

      <div className="divide-y divide-neutral-100">
        {/* === Step 1: Create Report Record === */}
        <StepRow
          number={1}
          title="Create Report Record"
          description="Split sections into research_reports table"
          done={!!reportId}
          active={!reportId}
        >
          {!reportId ? (
            <Button
              onClick={handleCreateReport}
              disabled={reportCreating || stage2Sections.length === 0}
              size="sm"
              className="rounded-lg bg-accent-600 hover:bg-accent-700"
            >
              {reportCreating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating...</> : <><FileText className="h-3.5 w-3.5 mr-1.5" /> Create Record</>}
            </Button>
          ) : (
            <span className="text-[11px] text-emerald-600 font-medium">Report record ready</span>
          )}
        </StepRow>

        {/* === Step 2: Generate PPT === */}
        <StepRow
          number={2}
          title="Generate Presentation"
          description="Create PPT from report sections via n8n"
          done={!!pptFileId}
          active={!!reportId && !pptFileId}
          disabled={!reportId}
        >
          {!pptFileId ? (
            <Button
              onClick={handleCreatePPT}
              disabled={!reportId || pptGenerating || isAnyGenerating}
              size="sm"
              className="rounded-lg bg-accent-600 hover:bg-accent-700"
            >
              {pptGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating ({formatTime(pptElapsedSeconds)})...</>
              ) : (
                <><Presentation className="h-3.5 w-3.5 mr-1.5" /> Generate PPT</>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <a
                href={pptFileUrl!.replace('/view', '/edit').replace('file/d/', 'presentation/d/')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1"
              >
                <Edit3 className="h-3 w-3" /> Edit in Slides
              </a>
              <a href={pptFileUrl!} target="_blank" rel="noopener noreferrer" className="text-[11px] text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> View
              </a>
            </div>
          )}
        </StepRow>

        {/* === Step 3: Convert to PDF === */}
        <StepRow
          number={3}
          title="Convert to PDF"
          description="Convert the PPT to PDF for distribution"
          done={!!pdfFileId}
          active={!!pptFileId && !pdfFileId}
          disabled={!pptFileId}
        >
          {!pdfFileId ? (
            <Button
              onClick={handleConvertPDF}
              disabled={!pptFileId || pdfGenerating || isAnyGenerating}
              size="sm"
              className="rounded-lg bg-accent-600 hover:bg-accent-700"
            >
              {pdfGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Converting...</>
              ) : (
                <><FileDown className="h-3.5 w-3.5 mr-1.5" /> Convert to PDF</>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <a href={pdfFileUrl!} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> View PDF
              </a>
              <a
                href={pdfFileUrl!.replace('/view', '/export?format=pdf')}
                className="text-[11px] text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          )}
        </StepRow>

        {/* === Step 4: Podcast === */}
        <StepRow
          number={4}
          title="Generate Podcast"
          description="Create script, then synthesize audio"
          done={!!audioFileUrl}
          active={!!reportId && !audioFileUrl}
          disabled={!reportId}
        >
          <div className="space-y-3">
            {/* Script */}
            {!podcastScript ? (
              <Button
                onClick={handleGenerateScript}
                disabled={!reportId || scriptGenerating || isAnyGenerating}
                size="sm"
                variant={audioFileUrl ? 'outline' : 'default'}
                className={cn('rounded-lg', !audioFileUrl && 'bg-accent-600 hover:bg-accent-700')}
              >
                {scriptGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating Script...</>
                ) : (
                  <><Mic className="h-3.5 w-3.5 mr-1.5" /> Generate Script</>
                )}
              </Button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-600 font-medium">Script ready</span>
                  <button
                    onClick={() => setScriptExpanded(!scriptExpanded)}
                    className="text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center gap-0.5"
                  >
                    {scriptExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {scriptExpanded ? 'Hide' : 'View'}
                  </button>
                </div>

                {scriptExpanded && (
                  <textarea
                    value={podcastScript}
                    onChange={(e) => setPodcastScript(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[11px] text-neutral-800 font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400"
                    style={{ minHeight: '120px', maxHeight: '300px' }}
                    spellCheck={false}
                  />
                )}

                {/* Audio */}
                {!audioFileUrl ? (
                  <Button
                    onClick={handleGenerateAudio}
                    disabled={audioGenerating || isAnyGenerating}
                    size="sm"
                    className="rounded-lg bg-accent-600 hover:bg-accent-700"
                  >
                    {audioGenerating ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating Audio...</>
                    ) : (
                      <><Play className="h-3.5 w-3.5 mr-1.5" /> Generate Audio</>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-3">
                    <audio controls src={audioFileUrl} className="h-8 flex-1" />
                    <a href={audioFileUrl} download className="text-[11px] text-neutral-500 hover:text-neutral-700 flex items-center gap-1 shrink-0">
                      <Download className="h-3 w-3" /> MP3
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </StepRow>

        {/* === Step 5: Video === */}
        <StepRow
          number={5}
          title="Generate Video"
          description="Create video summary from report"
          done={!!videoFileUrl}
          active={!!reportId && !videoFileUrl}
          disabled={!reportId}
        >
          {!videoFileUrl ? (
            <Button
              onClick={handleGenerateVideo}
              disabled={!reportId || videoGenerating || isAnyGenerating}
              size="sm"
              className="rounded-lg bg-accent-600 hover:bg-accent-700"
            >
              {videoGenerating ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating ({formatTime(videoElapsedSeconds)})...</>
              ) : (
                <><Video className="h-3.5 w-3.5 mr-1.5" /> Generate Video</>
              )}
            </Button>
          ) : (
            <div className="space-y-2">
              <video controls src={videoFileUrl} className="w-full max-h-48 rounded-lg bg-black" />
              <a href={videoFileUrl} download className="text-[11px] text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
                <Download className="h-3 w-3" /> Download MP4
              </a>
            </div>
          )}
        </StepRow>
      </div>

      {/* === Publish === */}
      <div className="px-4 py-4 border-t border-neutral-100 bg-neutral-50/30 flex flex-col gap-3">
        {pdfFileId && (
          <div className="space-y-1.5 focus-within:relative z-10">
            <label className="text-xs font-semibold text-neutral-700">Select Plan to Publish For</label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger className="w-full bg-white text-sm">
                <SelectValue placeholder="Choose a plan..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="midcap_wealth">Mid Cap Wealth Builders</SelectItem>
                <SelectItem value="smallcap_alpha">Smallcap Alpha Picks</SelectItem>
                <SelectItem value="sme_emerging">SME Emerging Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {!isPublished ? (
          <>
            <Button
              onClick={handlePublish}
              disabled={!pdfFileId || !selectedPlan || isAnyGenerating}
              className={cn(
                'w-full h-10 rounded-lg font-semibold text-sm',
                pdfFileId && selectedPlan
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              )}
            >
              <Shield className="h-4 w-4 mr-2" /> Publish Report
            </Button>
            {!pdfFileId && (
              <p className="text-[10px] text-neutral-400 text-center mt-1.5 transition-opacity">PDF must be generated before publishing</p>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
            <Check className="h-4 w-4" /> Report Published
          </div>
        )}
      </div>

      {/* === Step 6: Send Recommendation to Telegram === */}
      {isPublished && (
        <div className="px-4 py-4 border-t border-neutral-100 bg-gradient-to-b from-blue-50/40 to-white">
          <div className="flex items-start gap-3">
            <div className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold shrink-0 mt-0.5',
              telegramSent ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
            )}>
              {telegramSent ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : 6}
            </div>

            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium', telegramSent ? 'text-emerald-700' : 'text-neutral-900')}>
                Send Recommendation to Telegram
              </p>
              <p className="text-[10px] text-neutral-400 mb-3">
                Create a recommendation record and send to subscribers
              </p>

              {/* Preview auto-filled data */}
              {(() => {
                const rating = getSectionValue('rating').toUpperCase().includes('SELL') ? 'SELL' : 'BUY';
                const cmp = parseNumber(getSectionValue('current_market_price'));
                const tp = parseNumber(getSectionValue('target_price'));
                const upside = cmp && tp ? (((tp - cmp) / cmp) * 100).toFixed(1) : null;
                const planLabel = selectedPlan === 'midcap_wealth' ? 'Mid Cap Wealth Builders'
                  : selectedPlan === 'smallcap_alpha' ? 'Smallcap Alpha Picks'
                  : selectedPlan === 'sme_emerging' ? 'SME Emerging Business' : selectedPlan;

                return (
                  <div className="rounded-lg border border-neutral-200 bg-white p-3 mb-3 space-y-1.5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                      <div>
                        <span className="text-neutral-400">Company</span>
                        <p className="font-medium text-neutral-800">{companyName} ({nseSymbol})</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Rating</span>
                        <p className={cn('font-semibold', rating === 'BUY' ? 'text-green-600' : 'text-red-600')}>{rating}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">CMP</span>
                        <p className="font-medium text-neutral-800">{cmp != null ? `₹${cmp.toLocaleString('en-IN')}` : '—'}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Target Price</span>
                        <p className="font-medium text-neutral-800">{tp != null ? `₹${tp.toLocaleString('en-IN')}` : '—'}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Upside</span>
                        <p className="font-medium text-neutral-800">{upside ? `${upside}%` : '—'}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Plan</span>
                        <p className="font-medium text-neutral-800">{planLabel}</p>
                      </div>
                    </div>
                    {pdfFileUrl && (
                      <div className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-100">
                        Report: <a href={pdfFileUrl} target="_blank" rel="noopener noreferrer" className="text-accent-600 hover:underline">PDF attached</a>
                      </div>
                    )}
                  </div>
                );
              })()}

              {!telegramSent ? (
                <Button
                  onClick={handleSendRecommendation}
                  disabled={telegramSending}
                  size="sm"
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {telegramSending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending...</>
                  ) : (
                    <><Send className="h-3.5 w-3.5 mr-1.5" /> Send to Telegram</>
                  )}
                </Button>
              ) : (
                <span className="text-[11px] text-emerald-600 font-medium">Recommendation sent to Telegram</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// Step Row sub-component
// ========================

interface StepRowProps {
  number: number;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

function StepRow({ number, title, description, done, active, disabled, children }: StepRowProps) {
  return (
    <div className={cn('px-4 py-3.5 flex items-start gap-3', disabled && 'opacity-50')}>
      {/* Step indicator */}
      <div className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold shrink-0 mt-0.5',
        done ? 'bg-emerald-100 text-emerald-700' :
        active ? 'bg-accent-100 text-accent-700' :
        'bg-neutral-100 text-neutral-400'
      )}>
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : number}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className={cn('text-sm font-medium', done ? 'text-emerald-700' : active ? 'text-neutral-900' : 'text-neutral-500')}>
              {title}
            </p>
            <p className="text-[10px] text-neutral-400">{description}</p>
          </div>
        </div>
        <div className="mt-2">
          {children}
        </div>
      </div>
    </div>
  );
}
