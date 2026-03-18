import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Download, ExternalLink, Mic, Clapperboard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import RecommendationBadge from '@/components/RecommendationBadge';
import type { ResearchReport } from '@/types/database';

export default function ReportDetail() {
  const { reportId } = useParams<{ reportId: string }>();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['published_reports', 'detail', reportId],
    queryFn: async (): Promise<ResearchReport | null> => {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('report_id', reportId!)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!reportId,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
          <FileText className="h-7 w-7 text-accent-300" />
        </div>
        <p className="mt-4 text-sm font-medium text-neutral-900">Report not found</p>
        <p className="mt-1 text-xs text-neutral-500">This report may not be available.</p>
        <Link to="/reports" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to Reports
          </Button>
        </Link>
      </div>
    );
  }

  const hasPdf = !!report.pdf_file_id;
  const hasAudio = !!report.audio_file_url;
  const hasVideo = !!report.video_file_url;
  const defaultTab = hasPdf ? 'report' : hasAudio ? 'audio' : hasVideo ? 'video' : 'report';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-neutral-200/80 bg-white px-7 py-5">
        <div className="flex items-start justify-between">
          <div>
            <Link
              to="/reports"
              className="inline-flex items-center gap-1.5 text-xs text-accent-600 hover:text-accent-700 transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              All Reports
            </Link>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{report.company_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-neutral-500 font-mono">{report.nse_symbol}</span>
              {report.recommendation && (
                <RecommendationBadge recommendation={report.recommendation} />
              )}
              {report.target_price && (
                <span className="text-sm text-neutral-600">
                  Target: <span className="font-semibold">₹{report.target_price.toLocaleString('en-IN')}</span>
                </span>
              )}
            </div>
          </div>

          {report.published_at && (
            <p className="text-xs text-neutral-400 mt-1">
              Published {new Date(report.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      </header>

      {/* Content Tabs */}
      <div className="flex-1 overflow-auto bg-[#f8f8f6] p-7">
        <div className="mx-auto max-w-5xl">
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-6">
              <TabsTrigger value="report" disabled={!hasPdf}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Report
              </TabsTrigger>
              <TabsTrigger value="audio" disabled={!hasAudio}>
                <Mic className="h-3.5 w-3.5 mr-1.5" />
                Audio Summary
              </TabsTrigger>
              <TabsTrigger value="video" disabled={!hasVideo}>
                <Clapperboard className="h-3.5 w-3.5 mr-1.5" />
                Video Summary
              </TabsTrigger>
            </TabsList>

            {/* PDF Tab */}
            <TabsContent value="report">
              {hasPdf ? (
                <div className="space-y-4">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(report.pdf_file_url!, '_blank')}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open in Drive
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => window.open(`https://drive.google.com/uc?export=download&id=${report.pdf_file_id}`, '_blank')}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download PDF
                    </Button>
                  </div>
                  <div className="rounded-lg border border-neutral-200 overflow-hidden bg-neutral-100" style={{ height: '75vh' }}>
                    <iframe
                      src={`https://drive.google.com/file/d/${report.pdf_file_id}/preview`}
                      className="w-full h-full border-0"
                      title={`${report.company_name} Research Report`}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
                  <p className="text-sm text-neutral-500">PDF not available for this report.</p>
                </div>
              )}
            </TabsContent>

            {/* Audio Tab */}
            <TabsContent value="audio">
              {hasAudio ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-8 max-w-2xl mx-auto">
                  <div className="text-center mb-6">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-50 mb-3">
                      <Mic className="h-7 w-7 text-accent-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-900">Audio Summary</h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      Listen to the AI-narrated research summary
                    </p>
                  </div>
                  <audio controls className="w-full" src={report.audio_file_url!}>
                    Your browser does not support the audio element.
                  </audio>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
                  <p className="text-sm text-neutral-500">Audio summary not available.</p>
                </div>
              )}
            </TabsContent>

            {/* Video Tab */}
            <TabsContent value="video">
              {hasVideo ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-6 max-w-4xl mx-auto">
                  <div className="text-center mb-4">
                    <h3 className="text-sm font-semibold text-neutral-900">Video Summary</h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      Watch the AI-generated video research brief
                    </p>
                  </div>
                  <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                    <video controls className="w-full h-full object-contain" src={report.video_file_url!}>
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
                  <p className="text-sm text-neutral-500">Video summary not available.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
