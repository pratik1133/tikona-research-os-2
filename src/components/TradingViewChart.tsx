import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, AreaSeries, type IChartApi, type ISeriesApi, ColorType, LineType, type AreaStyleOptions, type DeepPartial } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

const N8N_BASE_URL = 'https://n8n.tikonacapital.com';

interface StockChartProps {
  symbol: string;
  height?: number;
}

interface ChartDataPoint {
  time: string; // YYYY-MM-DD
  value: number;
}

type RangeKey = '1M' | '3M' | '6M' | '1Y' | '5Y';

const RANGES: { key: RangeKey; label: string; yahoo: string; interval: string }[] = [
  { key: '1M', label: '1M', yahoo: '1mo', interval: '1d' },
  { key: '3M', label: '3M', yahoo: '3mo', interval: '1d' },
  { key: '6M', label: '6M', yahoo: '6mo', interval: '1d' },
  { key: '1Y', label: '1Y', yahoo: '1y', interval: '1d' },
  { key: '5Y', label: '5Y', yahoo: '5y', interval: '1wk' },
];

export default function TradingViewChart({ symbol, height = 480 }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);

  const [activeRange, setActiveRange] = useState<RangeKey>('1Y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceInfo, setPriceInfo] = useState<{
    current: number;
    change: number;
    changePct: number;
  } | null>(null);

  const fetchChartData = useCallback(async (range: RangeKey): Promise<ChartDataPoint[]> => {
    const rangeConfig = RANGES.find((r) => r.key === range)!;
    const yahooSymbol = `${symbol}.NS`;

    console.log(`[StockChart] Fetching ${yahooSymbol} range=${rangeConfig.yahoo}`);

    let res: Response;
    try {
      res = await fetch(`${N8N_BASE_URL}/webhook/stock-chart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: yahooSymbol,
          range: rangeConfig.yahoo,
          interval: rangeConfig.interval,
        }),
      });
    } catch (networkErr) {
      console.error('[StockChart] Network error (CORS or n8n down):', networkErr);
      throw new Error('Cannot reach n8n. Check that the workflow is Active and n8n is running.');
    }

    const rawText = await res.text();
    console.log('[StockChart] HTTP status:', res.status);
    console.log('[StockChart] Raw response (first 500 chars):', rawText.slice(0, 500));

    if (!res.ok) {
      throw new Error(`n8n returned HTTP ${res.status}. Check n8n execution logs.`);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.error('[StockChart] Response is not JSON:', rawText.slice(0, 200));
      throw new Error('n8n returned non-JSON. Yahoo Finance may have blocked the request — add a User-Agent header in the HTTP Request node.');
    }

    console.log('[StockChart] Parsed JSON keys:', Object.keys(json as object));

    // n8n wraps the Yahoo Finance response inside its output structure.
    // Try multiple shapes: direct, wrapped in array, nested under chart/result
    const j = json as Record<string, unknown>;

    // Shape 1: Yahoo Finance direct  →  { chart: { result: [{ timestamp, indicators }] } }
    // Shape 2: n8n array wrap        →  [{ chart: { result: [...] } }]
    // Shape 3: n8n flattens          →  { timestamp: [...], indicators: {...} }
    let yahooPayload: Record<string, unknown> = j;

    if (Array.isArray(json) && json.length > 0) {
      yahooPayload = (json[0] as Record<string, unknown>);
      console.log('[StockChart] Unwrapped n8n array. Keys:', Object.keys(yahooPayload));
    }

    // Now extract result
    const chart = yahooPayload.chart as Record<string, unknown> | undefined;
    const resultArr = (chart?.result ?? yahooPayload.result) as unknown[] | undefined;
    const result = (resultArr?.[0] ?? yahooPayload) as Record<string, unknown>;

    console.log('[StockChart] result keys:', Object.keys(result));

    const timestamps = (result.timestamp as number[] | undefined) ?? [];
    const quote = (result.indicators as Record<string, unknown> | undefined)
      ?.quote as Record<string, unknown>[] | undefined;
    const closes = (quote?.[0]?.close as (number | null)[]) ?? [];

    console.log(`[StockChart] Got ${timestamps.length} timestamps, ${closes.length} closes`);

    if (timestamps.length === 0) {
      const errMsg = (chart?.error as Record<string, unknown> | null)?.description;
      throw new Error(
        errMsg
          ? `Yahoo Finance error: ${errMsg}`
          : 'No price data returned. The symbol may be wrong or Yahoo is throttling.'
      );
    }

    const points: ChartDataPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null || isNaN(close)) continue;
      const date = new Date(timestamps[i] * 1000);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      points.push({ time: `${yyyy}-${mm}-${dd}`, value: close });
    }

    if (points.length === 0) throw new Error('All price values were null for this period.');

    console.log(`[StockChart] Parsed ${points.length} data points. First: ${points[0].time} Last: ${points[points.length - 1].time}`);

    return points;
  }, [symbol]);

  // Create the chart instance once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#71717a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f5f5f5' },
        horzLines: { color: '#f5f5f5' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height - 52,
      rightPriceScale: {
        borderColor: '#e5e5e5',
      },
      timeScale: {
        borderColor: '#e5e5e5',
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: '#d4d4d8', width: 1, style: 3, labelBackgroundColor: '#18181b' },
        horzLine: { color: '#d4d4d8', width: 1, style: 3, labelBackgroundColor: '#18181b' },
      },
      handleScroll: { vertTouchDrag: false },
    });

    const areaOptions: DeepPartial<AreaStyleOptions> = {
      lineColor: '#18181b',
      topColor: 'rgba(24, 24, 27, 0.12)',
      bottomColor: 'rgba(24, 24, 27, 0.01)',
      lineWidth: 2,
      lineType: LineType.Curved,
    };

    const series = chart.addSeries(AreaSeries, {
      ...areaOptions,
      priceFormat: {
        type: 'price' as const,
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Fetch data when range or symbol changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchChartData(activeRange);
        if (cancelled) return;

        if (seriesRef.current) {
          seriesRef.current.setData(data);
        }
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }

        // Calculate price info
        if (data.length >= 2) {
          const current = data[data.length - 1].value;
          const first = data[0].value;
          const change = current - first;
          const changePct = (change / first) * 100;
          setPriceInfo({ current, change, changePct });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chart');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeRange, fetchChartData]);

  const googleFinanceUrl = `https://www.google.com/finance/quote/${symbol}:NSE`;

  return (
    <div className="w-full rounded-lg overflow-hidden border border-neutral-200 bg-white">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
        <div className="flex items-center gap-3">
          {/* Period tabs */}
          <div className="flex items-center gap-0.5 rounded-lg bg-neutral-50 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setActiveRange(r.key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeRange === r.key
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Price change badge */}
          {priceInfo && !loading && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-neutral-900">
                ₹{priceInfo.current.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span
                className={cn(
                  'font-medium',
                  priceInfo.change >= 0 ? 'text-emerald-600' : 'text-red-600'
                )}
              >
                {priceInfo.change >= 0 ? '+' : ''}
                {priceInfo.change.toFixed(2)} ({priceInfo.changePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        <a
          href={googleFinanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Google Finance
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height: `${height - 52}px` }}>
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <Spinner size="md" />
          </div>
        )}

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center px-8 max-w-sm mx-auto">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50 mb-3">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="text-sm font-medium text-neutral-800 mb-1">Chart failed to load</p>
              <p className="text-xs text-neutral-500 mb-4">{error}</p>
              <p className="text-[11px] text-neutral-400 mb-4">
                Check browser DevTools → Console for details
              </p>
              <a
                href={googleFinanceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                View on Google Finance
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
