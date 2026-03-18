import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, FileText, Mic, Video, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { CardSkeleton } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import RecommendationBadge from '@/components/RecommendationBadge';
import type { ResearchReport } from '@/types/database';

const PAGE_SIZE = 12;

export default function PublishedReports() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when search changes
  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const { data, isLoading } = useQuery({
    queryKey: ['published_reports', 'list', debouncedSearch, page],
    queryFn: async (): Promise<{ reports: ResearchReport[]; count: number }> => {
      let query = supabase
        .from('research_reports')
        .select('*', { count: 'exact' })
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        query = query.or(`company_name.ilike.${term},nse_symbol.ilike.${term}`);
      }

      const { data: reports, error, count } = await query;
      if (error) throw error;
      return { reports: reports ?? [], count: count ?? 0 };
    },
    staleTime: 60000,
  });

  const reports = data?.reports ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200/80 bg-white px-7 py-5">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Research Reports</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {totalCount} published {totalCount === 1 ? 'report' : 'reports'}
        </p>
      </header>

      <div className="flex-1 overflow-auto bg-[#f8f8f6] p-7">
        <div className="mx-auto max-w-5xl">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search by company name or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-10"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : reports.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-content-ready">
                {reports.map((report) => (
                  <Link
                    key={report.report_id}
                    to={`/reports/${report.report_id}`}
                    className="group card-premium overflow-hidden"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50">
                          <FileText className="h-5 w-5 text-accent-600" />
                        </div>
                        {report.recommendation && (
                          <RecommendationBadge recommendation={report.recommendation} />
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700 transition-colors">
                        {report.company_name}
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                        {report.nse_symbol}
                      </p>

                      {report.target_price && (
                        <p className="text-xs text-neutral-600 mt-2">
                          Target: <span className="font-semibold">₹{report.target_price.toLocaleString('en-IN')}</span>
                        </p>
                      )}
                    </div>

                    <div className="border-t border-neutral-100 px-5 py-3 flex items-center justify-between">
                      <p className="text-[11px] text-neutral-400">
                        {report.published_at
                          ? new Date(report.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </p>
                      <div className="flex items-center gap-2">
                        {report.pdf_file_url && <FileText className="h-3.5 w-3.5 text-neutral-400" />}
                        {report.audio_file_url && <Mic className="h-3.5 w-3.5 text-neutral-400" />}
                        {report.video_file_url && <Video className="h-3.5 w-3.5 text-neutral-400" />}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={cn(
                        'h-8 w-8 rounded-md text-xs font-medium transition-colors',
                        page === i
                          ? 'bg-accent-600 text-white shadow-sm'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
                <FileText className="h-7 w-7 text-accent-300" />
              </div>
              <p className="mt-4 text-sm font-medium text-neutral-900">
                {debouncedSearch ? 'No reports found' : 'No reports published yet'}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {debouncedSearch ? `No results for "${debouncedSearch}"` : 'Check back soon for new research.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
