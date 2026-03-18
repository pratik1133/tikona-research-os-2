import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import RecommendationBadge from '@/components/RecommendationBadge';
import TradingViewChart from '@/components/TradingViewChart';
import type { ResearchReport } from '@/types/database';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function fmt(v: number | null, suffix = ''): string {
  if (v == null) return '—';
  return `${v.toFixed(2)}${suffix}`;
}
function fmtCr(v: number | null): string {
  if (v == null) return '—';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function StockDetail() {
  const { nseSymbol } = useParams<{ nseSymbol: string }>();

  const { data: stock, isLoading } = useQuery({
    queryKey: ['stock_detail', nseSymbol],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equity_universe')
        .select('*')
        .eq('nse_code', nseSymbol!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!nseSymbol,
  });

  const { data: relatedReports } = useQuery({
    queryKey: ['stock_reports', nseSymbol],
    queryFn: async (): Promise<ResearchReport[]> => {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('is_published', true)
        .eq('nse_symbol', nseSymbol!)
        .order('published_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!nseSymbol,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <Link
          to="/portfolio"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Portfolio
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">
              {stock?.company_name || nseSymbol}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-neutral-500 font-mono">NSE: {nseSymbol}</span>
              {stock?.sector && (
                <span className="bg-neutral-100 px-2 py-0.5 rounded text-xs text-neutral-600">
                  {stock.sector}
                </span>
              )}
            </div>
          </div>
          {stock?.current_price != null && (
            <div className="text-right">
              <p className="text-xl font-semibold text-neutral-900">
                ₹{stock.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
              {stock.return_down_from_52w_high != null && (
                <p className={cn('text-xs mt-0.5', stock.return_down_from_52w_high <= -20 ? 'text-red-600' : 'text-neutral-500')}>
                  {stock.return_down_from_52w_high.toFixed(1)}% from 52W high
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Stock Chart */}
          {nseSymbol && (
            <TradingViewChart symbol={nseSymbol} height={480} />
          )}

          {/* Key Metrics */}
          {stock && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 mb-3">Key Metrics</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                <MetricCard label="Market Cap" value={fmtCr(stock.market_cap)} />
                <MetricCard label="P/E (TTM)" value={fmt(stock.pe_ttm, 'x')} />
                <MetricCard label="EV/EBITDA" value={fmt(stock.ev_ebitda_ttm, 'x')} />
                <MetricCard label="52W High" value={stock.high_52_week != null ? `₹${stock.high_52_week.toLocaleString('en-IN')}` : '—'} />
                <MetricCard label="52W Low" value={stock.low_52_week != null ? `₹${stock.low_52_week.toLocaleString('en-IN')}` : '—'} />
                <MetricCard label="ROE" value={fmt(stock.roe, '%')} />
                <MetricCard label="ROCE" value={fmt(stock.roce, '%')} />
                <MetricCard label="EBITDA Margin" value={fmt(stock.ebitda_margin_ttm, '%')} />
                <MetricCard label="PAT Margin" value={fmt(stock.pat_margin_ttm, '%')} />
                <MetricCard label="Debt" value={fmtCr(stock.debt)} />
                <MetricCard label="Promoter Hold" value={fmt(stock.promoter_holding_pct, '%')} />
                <MetricCard label="Book Value" value={fmt(stock.book_value)} />
                <MetricCard label="EPS (TTM)" value={fmt(stock.eps_ttm)} />
                <MetricCard label="Dividend Yield" value={fmt(stock.dividend_yield, '%')} />
                <MetricCard label="Consensus Target" value={stock.consensus_target_price != null ? `₹${stock.consensus_target_price.toLocaleString('en-IN')}` : '—'} />
              </div>
            </div>
          )}

          {!stock && (
            <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
              <p className="text-sm text-neutral-500">
                No financial data available for {nseSymbol}. The stock chart is shown above.
              </p>
            </div>
          )}

          {/* Related Research Reports */}
          {relatedReports && relatedReports.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 mb-3">Research Reports</h2>
              <div className="space-y-2">
                {relatedReports.map((report) => (
                  <Link
                    key={report.report_id}
                    to={`/reports/${report.report_id}`}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3">
                      {report.recommendation && (
                        <RecommendationBadge recommendation={report.recommendation} />
                      )}
                      <span className="text-sm font-medium text-neutral-900">{report.company_name}</span>
                      {report.target_price && (
                        <span className="text-xs text-neutral-500">Target: ₹{report.target_price.toLocaleString('en-IN')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-400">
                        {report.published_at
                          ? new Date(report.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : ''}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
