import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
  Server,
  GitBranch,
  BarChart3,
  FileText,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

// All VPS traffic goes through Vercel proxy rewrites to avoid CORS
const N8N_BASE = '/proxy/n8n';
const N8N_API_KEY = import.meta.env.VITE_N8N_API_KEY || '';
const PPT_SERVICE_URL = '/proxy/ppt';
const FINANCIAL_MODEL_URL = '/proxy/fm';

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = 'checking' | 'healthy' | 'degraded' | 'down';

interface ServiceHealth {
  status: ServiceStatus;
  latencyMs: number | null;
  details: Record<string, unknown>;
  lastChecked: Date | null;
  error?: string;
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
  tags?: { id: string; name: string }[];
}

interface N8nExecution {
  id: string;
  workflowId: string;
  workflowName?: string;
  mode: string;
  status: 'success' | 'error' | 'waiting' | 'running' | 'canceled';
  startedAt: string;
  stoppedAt?: string;
  finished: boolean;
}

interface PipelineStats {
  total: number;
  byStatus: Record<string, number>;
  last7Days: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: ServiceStatus) {
  switch (s) {
    case 'healthy':  return 'bg-green-500';
    case 'degraded': return 'bg-amber-500';
    case 'down':     return 'bg-red-500';
    default:         return 'bg-neutral-300 animate-pulse';
  }
}

function statusText(s: ServiceStatus) {
  switch (s) {
    case 'healthy':  return 'Healthy';
    case 'degraded': return 'Degraded';
    case 'down':     return 'Down';
    default:         return 'Checking…';
  }
}

function statusTextColor(s: ServiceStatus) {
  switch (s) {
    case 'healthy':  return 'text-green-700';
    case 'degraded': return 'text-amber-700';
    case 'down':     return 'text-red-700';
    default:         return 'text-neutral-500';
  }
}

function execStatusColor(s: N8nExecution['status']) {
  switch (s) {
    case 'success':  return 'bg-green-100 text-green-700';
    case 'error':    return 'bg-red-100 text-red-700';
    case 'running':  return 'bg-accent-100 text-accent-700';
    case 'waiting':  return 'bg-amber-100 text-amber-700';
    case 'canceled': return 'bg-neutral-100 text-neutral-500';
    default:         return 'bg-neutral-100 text-neutral-500';
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function duration(start: string, stop?: string) {
  const ms = new Date(stop || Date.now()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function checkService(url: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { status: 'degraded', latencyMs, details: {}, lastChecked: new Date(), error: `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { status: 'healthy', latencyMs, details: data, lastChecked: new Date() };
  } catch (e) {
    return {
      status: 'down',
      latencyMs: null,
      details: {},
      lastChecked: new Date(),
      error: e instanceof Error ? e.message : 'Unreachable',
    };
  }
}

async function fetchN8nWorkflows(): Promise<N8nWorkflow[]> {
  if (!N8N_API_KEY) return [];
  try {
    const res = await fetch(`${N8N_BASE}/api/v1/workflows?limit=50`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchN8nExecutions(): Promise<N8nExecution[]> {
  if (!N8N_API_KEY) return [];
  try {
    const res = await fetch(`${N8N_BASE}/api/v1/executions?limit=20&includeData=false`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      workflowId: (e.workflowData as Record<string, unknown>)?.id ?? '',
      workflowName: (e.workflowData as Record<string, unknown>)?.name ?? 'Unknown',
      mode: e.mode,
      status: e.status ?? (e.finished ? 'success' : 'running'),
      startedAt: e.startedAt,
      stoppedAt: e.stoppedAt,
      finished: e.finished,
    }));
  } catch {
    return [];
  }
}

async function fetchPipelineStats(): Promise<PipelineStats> {
  try {
    const { data, error } = await supabase
      .from('research_sessions')
      .select('status, created_at');
    if (error || !data) return { total: 0, byStatus: {}, last7Days: 0 };
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const byStatus: Record<string, number> = {};
    let last7Days = 0;
    for (const row of data) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (new Date(row.created_at) > sevenDaysAgo) last7Days++;
    }
    return { total: data.length, byStatus, last7Days };
  } catch {
    return { total: 0, byStatus: {}, last7Days: 0 };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ServiceCard({
  label,
  icon: Icon,
  url,
  health,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
  health: ServiceHealth;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center">
            <Icon className="h-4 w-4 text-neutral-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{label}</p>
            <p className="text-xs text-neutral-400 font-mono truncate max-w-[180px]">{url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${statusColor(health.status)}`} />
          <span className={`text-xs font-semibold ${statusTextColor(health.status)}`}>
            {statusText(health.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-neutral-50 px-3 py-2">
          <p className="text-xs text-neutral-400 mb-1">Latency</p>
          <p className="text-sm font-semibold text-neutral-900 tabular-nums">
            {health.latencyMs !== null ? `${health.latencyMs}ms` : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 px-3 py-2">
          <p className="text-xs text-neutral-400 mb-1">Last checked</p>
          <p className="text-sm font-semibold text-neutral-900">
            {health.lastChecked ? relativeTime(health.lastChecked.toISOString()) : '—'}
          </p>
        </div>
      </div>

      {health.error && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 font-mono">
          {health.error}
        </p>
      )}

      {/* Extra health details from /health endpoint */}
      {health.status === 'healthy' && Object.keys(health.details).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(health.details)
            .filter(([k]) => !['status', 'ok'].includes(k))
            .slice(0, 4)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-neutral-400">{k}</span>
                <span className="text-neutral-700 font-mono">{String(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function WorkflowRow({ wf }: { wf: N8nWorkflow }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-2 w-2 rounded-full shrink-0 ${wf.active ? 'bg-green-500' : 'bg-neutral-300'}`} />
        <span className="text-sm text-neutral-900 truncate">{wf.name}</span>
        {wf.tags?.map(t => (
          <span key={t.id} className="text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-md font-medium shrink-0">
            {t.name}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <span className="text-xs text-neutral-400">{relativeTime(wf.updatedAt)}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
          wf.active ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'
        }`}>
          {wf.active ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {wf.active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

function ExecutionRow({ ex }: { ex: N8nExecution }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md shrink-0 ${execStatusColor(ex.status)}`}>
          {ex.status}
        </span>
        <span className="text-sm text-neutral-900 truncate">{ex.workflowName ?? 'Unknown workflow'}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-4 text-xs text-neutral-400">
        <span className="font-mono">{duration(ex.startedAt, ex.stoppedAt)}</span>
        <span>{relativeTime(ex.startedAt)}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemHealth() {
  const hasN8nKey = !!N8N_API_KEY;

  // Service health state
  const [pptHealth, setPptHealth] = useState<ServiceHealth>({ status: 'checking', latencyMs: null, details: {}, lastChecked: null });
  const [fmHealth, setFmHealth] = useState<ServiceHealth>({ status: 'checking', latencyMs: null, details: {}, lastChecked: null });
  const [n8nHealth, setN8nHealth] = useState<ServiceHealth>({ status: 'checking', latencyMs: null, details: {}, lastChecked: null });

  // n8n data
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [n8nLoading, setN8nLoading] = useState(false);
  const [showAllWorkflows, setShowAllWorkflows] = useState(false);

  // Pipeline stats
  const [pipelineStats, setPipelineStats] = useState<PipelineStats | null>(null);

  // Global state
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkServices = useCallback(async () => {
    // Reset to checking
    setPptHealth(h => ({ ...h, status: 'checking' }));
    setFmHealth(h => ({ ...h, status: 'checking' }));
    setN8nHealth(h => ({ ...h, status: 'checking' }));

    // Fire all checks in parallel
    const [ppt, fm, n8n] = await Promise.all([
      checkService(`${PPT_SERVICE_URL}/health`),
      checkService(`${FINANCIAL_MODEL_URL}/health`),
      checkService(`${N8N_BASE}/healthz`),
    ]);

    setPptHealth(ppt);
    setFmHealth(fm);
    setN8nHealth(n8n);
  }, []);

  const loadN8nData = useCallback(async () => {
    if (!hasN8nKey) return;
    setN8nLoading(true);
    const [wfs, exs] = await Promise.all([fetchN8nWorkflows(), fetchN8nExecutions()]);
    setWorkflows(wfs);
    setExecutions(exs);
    setN8nLoading(false);
  }, [hasN8nKey]);

  const loadPipelineStats = useCallback(async () => {
    const stats = await fetchPipelineStats();
    setPipelineStats(stats);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([checkServices(), loadN8nData(), loadPipelineStats()]);
    setLastRefresh(new Date());
    setRefreshing(false);
  }, [checkServices, loadN8nData, loadPipelineStats]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => refresh(), 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  const allServices = [
    { label: 'PPT Generation Service', icon: FileText, url: '72.61.226.16:8501', health: pptHealth },
    { label: 'Financial Model Server', icon: BarChart3, url: '72.61.226.16:8500', health: fmHealth },
    { label: 'n8n Automation',         icon: GitBranch, url: '72.61.226.16:5678', health: n8nHealth },
  ];

  const healthyCount = allServices.filter(s => s.health.status === 'healthy').length;
  const overallStatus: ServiceStatus =
    healthyCount === allServices.length ? 'healthy' :
    healthyCount === 0 ? 'down' : 'degraded';

  const activeWorkflows = workflows.filter(w => w.active).length;
  const visibleWorkflows = showAllWorkflows ? workflows : workflows.slice(0, 8);

  const successRate = executions.length
    ? Math.round((executions.filter(e => e.status === 'success').length / executions.length) * 100)
    : null;

  return (
    <div className="flex-1 overflow-auto bg-canvas p-7">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">System Health</h1>
          <p className="text-sm text-neutral-500 mt-1">
            VPS services and n8n workflow status
            {lastRefresh && (
              <span className="ml-2 text-neutral-400">
                · Last updated {relativeTime(lastRefresh.toISOString())}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall status banner */}
      <div className={`mb-6 rounded-xl border px-5 py-4 flex items-center gap-4 ${
        overallStatus === 'healthy' ? 'bg-green-50 border-green-200' :
        overallStatus === 'degraded' ? 'bg-amber-50 border-amber-200' :
        overallStatus === 'down' ? 'bg-red-50 border-red-200' :
        'bg-neutral-50 border-neutral-200'
      }`}>
        {overallStatus === 'healthy' && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
        {overallStatus === 'degraded' && <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />}
        {overallStatus === 'down' && <XCircle className="h-5 w-5 text-red-600 shrink-0" />}
        {overallStatus === 'checking' && <Activity className="h-5 w-5 text-neutral-400 shrink-0 animate-pulse" />}
        <div>
          <p className={`text-sm font-semibold ${
            overallStatus === 'healthy' ? 'text-green-800' :
            overallStatus === 'degraded' ? 'text-amber-800' :
            overallStatus === 'down' ? 'text-red-800' : 'text-neutral-600'
          }`}>
            {overallStatus === 'healthy' && `All ${allServices.length} services operational`}
            {overallStatus === 'degraded' && `${healthyCount} of ${allServices.length} services healthy`}
            {overallStatus === 'down' && 'All services unreachable'}
            {overallStatus === 'checking' && 'Checking services…'}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">Auto-refreshes every 60 seconds</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Services Up',
            value: overallStatus === 'checking' ? '—' : `${healthyCount}/${allServices.length}`,
            icon: Server,
            color: 'text-green-600',
            bg: 'bg-green-50',
          },
          {
            label: 'Active Workflows',
            value: hasN8nKey ? (n8nLoading ? '…' : String(activeWorkflows)) : 'No key',
            icon: Play,
            color: 'text-accent-600',
            bg: 'bg-accent-50',
          },
          {
            label: 'Exec Success Rate',
            value: hasN8nKey ? (successRate !== null ? `${successRate}%` : '—') : 'No key',
            icon: Zap,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Pipeline (7d)',
            value: pipelineStats ? String(pipelineStats.last7Days) : '…',
            icon: BarChart3,
            color: 'text-neutral-600',
            bg: 'bg-neutral-50',
          },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xs text-neutral-400">{s.label}</p>
              <p className="text-xl font-bold text-neutral-900 tabular-nums">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Service health cards */}
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">VPS Services</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {allServices.map(s => (
          <ServiceCard key={s.label} {...s} />
        ))}
      </div>

      {/* Pipeline stats from Supabase */}
      {pipelineStats && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">Research Pipeline</h2>
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Session Overview</p>
                <p className="text-xs text-neutral-400">{pipelineStats.total} total sessions in Supabase</p>
              </div>
              <span className="text-xs text-neutral-400 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {pipelineStats.last7Days} in last 7 days
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(pipelineStats.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-100">
                  <div className={`h-2 w-2 rounded-full ${
                    status === 'completed' ? 'bg-green-500' :
                    status === 'document_review' ? 'bg-amber-500' :
                    'bg-neutral-400'
                  }`} />
                  <span className="text-xs text-neutral-600 capitalize">{status.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-bold text-neutral-900 tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* n8n section */}
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">n8n Automation</h2>

      {!hasN8nKey ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-8">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-amber-800">n8n API key not configured</p>
          <p className="text-xs text-amber-700 mt-1 max-w-sm mx-auto">
            Add <code className="bg-amber-100 px-1 rounded font-mono">VITE_N8N_API_KEY</code> to your <code className="bg-amber-100 px-1 rounded font-mono">.env</code> file to see workflow status and execution history.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* Workflows list */}
          <div className="bg-white rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Workflows</p>
                <p className="text-xs text-neutral-400">
                  {n8nLoading ? 'Loading…' : `${activeWorkflows} active · ${workflows.length - activeWorkflows} inactive`}
                </p>
              </div>
              {workflows.length > 0 && (
                <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-md font-semibold">
                  {workflows.length} total
                </span>
              )}
            </div>
            <div className="px-5">
              {n8nLoading ? (
                <div className="py-8 text-center text-sm text-neutral-400">Loading workflows…</div>
              ) : workflows.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-400">No workflows found</div>
              ) : (
                <>
                  {visibleWorkflows.map(wf => <WorkflowRow key={wf.id} wf={wf} />)}
                  {workflows.length > 8 && (
                    <button
                      onClick={() => setShowAllWorkflows(v => !v)}
                      className="w-full py-3 text-xs text-accent-600 font-medium flex items-center justify-center gap-1 hover:text-accent-700"
                    >
                      {showAllWorkflows
                        ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                        : <><ChevronDown className="h-3.5 w-3.5" /> Show {workflows.length - 8} more</>
                      }
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Recent executions */}
          <div className="bg-white rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Recent Executions</p>
                <p className="text-xs text-neutral-400">Last 20 runs across all workflows</p>
              </div>
              {successRate !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                  successRate >= 80 ? 'bg-green-50 text-green-700' :
                  successRate >= 50 ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  {successRate}% success
                </span>
              )}
            </div>
            <div className="px-5">
              {n8nLoading ? (
                <div className="py-8 text-center text-sm text-neutral-400">Loading executions…</div>
              ) : executions.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-400">No executions found</div>
              ) : (
                executions.map(ex => <ExecutionRow key={ex.id} ex={ex} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
