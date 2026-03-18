import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Upload, Trash2, Search, X, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySearch } from '@/hooks/useCompanySearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Papa from 'papaparse';
import type { MasterCompany } from '@/types/database';

interface Holding {
  id: string;
  portfolio_id: string;
  nse_symbol: string;
  company_name: string | null;
  quantity: number;
  buy_price: number;
  buy_date: string | null;
  created_at: string;
}

interface EnrichedHolding extends Holding {
  current_price: number | null;
  sector: string | null;
  invested: number;
  current_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
}

export default function Portfolio() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCSVOpen, setIsCSVOpen] = useState(false);

  // Add stock form state
  const [tickerSearch, setTickerSearch] = useState('');
  const [debouncedTicker, setDebouncedTicker] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<MasterCompany | null>(null);
  const [isTickerDropdownOpen, setIsTickerDropdownOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState('');
  const tickerRef = useRef<HTMLDivElement>(null);

  // CSV state
  const [csvData, setCsvData] = useState<Array<{ nse_symbol: string; quantity: number; buy_price: number; buy_date?: string }>>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTicker(tickerSearch), 300);
    return () => clearTimeout(t);
  }, [tickerSearch]);

  const { data: tickerResults } = useCompanySearch(debouncedTicker);

  useEffect(() => {
    if (tickerResults && tickerResults.length > 0 && tickerSearch.length >= 2 && !selectedCompany) {
      setIsTickerDropdownOpen(true);
    }
  }, [tickerResults, tickerSearch, selectedCompany]);

  // Close ticker dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tickerRef.current && !tickerRef.current.contains(e.target as Node)) setIsTickerDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Get or create portfolio
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: existing } = await supabase
        .from('customer_portfolios')
        .select('*')
        .eq('user_id', user.id)
        .limit(1);

      if (existing && existing.length > 0) return existing[0];

      const { data: created, error } = await supabase
        .from('customer_portfolios')
        .insert({ user_id: user.id, name: 'My Portfolio' })
        .select()
        .single();
      if (error) throw error;
      return created;
    },
    enabled: !!user?.id,
  });

  // Fetch holdings enriched with current prices
  const { data: enrichedHoldings, isLoading: holdingsLoading } = useQuery({
    queryKey: ['holdings_enriched', portfolio?.id],
    queryFn: async (): Promise<EnrichedHolding[]> => {
      if (!portfolio?.id) return [];

      const { data: holdings, error } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!holdings?.length) return [];

      // Batch fetch current prices
      const symbols = [...new Set(holdings.map((h: Holding) => h.nse_symbol))];
      const { data: universe } = await supabase
        .from('equity_universe')
        .select('nse_code, current_price, sector')
        .in('nse_code', symbols);

      const priceMap = new Map((universe || []).map((u: { nse_code: string; current_price: number | null; sector: string | null }) => [u.nse_code, u]));

      return holdings.map((h: Holding): EnrichedHolding => {
        const uData = priceMap.get(h.nse_symbol);
        const currentPrice = uData?.current_price ?? null;
        const invested = h.quantity * h.buy_price;
        const currentValue = currentPrice != null ? h.quantity * currentPrice : null;
        const pnl = currentValue != null ? currentValue - invested : null;
        const pnlPct = pnl != null && invested > 0 ? (pnl / invested) * 100 : null;
        return {
          ...h,
          current_price: currentPrice,
          sector: uData?.sector ?? null,
          invested,
          current_value: currentValue,
          pnl,
          pnl_pct: pnlPct,
        };
      });
    },
    enabled: !!portfolio?.id,
    staleTime: 30000,
  });

  // Summary calculations
  const totalInvested = enrichedHoldings?.reduce((sum, h) => sum + h.invested, 0) ?? 0;
  const totalCurrent = enrichedHoldings?.reduce((sum, h) => sum + (h.current_value ?? h.invested), 0) ?? 0;
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Add holding mutation
  const addHolding = useMutation({
    mutationFn: async (input: { nse_symbol: string; company_name: string; quantity: number; buy_price: number; buy_date?: string }) => {
      const { error } = await supabase.from('portfolio_holdings').insert({
        portfolio_id: portfolio!.id,
        nse_symbol: input.nse_symbol,
        company_name: input.company_name,
        quantity: input.quantity,
        buy_price: input.buy_price,
        buy_date: input.buy_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings_enriched', portfolio?.id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio_stats'] });
      toast.success('Stock added to portfolio');
      setIsAddOpen(false);
      setSelectedCompany(null);
      setTickerSearch('');
      setQty('');
      setBuyPrice('');
      setBuyDate('');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add stock'),
  });

  // Delete holding mutation
  const deleteHolding = useMutation({
    mutationFn: async (holdingId: string) => {
      const { error } = await supabase.from('portfolio_holdings').delete().eq('id', holdingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings_enriched', portfolio?.id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio_stats'] });
      toast.success('Stock removed');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove'),
  });

  // Bulk add mutation
  const bulkAdd = useMutation({
    mutationFn: async (rows: Array<{ nse_symbol: string; quantity: number; buy_price: number; buy_date?: string }>) => {
      const inserts = rows.map((r) => ({
        portfolio_id: portfolio!.id,
        nse_symbol: r.nse_symbol.toUpperCase(),
        company_name: r.nse_symbol.toUpperCase(),
        quantity: r.quantity,
        buy_price: r.buy_price,
        buy_date: r.buy_date || null,
      }));
      const { error } = await supabase.from('portfolio_holdings').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings_enriched', portfolio?.id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio_stats'] });
      toast.success(`${csvData.length} stocks imported`);
      setIsCSVOpen(false);
      setCsvData([]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Import failed'),
  });

  const handleAddSubmit = useCallback(() => {
    if (!selectedCompany || !qty || !buyPrice) {
      toast.error('Please fill in all required fields');
      return;
    }
    addHolding.mutate({
      nse_symbol: selectedCompany.nse_symbol || '',
      company_name: selectedCompany.company_name,
      quantity: parseFloat(qty),
      buy_price: parseFloat(buyPrice),
      buy_date: buyDate || undefined,
    });
  }, [selectedCompany, qty, buyPrice, buyDate, addHolding]);

  const handleCSVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = (results.data as Array<Record<string, string>>)
          .filter((row) => row.nse_symbol && row.quantity && row.buy_price)
          .map((row) => ({
            nse_symbol: row.nse_symbol.toUpperCase().trim(),
            quantity: parseFloat(row.quantity),
            buy_price: parseFloat(row.buy_price),
            buy_date: row.buy_date || undefined,
          }))
          .filter((row) => row.quantity > 0 && row.buy_price > 0);

        if (parsed.length === 0) {
          toast.error('No valid rows found. Required columns: nse_symbol, quantity, buy_price');
          return;
        }
        setCsvData(parsed);
      },
      error: () => toast.error('Failed to parse CSV'),
    });
  }, []);

  const formatCurrency = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200/80 bg-white px-7 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">My Portfolio</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              {enrichedHoldings?.length || 0} holdings
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCSVOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Stock
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-[#f8f8f6] p-7">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Summary Cards */}
          {enrichedHoldings && enrichedHoldings.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="card-premium p-4">
                <p className="text-xs text-neutral-500">Invested</p>
                <p className="text-lg font-semibold text-neutral-900 mt-1">{formatCurrency(totalInvested)}</p>
              </div>
              <div className="card-premium p-4">
                <p className="text-xs text-neutral-500">Current Value</p>
                <p className="text-lg font-semibold text-neutral-900 mt-1">{formatCurrency(totalCurrent)}</p>
              </div>
              <div className="card-premium p-4">
                <p className="text-xs text-neutral-500">Total P&L</p>
                <p className={cn('text-lg font-semibold mt-1', totalPnl >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
                </p>
              </div>
              <div className="card-premium p-4">
                <p className="text-xs text-neutral-500">Returns</p>
                <div className={cn('flex items-center gap-1.5 mt-1', totalPnlPct >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {totalPnlPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <span className="text-lg font-semibold">{totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Holdings Table */}
          {holdingsLoading ? (
            <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white">
              <TableSkeleton rows={6} cols={7} />
            </div>
          ) : enrichedHoldings && enrichedHoldings.length > 0 ? (
            <div className="rounded-xl border border-neutral-200/60 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50/80">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Company</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Qty</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Buy Price</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-neutral-500">CMP</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Value</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-neutral-500">P&L</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedHoldings.map((h) => (
                      <tr key={h.id} className="border-b border-neutral-100 hover:bg-accent-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/stock/${h.nse_symbol}`} className="group">
                            <p className="text-sm font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors">
                              {h.company_name || h.nse_symbol}
                            </p>
                            <p className="text-xs text-neutral-500 font-mono">{h.nse_symbol}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-neutral-700 font-mono">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-sm text-neutral-700">₹{h.buy_price.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right text-sm text-neutral-700">
                          {h.current_price != null ? `₹${h.current_price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-neutral-900">
                          {h.current_value != null ? formatCurrency(h.current_value) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {h.pnl != null ? (
                            <div>
                              <p className={cn('text-sm font-medium', h.pnl >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                                {h.pnl >= 0 ? '+' : ''}{formatCurrency(h.pnl)}
                              </p>
                              <p className={cn('text-[11px]', h.pnl_pct != null && h.pnl_pct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                                {h.pnl_pct != null ? `${h.pnl_pct >= 0 ? '+' : ''}${h.pnl_pct.toFixed(2)}%` : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-neutral-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm(`Remove ${h.company_name || h.nse_symbol} from portfolio?`)) {
                                deleteHolding.mutate(h.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
                <PieChart className="h-7 w-7 text-accent-300" />
              </div>
              <p className="mt-4 text-sm font-medium text-neutral-900">No holdings yet</p>
              <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
                Add stocks to your portfolio to track your investments. Use the "Add Stock" button or import a CSV.
              </p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsCSVOpen(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import CSV
                </Button>
                <Button size="sm" onClick={() => setIsAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Stock
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Stock Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stock</DialogTitle>
            <DialogDescription>Search for a stock and enter your purchase details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div ref={tickerRef}>
              <Label>Stock Ticker</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                <Input
                  placeholder="e.g., RELIANCE, TCS"
                  value={selectedCompany ? `${selectedCompany.nse_symbol} — ${selectedCompany.company_name}` : tickerSearch}
                  onChange={(e) => {
                    setTickerSearch(e.target.value.toUpperCase());
                    if (selectedCompany) setSelectedCompany(null);
                  }}
                  className="pl-9 pr-8 font-mono text-sm uppercase"
                />
                {selectedCompany && (
                  <button onClick={() => { setSelectedCompany(null); setTickerSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {isTickerDropdownOpen && tickerResults && tickerResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg overflow-hidden">
                    <ul className="max-h-48 overflow-y-auto py-1">
                      {tickerResults.map((c) => (
                        <li key={c.company_id}>
                          <button
                            onClick={() => { setSelectedCompany(c); setIsTickerDropdownOpen(false); setTickerSearch(''); }}
                            className="w-full px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                          >
                            <p className="text-sm font-medium text-neutral-900">{c.company_name}</p>
                            <p className="text-xs text-neutral-500 font-mono">{c.nse_symbol}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" placeholder="100" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1.5" min="0" step="1" />
              </div>
              <div>
                <Label>Buy Price (₹)</Label>
                <Input type="number" placeholder="1500" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="mt-1.5" min="0" step="0.01" />
              </div>
            </div>
            <div>
              <Label>Buy Date (optional)</Label>
              <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSubmit} disabled={!selectedCompany || !qty || !buyPrice || addHolding.isPending} className="min-w-[145px]">
              {addHolding.isPending ? 'Adding...' : 'Add to Portfolio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={isCSVOpen} onOpenChange={setIsCSVOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns: nse_symbol, quantity, buy_price, buy_date (optional)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input type="file" accept=".csv" onChange={handleCSVUpload} />
            {csvData.length > 0 && (
              <div className="rounded-lg border border-neutral-200 overflow-hidden">
                <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200">
                  <p className="text-xs font-medium text-neutral-600">{csvData.length} stocks parsed</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-100">
                        <th className="px-3 py-2 text-left font-medium text-neutral-500">Symbol</th>
                        <th className="px-3 py-2 text-right font-medium text-neutral-500">Qty</th>
                        <th className="px-3 py-2 text-right font-medium text-neutral-500">Buy Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b border-neutral-50">
                          <td className="px-3 py-1.5 font-mono">{row.nse_symbol}</td>
                          <td className="px-3 py-1.5 text-right">{row.quantity}</td>
                          <td className="px-3 py-1.5 text-right">₹{row.buy_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCSVOpen(false); setCsvData([]); }}>Cancel</Button>
            <Button onClick={() => bulkAdd.mutate(csvData)} disabled={csvData.length === 0 || bulkAdd.isPending} className="min-w-[170px]">
              {bulkAdd.isPending ? 'Importing...' : `Import ${csvData.length} Stocks`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
