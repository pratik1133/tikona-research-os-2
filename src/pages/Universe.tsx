import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  TrendingUp,
  Download,
  Upload,
} from 'lucide-react';
import { useEquityUniverseList } from '@/hooks/useEquityUniverse';
import type { EquityUniverse } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/spinner';
import FetchDataDialog from '@/components/FetchDataDialog';
import BulkFetchDialog from '@/components/BulkFetchDialog';
import EquityActions from '@/components/EquityActions';
import EditEquitySheet from '@/components/EditEquitySheet';
import { cn } from '@/lib/utils';
import { PAGE_SIZE_OPTIONS } from '@/lib/constants';

const columnHelper = createColumnHelper<EquityUniverse>();

// Helper to format currency in Indian notation (lakhs/crores)
function formatIndianCurrency(value: number | null): string {
  if (value == null) return '-';
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString('en-IN')}`;
}

// Helper to format percentage with color
function formatPercent(value: number | null, showSign = true): React.ReactNode {
  if (value == null) return <span className="text-neutral-400">-</span>;
  const isPositive = value >= 0;
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
  const sign = showSign && isPositive ? '+' : '';
  return (
    <span className={colorClass}>
      {sign}{value.toFixed(2)}%
    </span>
  );
}

// Data columns definition - equity_universe data
const dataColumns = [
  columnHelper.accessor('company_name', {
    header: ({ column }) => <SortableHeader column={column} title="Company" />,
    cell: (info) => (
      <span className="font-semibold text-neutral-900 truncate max-w-[220px] block" title={info.getValue() || ''}>
        {info.getValue() || '-'}
      </span>
    ),
    size: 220,
  }),
  columnHelper.accessor('sector', {
    header: ({ column }) => <SortableHeader column={column} title="Sector" />,
    cell: (info) => (
      <span className="text-xs text-neutral-600 truncate max-w-[100px] block" title={info.getValue() || ''}>
        {info.getValue() || '-'}
      </span>
    ),
    size: 100,
  }),
  columnHelper.accessor('current_price', {
    header: ({ column }) => <SortableHeader column={column} title="Price" />,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="font-medium text-neutral-900">
          {value != null ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '-'}
        </span>
      );
    },
    size: 90,
  }),
  columnHelper.accessor('market_cap', {
    header: ({ column }) => <SortableHeader column={column} title="Mkt Cap" />,
    cell: (info) => (
      <span className="text-sm text-neutral-600">
        {formatIndianCurrency(info.getValue())}
      </span>
    ),
    size: 100,
  }),
  columnHelper.accessor('pe_ttm', {
    header: ({ column }) => <SortableHeader column={column} title="P/E" />,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="text-sm text-neutral-600">
          {value != null ? value.toFixed(1) : '-'}
        </span>
      );
    },
    size: 70,
  }),
  columnHelper.accessor('ev_ebitda_ttm', {
    header: ({ column }) => <SortableHeader column={column} title="EV/EBITDA" />,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="text-sm text-neutral-600">
          {value != null ? value.toFixed(1) : '-'}
        </span>
      );
    },
    size: 80,
  }),
  columnHelper.accessor('roe', {
    header: ({ column }) => <SortableHeader column={column} title="ROE" />,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="text-sm text-neutral-600">
          {value != null ? `${value.toFixed(1)}%` : '-'}
        </span>
      );
    },
    size: 70,
  }),
  columnHelper.accessor('roce', {
    header: ({ column }) => <SortableHeader column={column} title="ROCE" />,
    cell: (info) => {
      const value = info.getValue();
      return (
        <span className="text-sm text-neutral-600">
          {value != null ? `${value.toFixed(1)}%` : '-'}
        </span>
      );
    },
    size: 70,
  }),
  columnHelper.accessor('return_1m', {
    header: ({ column }) => <SortableHeader column={column} title="1M" />,
    cell: (info) => formatPercent(info.getValue()),
    size: 70,
  }),
  columnHelper.accessor('return_3m', {
    header: ({ column }) => <SortableHeader column={column} title="3M" />,
    cell: (info) => formatPercent(info.getValue()),
    size: 70,
  }),
  columnHelper.accessor('return_12m', {
    header: ({ column }) => <SortableHeader column={column} title="1Y" />,
    cell: (info) => formatPercent(info.getValue()),
    size: 70,
  }),
];

// Sortable header component
function SortableHeader({
  column,
  title,
}: {
  column: {
    getIsSorted: () => false | 'asc' | 'desc';
    toggleSorting: (desc?: boolean) => void;
  };
  title: string;
}) {
  const sorted = column.getIsSorted();

  return (
    <button
      className="flex items-center gap-1 hover:text-neutral-900"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {title}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

// Empty state component
function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-50">
        <TrendingUp className="h-6 w-6 text-accent-300" />
      </div>
      <h3 className="mt-4 text-sm font-medium text-neutral-900">
        {hasSearch ? 'No stocks found' : 'No stocks in universe'}
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        {hasSearch
          ? 'Try adjusting your search terms'
          : 'Add stocks to your equity universe to get started'}
      </p>
    </div>
  );
}

// Main Equity Universe Page
export default function Universe() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [isFetchDialogOpen, setIsFetchDialogOpen] = useState(false);
  const [isBulkFetchDialogOpen, setIsBulkFetchDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<EquityUniverse | null>(null);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  const handleEdit = (stock: EquityUniverse) => {
    setEditingStock(stock);
    setIsEditSheetOpen(true);
  };

  // Build columns with actions
  const columns = useMemo<ColumnDef<EquityUniverse, unknown>[]>(
    () => [
      ...dataColumns as ColumnDef<EquityUniverse, unknown>[],
      {
        id: 'actions',
        header: '',
        size: 50,
        cell: ({ row }) => (
          <EquityActions stock={row.original} onEdit={handleEdit} />
        ),
      },
    ],
    []
  );

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPageIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch data with server-side pagination
  const {
    data: queryResult,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useEquityUniverseList(debouncedSearch, pageIndex, pageSize);

  // Minimum-duration refresh animation so the spinner feels intentional
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch();
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 800);
  }, [refetch]);
  // Clear artificial spinner once real fetch finishes (if fetch takes longer than 800ms)
  useEffect(() => {
    if (!isFetching && isRefreshing) {
      clearTimeout(refreshTimer.current);
      setIsRefreshing(false);
    }
  }, [isFetching]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  const showRefreshing = isRefreshing || isFetching;

  const stocks = queryResult?.data ?? [];
  const totalCount = queryResult?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Table instance
  const table = useReactTable({
    data: stocks,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  // Pagination handlers
  const canPreviousPage = pageIndex > 0;
  const canNextPage = pageIndex < totalPages - 1;

  const goToFirstPage = () => setPageIndex(0);
  const goToLastPage = () => setPageIndex(totalPages - 1);
  const goToPreviousPage = () => setPageIndex((prev) => Math.max(0, prev - 1));
  const goToNextPage = () =>
    setPageIndex((prev) => Math.min(totalPages - 1, prev + 1));

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPageIndex(0);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <header className="border-b border-neutral-200/80 bg-white px-7 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
              Equity Universe
            </h1>
            <p className="text-sm text-neutral-500">
              {totalCount.toLocaleString()} stocks tracked
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={showRefreshing}
              className="min-w-[110px]"
            >
              <RefreshCw
                className={cn('h-4 w-4 mr-2', showRefreshing && 'animate-spin')}
              />
              {showRefreshing ? 'Refreshing' : 'Refresh'}
            </Button>

            {/* Fetch Data Button */}
            <Button size="sm" variant="outline" onClick={() => setIsFetchDialogOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Fetch Data
            </Button>

            {/* Bulk Upload Button */}
            <Button size="sm" onClick={() => setIsBulkFetchDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-neutral-200/80 bg-white px-7 py-3">
        <div className="flex items-center justify-between">
          {/* Search */}
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search by ticker, company, ISIN, or sector..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-neutral-500">
            {debouncedSearch && (
              <span>Found {totalCount.toLocaleString()} results</span>
            )}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto bg-white" style={{ willChange: 'transform' }}>
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <p className="text-sm text-red-600">
              {error?.message || 'Failed to load equity universe'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        ) : stocks.length === 0 ? (
          <EmptyState hasSearch={!!debouncedSearch} />
        ) : (
          <table className="w-full border-collapse animate-content-ready">
            <thead className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b border-neutral-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-neutral-500"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="h-8 transition-colors hover:bg-accent-50/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="whitespace-nowrap px-3 py-1 text-sm"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {!isLoading && totalCount > 0 && (
        <footer className="border-t border-neutral-200/80 bg-white px-7 py-3">
          <div className="flex items-center justify-between">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-400 transition-colors"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            {/* Page Info & Navigation */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-neutral-500">
                Showing {pageIndex * pageSize + 1}-
                {Math.min((pageIndex + 1) * pageSize, totalCount)} of{' '}
                {totalCount.toLocaleString()}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToFirstPage}
                  disabled={!canPreviousPage}
                  title="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={!canPreviousPage}
                  title="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-sm text-neutral-600">
                  Page {pageIndex + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={!canNextPage}
                  title="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToLastPage}
                  disabled={!canNextPage}
                  title="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Fetch Data Dialog */}
      <FetchDataDialog
        open={isFetchDialogOpen}
        onOpenChange={setIsFetchDialogOpen}
      />

      {/* Bulk Fetch Dialog */}
      <BulkFetchDialog
        open={isBulkFetchDialogOpen}
        onOpenChange={setIsBulkFetchDialogOpen}
      />

      {/* Edit Equity Sheet */}
      <EditEquitySheet
        stock={editingStock}
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
      />
    </div>
  );
}
