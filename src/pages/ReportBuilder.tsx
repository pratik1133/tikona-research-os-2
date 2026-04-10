import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Search, Building2, ChevronRight, ChevronLeft, Check,
  Loader2, Download, Save, Plus, FileText, Sparkles,
  LayoutTemplate, Trash2, ArrowLeft, Type, Table2, BarChart3, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TikonaLogo from '@/components/ui/TikonaLogo';
import { useCompanySearch, useCompanyFinancials } from '@/hooks/useCompanySearch';
import BlockEditor from '@/components/report-builder/BlockEditor';
import TemplateBuilder from '@/components/report-builder/TemplateBuilder';
import { generateFullReport, AVAILABLE_MODELS } from '@/lib/openrouter';
import type { MasterCompany } from '@/types/database';
import type {
  ReportTemplate, ReportBlock, GeneratedReport, GenerationProgress,
} from '@/types/report-builder';
import pptxgen from 'pptxgenjs';
// ========================
// Default Templates
// ========================
const DEFAULT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'default-comprehensive',
    name: 'Comprehensive Research Report',
    sectors: [],
    isDefault: true,
    createdAt: new Date().toISOString(),
    questions: [
      { id: 'q1', heading: 'Company Overview', question: 'What does the company do? Describe its history, founders, headquarters, and key milestones.', answerFormats: ['text'], sortOrder: 0 },
      { id: 'q2', heading: 'Business Model', question: 'What is the core business model? How does the company generate revenue? Include a revenue breakdown by segment and geography.', guidance: 'Include a table with revenue segments', answerFormats: ['text', 'table'], sortOrder: 1 },
      { id: 'q3', heading: 'Revenue & Profitability', question: 'Provide a 5-year financial summary showing revenue, EBITDA, PAT, and key margins. Also show a revenue growth trend chart.', answerFormats: ['table', 'chart'], sortOrder: 2 },
      { id: 'q4', heading: 'Competitive Advantage', question: 'What is the competitive moat? What gives this company an edge over peers?', answerFormats: ['text'], sortOrder: 3 },
      { id: 'q5', heading: 'Management Analysis', question: 'Evaluate the management team quality, track record, capital allocation decisions, and corporate governance. Include a sentiment assessment.', answerFormats: ['text', 'sentiment'], sortOrder: 4, guidance: 'Rate management as positive, negative, or neutral with reasoning' },
      { id: 'q6', heading: 'Industry & Tailwinds', question: 'What are the key industry dynamics, growth drivers, and tailwinds benefiting this company?', answerFormats: ['text'], sortOrder: 5 },
      { id: 'q7', heading: 'Risk Factors', question: 'What are the key risks and concerns for this investment? Include regulatory, competitive, and operational risks.', answerFormats: ['text', 'sentiment'], sortOrder: 6, guidance: 'Rate overall risk as positive, negative, or neutral' },
      { id: 'q8', heading: 'Valuation', question: 'Is the stock fairly valued? Compare current valuations with historical averages and peer group. Include a valuation comparison table.', answerFormats: ['text', 'table'], sortOrder: 7 },
    ],
  },
  {
    id: 'default-quick',
    name: 'Quick Research Note',
    sectors: [],
    isDefault: true,
    createdAt: new Date().toISOString(),
    questions: [
      { id: 'qq1', heading: 'Investment Summary', question: 'Provide a concise investment thesis for this company in 3-4 paragraphs.', answerFormats: ['text'], sortOrder: 0 },
      { id: 'qq2', heading: 'Key Financials', question: 'Show a table with the last 3 years of revenue, EBITDA, PAT, EPS, and P/E ratio.', answerFormats: ['table'], sortOrder: 1 },
      { id: 'qq3', heading: 'Bull & Bear Case', question: 'What are the top 3 reasons to buy and top 3 reasons to avoid this stock?', answerFormats: ['text', 'sentiment'], sortOrder: 2 },
      { id: 'qq4', heading: 'Target Price', question: 'What is a reasonable 1-year target price and what methodology supports it?', answerFormats: ['text'], sortOrder: 3 },
    ],
  },
];

// ========================
// Local Storage Helpers
// ========================
const TEMPLATES_KEY = 'tikona-report-templates';
const REPORTS_KEY = 'tikona-report-builder-reports';

function loadTemplates(): ReportTemplate[] {
  try {
    const saved = localStorage.getItem(TEMPLATES_KEY);
    const custom = saved ? JSON.parse(saved) : [];
    return [...DEFAULT_TEMPLATES, ...custom];
  } catch { return DEFAULT_TEMPLATES; }
}

function saveCustomTemplates(templates: ReportTemplate[]) {
  const custom = templates.filter(t => !t.isDefault);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(custom));
}

function loadReports(): GeneratedReport[] {
  try {
    const saved = localStorage.getItem(REPORTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveReports(reports: GeneratedReport[]) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

// ========================
// Wizard Steps
// ========================
type WizardStep = 'company' | 'template' | 'generate' | 'editor';

// ========================
// Component
// ========================
export default function ReportBuilder() {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('company');

  // Step 1: Company
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<MasterCompany | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Step 2: Template
  const [templates, setTemplates] = useState<ReportTemplate[]>(loadTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);

  // Step 3: Generate
  const [reportName, setReportName] = useState('');
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Editor
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [currentReport, setCurrentReport] = useState<GeneratedReport | null>(null);

  // Previous reports
  const [savedReports, setSavedReports] = useState<GeneratedReport[]>(loadReports);

  // Search
  const { data: searchResults, isLoading: isSearching } = useCompanySearch(debouncedSearch);
  const { data: financials } = useCompanyFinancials(
    selectedCompany || (currentReport ? { nse_symbol: currentReport.nseSymbol } : null)
  );

  // Debounce
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

  // Auto-fill report name
  useEffect(() => {
    if (selectedCompany && !reportName) {
      setReportName(selectedCompany.company_name);
    }
  }, [selectedCompany, reportName]);

  // Company selection
  const handleSelectCompany = (company: MasterCompany) => {
    setSelectedCompany(company);
    setSearchInput(company.company_name);
    setIsDropdownOpen(false);
  };

  // Template management
  const handleSaveTemplate = (template: ReportTemplate) => {
    const updated = [...templates.filter(t => t.id !== template.id), template];
    setTemplates(updated);
    saveCustomTemplates(updated);
    setShowTemplateBuilder(false);
    setSelectedTemplate(template);
    toast.success('Template saved');
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveCustomTemplates(updated);
    if (selectedTemplate?.id === id) setSelectedTemplate(null);
    toast.success('Template deleted');
  };

  // Generate report
  const handleGenerate = useCallback(async () => {
    if (!selectedCompany || !selectedTemplate || !reportName.trim()) return;
    setIsGenerating(true);

    try {
      const sector = financials?.sector || financials?.broad_sector || 'General';
      const generatedBlocks = await generateFullReport(
        selectedCompany.company_name,
        selectedCompany.nse_symbol || '',
        sector,
        selectedTemplate.questions,
        selectedModel,
        setProgress,
      );

      setBlocks(generatedBlocks);

      const report: GeneratedReport = {
        id: crypto.randomUUID(),
        name: reportName.trim(),
        companyName: selectedCompany.company_name,
        nseSymbol: selectedCompany.nse_symbol || '',
        sector,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        blocks: generatedBlocks,
        model: selectedModel,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCurrentReport(report);

      const updatedReports = [report, ...savedReports.slice(0, 49)];
      setSavedReports(updatedReports);
      saveReports(updatedReports);

      setStep('editor');
      toast.success('Report generated successfully!');
    } catch (err) {
      toast.error(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [selectedCompany, selectedTemplate, reportName, selectedModel, financials, savedReports]);

  // Block Insertion Logic
  const handleAddBlock = useCallback((type: 'text' | 'table' | 'chart' | 'sentiment') => {
    const defaults: any = {
      text: { markdown: 'Click to edit...' },
      table: { headers: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', '']] },
      chart: { chartType: 'bar', title: 'Chart Title', labels: ['A', 'B', 'C'], datasets: [{ label: 'Value', data: [10, 20, 30] }] },
      sentiment: { sentiment: 'positive', title: 'Outlook', text: 'Click to edit...' },
    };

    const newBlock: ReportBlock = { 
      id: crypto.randomUUID(), 
      type, 
      content: defaults[type] 
    };

    if (activeBlockId) {
      const idx = blocks.findIndex(b => b.id === activeBlockId);
      if (idx !== -1) {
        const newBlocks = [...blocks];
        newBlocks.splice(idx + 1, 0, newBlock);
        setBlocks(newBlocks);
      } else {
        setBlocks([...blocks, newBlock]);
      }
    } else {
      setBlocks([...blocks, newBlock]);
    }
    setActiveBlockId(newBlock.id);
  }, [blocks, activeBlockId]);

  // Save current editor state
  const handleSaveReport = useCallback(() => {
    if (!currentReport) return;
    const updated: GeneratedReport = { ...currentReport, blocks, updatedAt: new Date().toISOString() };
    setCurrentReport(updated);
    const updatedReports = savedReports.map(r => r.id === updated.id ? updated : r);
    setSavedReports(updatedReports);
    saveReports(updatedReports);
    toast.success('Report saved');
  }, [currentReport, blocks, savedReports]);

  // Load previous report
  const handleLoadReport = (report: GeneratedReport) => {
    setCurrentReport(report);
    setBlocks(report.blocks);
    setStep('editor');
  };

  // Export PDF via native browser print engine
  // Note: Client-side JS PDF libraries (like html2pdf/html2canvas) fail to parse 
  // modern CSS color spaces like Tailwind v4's OKLCH palette, leading to fatal crashes.
  // The native browser print dialog leverages the browser's C++ rendering engine,
  // making it the most robust option for modern React apps.
  const handleExportPDF = useCallback(() => {
    window.print();
  }, []);

  // Export PPT via pptxgenjs
  const handleExportPPT = useCallback(() => {
    if (!currentReport || blocks.length === 0) return;

    try {
      const pres = new pptxgen();
      
      // Title Slide
      let slide = pres.addSlide();
      slide.addText(currentReport.companyName, {
        x: 1, y: 2, w: 8, h: 1, fontSize: 32, bold: true, color: '3b5b99'
      });
      slide.addText(`NSE: ${currentReport.nseSymbol}  |  ${currentReport.sector}`, {
        x: 1, y: 3, w: 8, h: 1, fontSize: 18, color: '666666'
      });
      
      // Build slides from blocks
      blocks.forEach(block => {
         const slide = pres.addSlide();
         
         if (block.type === 'text') {
           const content = block.content as any;
           const cleanText = content.markdown ? content.markdown.replace(/[*#`]/g, '') : '';
           slide.addText(cleanText, { x: 0.5, y: 0.5, w: 9, h: 4, valign: 'top', fontSize: 14 });
         } else if (block.type === 'table') {
           try {
             const content = block.content as any;
             const headers = content.columns.map((c: any) => ({ text: c.header, options: { bold: true, fill: { color: '3b5b99' }, color: 'FFFFFF' } }));
             const dataRows = content.rows.map((r: any) => content.columns.map((c: any) => r[c.key]?.toString() || '-'));
             slide.addTable([headers, ...dataRows], {
               x: 0.5, y: 0.5, w: 9, 
               colW: 9 / headers.length,
               fill: { color: 'FFFFFF' }, color: '000000',
               border: { type: 'solid', color: 'cccccc', pt: 1 },
               fontSize: 12
             });
           } catch(e) { }
         } else if (block.type === 'sentiment') {
           const content = block.content as any;
           slide.addText(`Sentiment: ${content.sentiment.toUpperCase()}`, { x: 0.5, y: 0.5, w: 9, h: 0.5, fontSize: 18, bold: true, color: '3b5b99' });
           slide.addText(content.text, { x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 14, valign: 'top' });
         }
         // Note: Charts aren't supported natively without image parsing, keeping them basic for PPT.
      });
      
      pres.writeFile({ fileName: `${currentReport.companyName}_Report.pptx` });
      toast.success('PPT exported successfully');
    } catch (e) {
      console.error(e);
      toast.error('Failed to export PPT');
    }
  }, [blocks, currentReport]);

  // Reset to start
  const handleNewReport = () => {
    setStep('company');
    setSelectedCompany(null);
    setSelectedTemplate(null);
    setSearchInput('');
    setReportName('');
    setBlocks([]);
    setCurrentReport(null);
    setProgress(null);
    setActiveBlockId(null);
  };

  // ========================
  // Step indicators
  // ========================
  const steps = [
    { key: 'company', label: 'Select Company', sublabel: 'Choose a company to analyse' },
    { key: 'template', label: 'Choose Template', sublabel: 'Pick or create a template' },
    { key: 'generate', label: 'Generate Report', sublabel: 'Name and generate your report' },
  ];

  const stepIndex = step === 'company' ? 0 : step === 'template' ? 1 : step === 'generate' ? 2 : 3;

  // ========================
  // RENDER: Editor Mode
  // ========================
  if (step === 'editor') {
    return (
      <div className="h-screen flex flex-col bg-surface-muted overflow-hidden">
        {/* Editor Toolbar */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-neutral-900 text-white print:hidden shadow-md z-20">
          <div className="flex items-center gap-3">
            <button onClick={handleNewReport} className="text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FileText className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">{currentReport?.name || 'Report Editor'}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleExportPPT} variant="outline" size="sm" className="rounded border-neutral-600 text-neutral-300 hover:text-white hover:border-neutral-400 bg-transparent h-8 shadow-none">
              <FileText className="h-3.5 w-3.5 mr-2" /> Download PPT
            </Button>
            <Button onClick={handleExportPDF} size="sm" className="rounded bg-blue-600 hover:bg-blue-700 text-white h-8 border-none shadow-none">
              <Download className="h-3.5 w-3.5 mr-2" /> Download PDF
            </Button>
            <Button onClick={handleSaveReport} size="sm" className="rounded bg-green-600 hover:bg-green-700 text-white h-8 border-none shadow-none">
              <Save className="h-3.5 w-3.5 mr-2" /> Save
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar (Tools & Block List) */}
          <div className="w-[300px] flex-shrink-0 bg-white border-r border-neutral-200 flex flex-col print:hidden z-10 shadow-[2px_0_10px_rgba(0,0,0,0.03)] h-full overflow-y-auto">
            {/* INSERT section block */}
            <div className="p-5 border-b border-neutral-100">
              <h3 className="text-xs font-semibold text-neutral-400 tracking-wider mb-4 uppercase">Insert</h3>
              <div className="space-y-2">
                <button onClick={() => handleAddBlock('text')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 hover:border-blue-400 hover:bg-blue-50 text-sm text-neutral-700 transition-colors shadow-sm">
                  <Type className="h-4 w-4 text-neutral-400" /> Text Block
                </button>
                <button onClick={() => handleAddBlock('table')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 hover:border-blue-400 hover:bg-blue-50 text-sm text-neutral-700 transition-colors shadow-sm">
                  <Table2 className="h-4 w-4 text-neutral-400" /> New Table
                </button>
                <button onClick={() => handleAddBlock('chart')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 hover:border-blue-400 hover:bg-blue-50 text-sm text-neutral-700 transition-colors shadow-sm">
                  <BarChart3 className="h-4 w-4 text-neutral-400" /> New Chart
                </button>
                <button onClick={() => handleAddBlock('sentiment')} className="w-full flex items-center gap-3 p-3 rounded-lg border border-green-200 hover:border-green-400 hover:bg-green-50 text-sm text-neutral-700 transition-colors shadow-sm">
                  <MessageSquare className="h-4 w-4 text-green-500" /> New Sentiment
                </button>
              </div>
            </div>

            {/* BLOCKS List */}
            <div className="p-5 border-b border-neutral-100 flex-1">
              <h3 className="text-xs font-semibold text-neutral-400 tracking-wider mb-4 uppercase">
                Blocks ({blocks.length})
              </h3>
              <div className="space-y-1">
                {blocks.map((b, i) => (
                  <button 
                    key={b.id} 
                    onClick={() => setActiveBlockId(b.id)}
                    className={`w-full text-left flex items-center gap-2 p-2 rounded-md transition-colors text-xs ${activeBlockId === b.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-neutral-50 text-neutral-600'}`}
                  >
                    <span className="text-neutral-400 w-4">{i + 1}.</span>
                    {b.type === 'text' && <Type className="h-3 w-3 shrink-0" />}
                    {b.type === 'table' && <Table2 className="h-3 w-3 shrink-0" />}
                    {b.type === 'chart' && <BarChart3 className="h-3 w-3 shrink-0" />}
                    {b.type === 'sentiment' && <MessageSquare className="h-3 w-3 shrink-0 text-green-500" />}
                    <span className="truncate">
                      {(b.content as any).title || (b.content as any).sentiment || b.type.charAt(0).toUpperCase() + b.type.slice(1)} Block
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* TIPS */}
            <div className="p-5 bg-neutral-50">
              <h3 className="text-xs font-semibold text-neutral-400 tracking-wider mb-3 uppercase">Tips</h3>
              <ul className="text-xs text-neutral-500 space-y-2 list-disc pl-4">
                <li>Click a block to select, then use arrows to reorder</li>
                <li>Right-click table cells for row/col operations</li>
                <li>Hover over blocks to see formatting tools</li>
              </ul>
            </div>
          </div>

          {/* Right Canvas (A4 WYSIWYG) */}
          <div className="flex-1 overflow-y-auto w-full flex justify-center items-start py-10 bg-neutral-100/50">
            {/* The actual A4 document container representing the PDF */}
            <div 
              id="report-print-container"
              className="bg-white mx-auto shadow-[0_5px_25px_rgba(0,0,0,0.1)] relative w-[210mm] min-h-[297mm] h-max px-[20mm] py-[15mm] print:w-full print:p-0 print:shadow-none"
            >
              
              {/* GIS-style Cover Card (Fixed at top of A4) */}
              <div className="mb-6 rounded-lg bg-neutral-50 border border-neutral-200 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-neutral-900 text-2xl font-bold mb-1 font-serif tracking-tight">
                      {currentReport?.companyName} <span className="font-sans font-normal text-sm text-neutral-500 ml-1">(NSE Code : {currentReport?.nseSymbol})</span>
                    </h1>
                    <p className="text-sm text-neutral-500 tracking-wide inline-flex items-center gap-2">
                       Price : Rs.{financials?.current_price?.toFixed(1) || '—'}
                       <span className="text-neutral-300">|</span>
                       MCAP : Rs.{(financials?.market_cap ? financials.market_cap : 0).toLocaleString()} Cr.
                       <span className="text-neutral-300">|</span>
                       Industry : {financials?.industry || currentReport?.sector}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end pt-1">
                    <TikonaLogo className="h-8 mb-2" />
                    <p className="text-xs text-neutral-500 font-medium tracking-wide">
                      {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Seamless Block Editor injection inside A4 container */}
              <BlockEditor
                blocks={blocks}
                onChange={setBlocks}
                activeBlockId={activeBlockId}
                onSelectBlock={setActiveBlockId}
              />
              
              {/* Footer text included in print */}
              <div className="mt-12 pt-4 border-t border-neutral-200 text-center text-xs text-neutral-400 pb-2">
                Made on Tikona Capital OS
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // RENDER: Wizard Mode
  // ========================
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Report Builder</h1>
        <p className="text-sm text-neutral-500 mt-1">Generate AI-powered equity research reports with custom templates</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8 px-4">
        {steps.map((s, i) => {
          const done = stepIndex > i;
          const active = stepIndex === i;
          return (
            <div key={s.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  done ? 'bg-green-500 text-white' :
                  active ? 'bg-accent-600 text-white ring-4 ring-accent-100' :
                  'bg-neutral-200 text-neutral-500'
                }`}>
                  {done ? <Check className="h-5 w-5" /> : i + 1}
                </div>
                <p className={`text-xs font-semibold mt-2 ${active ? 'text-accent-700' : 'text-neutral-500'}`}>{s.label}</p>
                <p className="text-xs text-neutral-400">{s.sublabel}</p>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 mt-[-24px] ${done ? 'bg-green-400' : 'bg-neutral-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ===== STEP 1: Company Selection ===== */}
      {step === 'company' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 animate-fade-up">
          {/* Company Search */}
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setIsDropdownOpen(true); setSelectedCompany(null); }}
                onFocus={() => searchInput.length >= 2 && setIsDropdownOpen(true)}
                placeholder="Search by company name or NSE symbol..."
                className="w-full h-12 pl-10 pr-4 rounded-xl border border-neutral-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400"
              />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 animate-spin" />}
            </div>

            {isDropdownOpen && searchResults && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow-xl max-h-60 overflow-y-auto">
                {searchResults.map((company) => (
                  <button
                    key={company.company_id}
                    onClick={() => handleSelectCompany(company)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent-50 transition-colors text-left border-b border-neutral-50 last:border-0"
                  >
                    <Building2 className="h-4 w-4 text-neutral-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{company.company_name}</p>
                      <p className="text-xs text-neutral-400 font-mono">{company.nse_symbol || company.isin}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Company Card */}
          {selectedCompany && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50/50 p-4 animate-fade-up">
              <div className="flex items-center gap-2 mb-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">{selectedCompany.company_name}</span>
                <span className="text-xs font-mono text-green-600 bg-green-100 px-2 py-0.5 rounded">NSE: {selectedCompany.nse_symbol}</span>
              </div>
              {financials && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                  {[
                    { label: 'Market Cap', value: financials.market_cap ? `₹${financials.market_cap.toLocaleString()} Cr` : '—' },
                    { label: 'CMP', value: financials.current_price ? `₹${financials.current_price.toFixed(0)}` : '—' },
                    { label: 'P/E', value: financials.pe_ttm?.toFixed(1) ?? '—' },
                    { label: 'ROE', value: financials.roe ? `${financials.roe.toFixed(1)}%` : '—' },
                    { label: 'Sector', value: financials.sector || financials.broad_sector || '—' },
                    { label: 'EBITDA M%', value: financials.ebitda_margin_ttm ? `${financials.ebitda_margin_ttm.toFixed(1)}%` : '—' },
                  ].map(m => (
                    <div key={m.label} className="rounded-lg bg-white border border-green-100 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{m.label}</p>
                      <p className="text-sm font-semibold text-neutral-900 tabular-nums">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Previous Reports */}
          {savedReports.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Previous Reports</h3>
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-neutral-500">Report Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-neutral-500">Generated On</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-neutral-500">Template</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-neutral-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {savedReports.slice(0, 5).map(report => (
                      <tr key={report.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => handleLoadReport(report)} className="text-accent-600 hover:text-accent-700 font-medium">
                            {report.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-neutral-500">{new Date(report.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-neutral-500">{report.templateName}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              const updated = savedReports.filter(r => r.id !== report.id);
                              setSavedReports(updated);
                              saveReports(updated);
                            }}
                            className="text-neutral-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Next Button */}
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => setStep('template')}
              disabled={!selectedCompany}
              className="rounded-xl bg-accent-600 hover:bg-accent-700 px-6"
            >
              Next: Choose Template <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP 2: Template Selection ===== */}
      {step === 'template' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setStep('company')} className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> Back to Company
            </button>
            <Button onClick={() => setShowTemplateBuilder(true)} variant="outline" size="sm" className="rounded-lg">
              <Plus className="h-3.5 w-3.5 mr-2" /> Create Template
            </Button>
          </div>

          {/* Company badge */}
          <div className="rounded-xl border border-green-200 bg-green-50/30 px-4 py-3 flex items-center gap-2 mb-5">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">{selectedCompany?.company_name}</span>
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map(template => (
              <button
                key={template.id}
                onClick={() => { setSelectedTemplate(template); setStep('generate'); }}
                className={`group relative text-left rounded-xl border p-4 transition-all hover:shadow-md ${
                  selectedTemplate?.id === template.id
                    ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200'
                    : 'border-neutral-200 hover:border-accent-200 hover:bg-accent-50/30'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="h-4 w-4 text-accent-500" />
                    <span className="text-sm font-semibold text-neutral-900">{template.name}</span>
                  </div>
                  {!template.isDefault && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template.id); }}
                      className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-all p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-neutral-500">
                  {template.questions.length} section{template.questions.length !== 1 ? 's' : ''}
                  {template.isDefault && <span className="ml-2 text-xs text-accent-500 bg-accent-50 px-2 py-0.5 rounded-md font-medium">Default</span>}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {template.questions.slice(0, 4).map(q => (
                    <span key={q.id} className="text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-md truncate max-w-[140px]">
                      {q.heading || q.question.slice(0, 25)}
                    </span>
                  ))}
                  {template.questions.length > 4 && (
                    <span className="text-xs bg-neutral-100 text-neutral-400 px-2 py-0.5 rounded-md">
                      +{template.questions.length - 4} more
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {showTemplateBuilder && (
            <TemplateBuilder
              onSave={handleSaveTemplate}
              onCancel={() => setShowTemplateBuilder(false)}
            />
          )}
        </div>
      )}

      {/* ===== STEP 3: Generate ===== */}
      {step === 'generate' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 animate-fade-up">
          <button onClick={() => setStep('template')} className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1 mb-4">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Template
          </button>

          {/* Company badge */}
          <div className="rounded-xl border border-green-200 bg-green-50/30 px-4 py-3 flex items-center gap-2 mb-5">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">{selectedCompany?.company_name}</span>
          </div>

          {/* Report Name */}
          <div className="mb-5">
            <label className="text-xs font-semibold text-neutral-700 mb-2 block">
              Report Name <span className="text-red-500">*</span>
            </label>
            <input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Enter a name for this report"
              className="w-full h-11 px-4 rounded-xl border border-neutral-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400"
            />
          </div>

          {/* Model Selector */}
          <div className="mb-5">
            <label className="text-xs font-semibold text-neutral-700 mb-2 block">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-neutral-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400 bg-white"
            >
              {AVAILABLE_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Template Info */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <LayoutTemplate className="h-4 w-4 text-accent-500" />
              <span className="text-sm font-semibold text-neutral-800">Template: {selectedTemplate?.name}</span>
            </div>
            <p className="text-xs text-neutral-500">
              {selectedTemplate?.questions.length} sections will be generated
            </p>
          </div>

          {/* Generation Progress */}
          {progress && isGenerating && (
            <div className="rounded-xl border border-accent-200 bg-accent-50/50 p-4 mb-5 animate-fade-up">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="h-5 w-5 text-accent-600 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-accent-800">
                    Generating section {progress.currentQuestion} of {progress.totalQuestions}
                  </p>
                  <p className="text-xs text-accent-600 truncate">{progress.currentHeading}</p>
                </div>
                <span className="text-xs font-semibold text-accent-600 tabular-nums">
                  {Math.round((progress.currentQuestion / progress.totalQuestions) * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-accent-100 overflow-hidden">
                <div
                  className="h-full bg-accent-500 rounded-full transition-all duration-700"
                  style={{ width: `${(progress.currentQuestion / progress.totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={!reportName.trim() || isGenerating}
            className="w-full h-12 rounded-xl bg-accent-600 hover:bg-accent-700 text-base font-semibold"
          >
            {isGenerating ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating Report...</>
            ) : (
              <><Sparkles className="h-5 w-5 mr-2" /> Generate Report</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
