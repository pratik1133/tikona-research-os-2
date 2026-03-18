import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Save } from 'lucide-react';
import { useUpdateEquityUniverse } from '@/hooks/useEquityUniverse';
import type { EquityUniverse } from '@/types/database';

interface EditEquitySheetProps {
  stock: EquityUniverse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Field definition for data-driven form rendering
interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
}

// Section with fields
interface SectionDef {
  title: string;
  fields: FieldDef[];
}

// All editable fields organized by tab
const TABS: { id: string; label: string; sections: SectionDef[] }[] = [
  {
    id: 'identifiers',
    label: 'Info',
    sections: [
      {
        title: 'Identifiers',
        fields: [
          { key: 'company_name', label: 'Company Name', type: 'text' },
          { key: 'isin_code', label: 'ISIN Code', type: 'text' },
          { key: 'nse_code', label: 'NSE Code', type: 'text' },
          { key: 'bse_code', label: 'BSE Code', type: 'text' },
          { key: 'google_code', label: 'Google Code', type: 'text' },
          { key: 'nse_bom_code', label: 'NSE BOM Code', type: 'text' },
        ],
      },
      {
        title: 'Classification',
        fields: [
          { key: 'broad_sector', label: 'Broad Sector', type: 'text' },
          { key: 'sector', label: 'Sector', type: 'text' },
          { key: 'broad_industry', label: 'Broad Industry', type: 'text' },
          { key: 'industry', label: 'Industry', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'market',
    label: 'Market',
    sections: [
      {
        title: 'Market Data',
        fields: [
          { key: 'current_price', label: 'Current Price', type: 'number' },
          { key: 'market_cap', label: 'Market Cap', type: 'number' },
          { key: 'high_52_week', label: '52W High', type: 'number' },
          { key: 'low_52_week', label: '52W Low', type: 'number' },
          { key: 'volume', label: 'Volume', type: 'number' },
          { key: 'enterprise_value', label: 'Enterprise Value', type: 'number' },
        ],
      },
      {
        title: 'Returns',
        fields: [
          { key: 'return_down_from_52w_high', label: 'Down from 52W High %', type: 'number' },
          { key: 'return_up_from_52w_low', label: 'Up from 52W Low %', type: 'number' },
          { key: 'return_1m', label: 'Return 1M %', type: 'number' },
          { key: 'return_3m', label: 'Return 3M %', type: 'number' },
          { key: 'return_6m', label: 'Return 6M %', type: 'number' },
          { key: 'return_12m', label: 'Return 12M %', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'quarterly',
    label: 'Quarterly',
    sections: [
      {
        title: 'Latest Quarter',
        fields: [
          { key: 'quarterly_results_date', label: 'Results Date', type: 'date' },
          { key: 'sales_latest_qtr', label: 'Sales', type: 'number' },
          { key: 'op_profit_latest_qtr', label: 'Operating Profit', type: 'number' },
          { key: 'pat_latest_qtr', label: 'PAT', type: 'number' },
          { key: 'ebitda_margin_latest_qtr', label: 'EBITDA Margin %', type: 'number' },
          { key: 'pat_margin_latest_qtr', label: 'PAT Margin %', type: 'number' },
        ],
      },
      {
        title: 'Preceding Quarter',
        fields: [
          { key: 'sales_preceding_qtr', label: 'Sales', type: 'number' },
          { key: 'op_profit_preceding_qtr', label: 'Operating Profit', type: 'number' },
          { key: 'pat_preceding_qtr', label: 'PAT', type: 'number' },
        ],
      },
      {
        title: 'QoQ Growth',
        fields: [
          { key: 'revenue_growth_qoq', label: 'Revenue Growth %', type: 'number' },
          { key: 'ebitda_growth_qoq', label: 'EBITDA Growth %', type: 'number' },
          { key: 'ebitda_margin_growth_qoq_bps', label: 'EBITDA Margin Chg (bps)', type: 'number' },
          { key: 'pat_growth_qoq', label: 'PAT Growth %', type: 'number' },
          { key: 'pat_margin_growth_qoq_bps', label: 'PAT Margin Chg (bps)', type: 'number' },
        ],
      },
      {
        title: 'YoY Growth (Quarter)',
        fields: [
          { key: 'sales_growth_yoy_qtr', label: 'Sales Growth %', type: 'number' },
          { key: 'profit_growth_yoy_qtr', label: 'Profit Growth %', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'annual',
    label: 'Annual',
    sections: [
      {
        title: 'Annual Overview',
        fields: [
          { key: 'last_annual_result_date', label: 'Last Annual Result', type: 'date' },
          { key: 'sales_ttm_screener', label: 'Sales TTM', type: 'number' },
          { key: 'op_profit_ttm', label: 'Op Profit TTM', type: 'number' },
          { key: 'pat_ttm_screener', label: 'PAT TTM', type: 'number' },
          { key: 'ebitda_margin_ttm', label: 'EBITDA Margin TTM %', type: 'number' },
          { key: 'opm_last_year', label: 'OPM Last Year %', type: 'number' },
          { key: 'pat_margin_ttm', label: 'PAT Margin TTM %', type: 'number' },
        ],
      },
      {
        title: 'Per Share & Shares',
        fields: [
          { key: 'num_equity_shares', label: 'Equity Shares', type: 'number' },
          { key: 'eps_ttm_actual', label: 'EPS TTM', type: 'number' },
          { key: 'book_value', label: 'Book Value', type: 'number' },
        ],
      },
      {
        title: 'Balance Sheet',
        fields: [
          { key: 'debt', label: 'Debt', type: 'number' },
          { key: 'cash_equivalents', label: 'Cash & Equivalents', type: 'number' },
          { key: 'net_debt', label: 'Net Debt', type: 'number' },
          { key: 'net_worth', label: 'Net Worth', type: 'number' },
          { key: 'net_block', label: 'Net Block', type: 'number' },
          { key: 'cwip', label: 'CWIP', type: 'number' },
          { key: 'cwip_to_net_block_ratio', label: 'CWIP/Net Block', type: 'number' },
        ],
      },
      {
        title: 'Ratios',
        fields: [
          { key: 'roe', label: 'ROE %', type: 'number' },
          { key: 'roce', label: 'ROCE %', type: 'number' },
          { key: 'roic', label: 'ROIC %', type: 'number' },
          { key: 'working_capital_to_sales_ratio', label: 'WC/Sales', type: 'number' },
          { key: 'asset_turnover_ratio', label: 'Asset Turnover', type: 'number' },
        ],
      },
      {
        title: 'Shareholding',
        fields: [
          { key: 'promoter_holding_pct', label: 'Promoter Holding %', type: 'number' },
          { key: 'unpledged_promoter_holding_pct', label: 'Unpledged Promoter %', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'historicals',
    label: 'Historicals',
    sections: [
      {
        title: 'Revenue',
        fields: [
          { key: 'revenue_fy2023', label: 'FY2023', type: 'number' },
          { key: 'revenue_fy2024', label: 'FY2024', type: 'number' },
          { key: 'revenue_fy2025', label: 'FY2025', type: 'number' },
          { key: 'revenue_ttm', label: 'TTM', type: 'number' },
          { key: 'revenue_fy2026e', label: 'FY2026E', type: 'number' },
          { key: 'revenue_fy2027e', label: 'FY2027E', type: 'number' },
          { key: 'revenue_fy2028e', label: 'FY2028E', type: 'number' },
          { key: 'revenue_cagr_hist_2yr', label: 'CAGR Hist 2Y %', type: 'number' },
          { key: 'revenue_cagr_fwd_2yr', label: 'CAGR Fwd 2Y %', type: 'number' },
        ],
      },
      {
        title: 'EBITDA',
        fields: [
          { key: 'ebitda_fy2023', label: 'FY2023', type: 'number' },
          { key: 'ebitda_fy2024', label: 'FY2024', type: 'number' },
          { key: 'ebitda_fy2025', label: 'FY2025', type: 'number' },
          { key: 'ebitda_ttm', label: 'TTM', type: 'number' },
          { key: 'ebitda_fy2026e', label: 'FY2026E', type: 'number' },
          { key: 'ebitda_fy2027e', label: 'FY2027E', type: 'number' },
          { key: 'ebitda_fy2028e', label: 'FY2028E', type: 'number' },
          { key: 'ebitda_cagr_hist_2yr', label: 'CAGR Hist 2Y %', type: 'number' },
          { key: 'ebitda_cagr_fwd_2yr', label: 'CAGR Fwd 2Y %', type: 'number' },
        ],
      },
      {
        title: 'PAT',
        fields: [
          { key: 'pat_fy2023', label: 'FY2023', type: 'number' },
          { key: 'pat_fy2024', label: 'FY2024', type: 'number' },
          { key: 'pat_fy2025', label: 'FY2025', type: 'number' },
          { key: 'pat_ttm', label: 'TTM', type: 'number' },
          { key: 'pat_fy2026e', label: 'FY2026E', type: 'number' },
          { key: 'pat_fy2027e', label: 'FY2027E', type: 'number' },
          { key: 'pat_fy2028e', label: 'FY2028E', type: 'number' },
          { key: 'pat_cagr_hist_2yr', label: 'CAGR Hist 2Y %', type: 'number' },
          { key: 'pat_cagr_fwd_2yr', label: 'CAGR Fwd 2Y %', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'margins',
    label: 'Margins',
    sections: [
      {
        title: 'EBITDA Margins',
        fields: [
          { key: 'ebitda_margin_fy2023', label: 'FY2023 %', type: 'number' },
          { key: 'ebitda_margin_fy2024', label: 'FY2024 %', type: 'number' },
          { key: 'ebitda_margin_fy2025', label: 'FY2025 %', type: 'number' },
          { key: 'ebitda_margin_ttm_calc', label: 'TTM Calc %', type: 'number' },
          { key: 'ebitda_margin_fy2026e', label: 'FY2026E %', type: 'number' },
          { key: 'ebitda_margin_fy2027e', label: 'FY2027E %', type: 'number' },
          { key: 'ebitda_margin_fy2028e', label: 'FY2028E %', type: 'number' },
        ],
      },
      {
        title: 'PAT Margins',
        fields: [
          { key: 'pat_margin_fy2023', label: 'FY2023 %', type: 'number' },
          { key: 'pat_margin_fy2024', label: 'FY2024 %', type: 'number' },
          { key: 'pat_margin_fy2025', label: 'FY2025 %', type: 'number' },
          { key: 'pat_margin_ttm_calc', label: 'TTM Calc %', type: 'number' },
          { key: 'pat_margin_fy2026e', label: 'FY2026E %', type: 'number' },
          { key: 'pat_margin_fy2027e', label: 'FY2027E %', type: 'number' },
          { key: 'pat_margin_fy2028e', label: 'FY2028E %', type: 'number' },
        ],
      },
      {
        title: 'EPS',
        fields: [
          { key: 'eps_fy2023', label: 'FY2023', type: 'number' },
          { key: 'eps_fy2024', label: 'FY2024', type: 'number' },
          { key: 'eps_fy2025', label: 'FY2025', type: 'number' },
          { key: 'eps_ttm', label: 'TTM', type: 'number' },
          { key: 'eps_fy2026e', label: 'FY2026E', type: 'number' },
          { key: 'eps_fy2027e', label: 'FY2027E', type: 'number' },
          { key: 'eps_fy2028e', label: 'FY2028E', type: 'number' },
          { key: 'eps_cagr_hist_2yr', label: 'CAGR Hist 2Y %', type: 'number' },
          { key: 'eps_cagr_fwd_2yr', label: 'CAGR Fwd 2Y %', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'valuation',
    label: 'Valuation',
    sections: [
      {
        title: 'P/E Ratios',
        fields: [
          { key: 'pe_ttm', label: 'P/E TTM', type: 'number' },
          { key: 'pe_fy2026e', label: 'P/E FY2026E', type: 'number' },
          { key: 'pe_fy2027e', label: 'P/E FY2027E', type: 'number' },
          { key: 'pe_fy2028e', label: 'P/E FY2028E', type: 'number' },
          { key: 'pe_avg_3yr', label: 'P/E Avg 3Y', type: 'number' },
          { key: 'pe_avg_5yr', label: 'P/E Avg 5Y', type: 'number' },
          { key: 'pe_high_hist', label: 'P/E High (Hist)', type: 'number' },
          { key: 'pe_low_hist', label: 'P/E Low (Hist)', type: 'number' },
        ],
      },
      {
        title: 'EV/EBITDA',
        fields: [
          { key: 'ev_ebitda_ttm', label: 'TTM', type: 'number' },
          { key: 'ev_ebitda_fy2026e', label: 'FY2026E', type: 'number' },
          { key: 'ev_ebitda_fy2027e', label: 'FY2027E', type: 'number' },
          { key: 'ev_ebitda_fy2028e', label: 'FY2028E', type: 'number' },
        ],
      },
      {
        title: 'P/S Ratios',
        fields: [
          { key: 'ps_ttm', label: 'TTM', type: 'number' },
          { key: 'ps_fy2026e', label: 'FY2026E', type: 'number' },
          { key: 'ps_fy2027e', label: 'FY2027E', type: 'number' },
          { key: 'ps_fy2028e', label: 'FY2028E', type: 'number' },
        ],
      },
      {
        title: 'Target Prices',
        fields: [
          { key: 'sotp_value', label: 'SOTP Value', type: 'number' },
          { key: 'target_price_high', label: 'Target High', type: 'number' },
          { key: 'target_price_low', label: 'Target Low', type: 'number' },
          { key: 'potential_upside_high', label: 'Upside High %', type: 'number' },
          { key: 'potential_upside_low', label: 'Upside Low %', type: 'number' },
          { key: 'consensus_target_price', label: 'Consensus Target', type: 'number' },
          { key: 'consensus_upside_pct', label: 'Consensus Upside %', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'charts',
    label: 'Charts',
    sections: [
      {
        title: 'Chart URLs',
        fields: [
          { key: 'chart_url_1m', label: '1M Chart URL', type: 'text' },
          { key: 'chart_url_3m', label: '3M Chart URL', type: 'text' },
          { key: 'chart_url_6m', label: '6M Chart URL', type: 'text' },
          { key: 'chart_url_12m', label: '12M Chart URL', type: 'text' },
        ],
      },
    ],
  },
];

// Build a flat list of all field keys for form state
const ALL_FIELD_KEYS: string[] = TABS.flatMap((tab) =>
  tab.sections.flatMap((section) => section.fields.map((f) => f.key))
);

type FormState = Record<string, string>;

function initForm(stock: EquityUniverse | null): FormState {
  const form: FormState = {};
  const record = stock as unknown as Record<string, unknown> | null;
  for (const key of ALL_FIELD_KEYS) {
    const value = record ? record[key] : null;
    if (value == null) {
      form[key] = '';
    } else {
      form[key] = String(value);
    }
  }
  return form;
}

function toNum(val: string): number | null {
  if (val.trim() === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function toStr(val: string): string | null {
  return val.trim() || null;
}

function FormField({
  label,
  id,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-neutral-600">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  );
}

export default function EditEquitySheet({
  stock,
  open,
  onOpenChange,
}: EditEquitySheetProps) {
  const [form, setForm] = useState<FormState>(initForm(null));
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('identifiers');
  const updateMutation = useUpdateEquityUniverse();

  useEffect(() => {
    if (stock) {
      setForm(initForm(stock));
      setActiveTab('identifiers');
    }
  }, [stock]);

  const updateField = useCallback(
    (key: string) => (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = async () => {
    if (!stock) return;

    setSaving(true);
    try {
      // Build the update payload from form state
      const updates: Record<string, unknown> = {};
      for (const tab of TABS) {
        for (const section of tab.sections) {
          for (const field of section.fields) {
            if (field.type === 'number') {
              updates[field.key] = toNum(form[field.key]);
            } else if (field.type === 'date') {
              updates[field.key] = toStr(form[field.key]);
            } else {
              updates[field.key] = toStr(form[field.key]);
            }
          }
        }
      }

      await updateMutation.mutateAsync({
        companyId: stock.company_id,
        updates: updates as Partial<Omit<EquityUniverse, 'company_id' | 'created_at' | 'updated_at'>>,
      });

      toast.success('Record updated', {
        description: `${form.company_name || form.isin_code || 'Record'} has been saved.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('Save failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  const displayName = stock?.company_name || stock?.nse_code || stock?.isin_code || 'Record';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-6 pt-6 pb-4">
          <SheetHeader>
            <SheetTitle>Edit Equity Record</SheetTitle>
            <SheetDescription>
              Update financial data for {displayName}
            </SheetDescription>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="w-full flex-wrap h-auto gap-1">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="text-xs px-2 py-1"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="px-6 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {TABS.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="mt-4 space-y-5">
                {tab.sections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold uppercase text-neutral-400 mb-2 border-b border-neutral-100 pb-1">
                      {section.title}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {section.fields.map((field) => (
                        <FormField
                          key={field.key}
                          label={field.label}
                          id={`eq-${field.key}`}
                          type={field.type}
                          value={form[field.key] ?? ''}
                          onChange={updateField(field.key)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>
            ))}
          </Tabs>

          <div className="mt-6 pt-4 border-t border-neutral-200">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
