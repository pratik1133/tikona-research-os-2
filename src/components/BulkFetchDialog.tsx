import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play,
  X,
} from 'lucide-react';
import { equityUniverseKeys } from '@/hooks/useEquityUniverse';
import { cn } from '@/lib/utils';

interface BulkFetchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type IdentifierType = 'nse_symbol' | 'bse_code' | 'isin';

interface ParsedRow {
  value: string;
  rowIndex: number;
}

interface FailedRow {
  value: string;
  rowIndex: number;
  error: string;
}

type ProcessingStatus = 'idle' | 'parsing' | 'ready' | 'processing' | 'completed';

const IDENTIFIER_OPTIONS: { value: IdentifierType; label: string }[] = [
  { value: 'nse_symbol', label: 'NSE Symbol' },
  { value: 'bse_code', label: 'BSE Code' },
  { value: 'isin', label: 'ISIN' },
];

const N8N_WEBHOOK_URL = 'https://n8n.tikonacapital.com/webhook/fetch-price';
const REQUEST_DELAY_MS = 500;

// Helper to detect identifier type from header
function detectIdentifierType(header: string): IdentifierType | null {
  const normalized = header.toLowerCase().trim();
  if (normalized === 'nse_symbol' || normalized === 'nse' || normalized === 'nse_code') {
    return 'nse_symbol';
  }
  if (normalized === 'bse_code' || normalized === 'bse') {
    return 'bse_code';
  }
  if (normalized === 'isin' || normalized === 'isin_code') {
    return 'isin';
  }
  return null;
}

// Helper to delay execution
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BulkFetchDialog({
  open,
  onOpenChange,
}: BulkFetchDialogProps) {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [detectedType, setDetectedType] = useState<IdentifierType | null>(null);
  const [selectedType, setSelectedType] = useState<IdentifierType>('nse_symbol');
  const [needsTypeSelection, setNeedsTypeSelection] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failedRows, setFailedRows] = useState<FailedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  // Get the effective identifier type
  const effectiveType = detectedType || selectedType;

  // Reset all state
  const resetState = useCallback(() => {
    setStatus('idle');
    setSelectedFile(null);
    setParsedRows([]);
    setDetectedType(null);
    setSelectedType('nse_symbol');
    setNeedsTypeSelection(false);
    setCurrentIndex(0);
    setSuccessCount(0);
    setFailedRows([]);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle dialog open/close
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Cancel any ongoing processing
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        resetState();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetState]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.csv')) {
        toast.error('Invalid file type', {
          description: 'Please upload a CSV file',
        });
        return;
      }

      setSelectedFile(file);
      setStatus('parsing');
      setParseError(null);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: ',', // Explicitly set delimiter to avoid auto-detect warnings
        complete: (results) => {
          // Filter out non-fatal errors (warnings about delimiter detection, etc.)
          const fatalErrors = results.errors.filter(
            (err) => err.type === 'FieldMismatch' || err.type === 'Quotes'
          );

          const data = results.data as Record<string, string>[];

          // Only fail if there are fatal errors AND no data was parsed
          if (fatalErrors.length > 0 && data.length === 0) {
            setParseError(`Parse error: ${fatalErrors[0].message}`);
            setStatus('idle');
            return;
          }

          if (data.length === 0) {
            setParseError('CSV file is empty');
            setStatus('idle');
            return;
          }

          // Get the first column header
          const headers = Object.keys(data[0]);
          if (headers.length === 0) {
            setParseError('No columns found in CSV');
            setStatus('idle');
            return;
          }

          const firstHeader = headers[0];
          const detected = detectIdentifierType(firstHeader);

          if (detected) {
            setDetectedType(detected);
            setNeedsTypeSelection(false);
          } else {
            setDetectedType(null);
            setNeedsTypeSelection(true);
          }

          // Extract values from the first column
          const rows: ParsedRow[] = data
            .map((row, index) => ({
              value: String(row[firstHeader] || '').trim(),
              rowIndex: index + 2, // +2 for 1-based index and header row
            }))
            .filter((row) => row.value !== '');

          if (rows.length === 0) {
            setParseError('No valid data found in the first column');
            setStatus('idle');
            return;
          }

          setParsedRows(rows);
          setStatus('ready');
        },
        error: (error) => {
          setParseError(`Failed to parse CSV: ${error.message}`);
          setStatus('idle');
        },
      });
    },
    []
  );

  // Process all rows
  const handleStartProcessing = useCallback(async () => {
    if (parsedRows.length === 0) return;

    setStatus('processing');
    setCurrentIndex(0);
    setSuccessCount(0);
    setFailedRows([]);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    for (let i = 0; i < parsedRows.length; i++) {
      if (signal.aborted) break;

      const row = parsedRows[i];
      setCurrentIndex(i + 1);

      try {
        const response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: effectiveType,
            value: row.value,
          }),
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setSuccessCount((prev) => prev + 1);
      } catch (error) {
        if (signal.aborted) break;

        setFailedRows((prev) => [
          ...prev,
          {
            ...row,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ]);
      }

      // Rate limiting delay (except for the last item)
      if (i < parsedRows.length - 1 && !signal.aborted) {
        await delay(REQUEST_DELAY_MS);
      }
    }

    setStatus('completed');
    abortControllerRef.current = null;

    // Invalidate query to refresh data
    queryClient.invalidateQueries({ queryKey: equityUniverseKeys.all });
  }, [parsedRows, effectiveType, queryClient]);

  // Cancel processing
  const handleCancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Calculate progress percentage
  const progressPercent =
    parsedRows.length > 0 ? Math.round((currentIndex / parsedRows.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Fetch Data
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to fetch data for multiple stocks at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload Section */}
          {status === 'idle' && (
            <div className="space-y-4">
              <div
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                  'hover:border-neutral-400 hover:bg-neutral-50',
                  parseError ? 'border-red-300 bg-red-50' : 'border-neutral-300'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 mx-auto text-neutral-400 mb-3" />
                <p className="text-sm font-medium text-neutral-700">
                  Click to upload CSV file
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  First column should contain stock identifiers
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-1 flex-shrink-0" />
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}
            </div>
          )}

          {/* Parsing State */}
          {status === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Spinner size="lg" />
              <p className="text-sm text-neutral-600 mt-3">Parsing CSV file...</p>
            </div>
          )}

          {/* Ready State - Show Preview */}
          {status === 'ready' && (
            <div className="space-y-4">
              {/* File Info */}
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
                <FileSpreadsheet className="h-5 w-5 text-neutral-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-700 truncate">
                    {selectedFile?.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {parsedRows.length} rows to process
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Detected Type or Selection */}
              {detectedType ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-700">
                    Detected identifier type:{' '}
                    <span className="font-semibold">
                      {IDENTIFIER_OPTIONS.find((o) => o.value === detectedType)?.label}
                    </span>
                  </p>
                </div>
              ) : needsTypeSelection ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-1" />
                    <p className="text-sm text-amber-700">
                      Could not detect identifier type. Please select manually.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="identifier_type">Identifier Type</Label>
                    <select
                      id="identifier_type"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value as IdentifierType)}
                      className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400"
                    >
                      {IDENTIFIER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview (first 5 rows)</Label>
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                  <div className="bg-neutral-50 px-3 py-2 border-b border-neutral-200">
                    <span className="text-xs font-medium text-neutral-600 uppercase">
                      {IDENTIFIER_OPTIONS.find((o) => o.value === effectiveType)?.label}
                    </span>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 text-sm text-neutral-700 font-mono"
                      >
                        {row.value}
                      </div>
                    ))}
                    {parsedRows.length > 5 && (
                      <div className="px-3 py-2 text-xs text-neutral-500 italic">
                        ... and {parsedRows.length - 5} more rows
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Processing State */}
          {status === 'processing' && (
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Processing...</span>
                  <span className="font-medium text-neutral-900">
                    {currentIndex} / {parsedRows.length}
                  </span>
                </div>
                <div className="h-3 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-500 text-center">
                  {progressPercent}% complete
                </p>
              </div>

              {/* Current Stats */}
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-neutral-600">
                    {successCount} successful
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-neutral-600">
                    {failedRows.length} failed
                  </span>
                </div>
              </div>

              {/* Cancel Button */}
              <Button
                variant="outline"
                onClick={handleCancelProcessing}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Completed State */}
          {status === 'completed' && (
            <div className="space-y-4">
              {/* Summary */}
              <div
                className={cn(
                  'p-4 rounded-lg border',
                  failedRows.length === 0
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                )}
              >
                <div className="flex items-center gap-3">
                  {failedRows.length === 0 ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-amber-600" />
                  )}
                  <div>
                    <p className="font-medium text-neutral-900">
                      Processing Complete
                    </p>
                    <p className="text-sm text-neutral-600">
                      {successCount} succeeded, {failedRows.length} failed
                    </p>
                  </div>
                </div>
              </div>

              {/* Failed Rows List */}
              {failedRows.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-red-700">Failed Items</Label>
                  <div className="border border-red-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <div className="divide-y divide-red-100">
                      {failedRows.map((row, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 bg-red-50 flex items-center justify-between"
                        >
                          <span className="text-sm font-mono text-neutral-700">
                            {row.value}
                          </span>
                          <span className="text-xs text-red-600">
                            Row {row.rowIndex}: {row.error}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-4">
          {status === 'idle' && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}

          {status === 'ready' && (
            <>
              <Button variant="outline" onClick={resetState}>
                Choose Different File
              </Button>
              <Button onClick={handleStartProcessing}>
                <Play className="h-4 w-4 mr-2" />
                Start Import ({parsedRows.length} rows)
              </Button>
            </>
          )}

          {status === 'completed' && (
            <>
              <Button variant="outline" onClick={resetState}>
                Upload Another
              </Button>
              <Button onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
