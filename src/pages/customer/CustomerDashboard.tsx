import { Link } from 'react-router-dom';
import { FileText, PieChart, TrendingUp, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CardSkeleton } from '@/components/ui/spinner';
import RecommendationBadge from '@/components/RecommendationBadge';
import type { ResearchReport } from '@/types/database';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Investor';

  const { data: recentReports, isLoading } = useQuery({
    queryKey: ['published_reports', 'recent'],
    queryFn: async (): Promise<ResearchReport[]> => {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });

  const { data: portfolioStats } = useQuery({
    queryKey: ['portfolio_stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: portfolios } = await supabase
        .from('customer_portfolios')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      if (!portfolios?.length) return null;

      const { count } = await supabase
        .from('portfolio_holdings')
        .select('*', { count: 'exact', head: true })
        .eq('portfolio_id', portfolios[0].id);

      return { holdingsCount: count || 0 };
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200/80 bg-white px-7 py-5">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Your investment research dashboard
        </p>
      </header>

      <div className="flex-1 overflow-auto bg-[#f8f8f6] p-7">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link
              to="/reports"
              className="group card-premium flex items-center gap-4 p-5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-50 transition-colors group-hover:bg-accent-100">
                <FileText className="h-5 w-5 text-accent-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-neutral-900">Research Reports</p>
                <p className="text-xs text-neutral-500 mt-0.5">Browse equity analysis</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>

            <Link
              to="/portfolio"
              className="group card-premium flex items-center gap-4 p-5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-50 transition-colors group-hover:bg-accent-100">
                <PieChart className="h-5 w-5 text-accent-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-neutral-900">My Portfolio</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {portfolioStats ? `${portfolioStats.holdingsCount} holdings` : 'Track your stocks'}
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>

            <div className="card-premium flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-neutral-900">Market Open</p>
                <p className="text-xs text-neutral-500 mt-0.5">NSE &middot; BSE</p>
              </div>
            </div>
          </div>

          {/* Recent Reports */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-neutral-900">Latest Research</h2>
              <Link to="/reports" className="text-xs font-medium text-accent-600 hover:text-accent-700 transition-colors">
                View all
              </Link>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : recentReports && recentReports.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-content-ready">
                {recentReports.map((report) => (
                  <Link
                    key={report.report_id}
                    to={`/reports/${report.report_id}`}
                    className="group card-premium p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50">
                        <FileText className="h-4 w-4 text-accent-600" />
                      </div>
                      {report.recommendation && (
                        <RecommendationBadge recommendation={report.recommendation} />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700 transition-colors">
                      {report.company_name}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                      {report.nse_symbol}
                    </p>
                    {report.published_at && (
                      <p className="text-[11px] text-neutral-400 mt-2">
                        {new Date(report.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-50">
                  <FileText className="h-6 w-6 text-accent-300" />
                </div>
                <p className="mt-3 text-sm font-medium text-neutral-900">No reports yet</p>
                <p className="mt-1 text-xs text-neutral-500">Research reports will appear here once published.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
