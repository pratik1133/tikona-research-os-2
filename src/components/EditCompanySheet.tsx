import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Save } from 'lucide-react';
import { useUpdateMasterCompany } from '@/hooks/useMasterCompany';
import type { MasterCompany } from '@/types/database';

interface EditCompanySheetProps {
  company: MasterCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompanyForm {
  company_name: string;
  nse_symbol: string;
  bse_code: string;
  isin: string;
  bloomberg_ticker: string;
  yahoo_code: string;
  google_code: string;
  accord_code: string;
  face_value: string;
  paid_up_value: string;
  date_of_listing: string;
}

function initForm(company: MasterCompany | null): CompanyForm {
  return {
    company_name: company?.company_name ?? '',
    nse_symbol: company?.nse_symbol ?? '',
    bse_code: company?.bse_code ?? '',
    isin: company?.isin ?? '',
    bloomberg_ticker: company?.bloomberg_ticker ?? '',
    yahoo_code: company?.yahoo_code ?? '',
    google_code: company?.google_code ?? '',
    accord_code: company?.accord_code ?? '',
    face_value: company?.face_value != null ? String(company.face_value) : '',
    paid_up_value: company?.paid_up_value != null ? String(company.paid_up_value) : '',
    date_of_listing: company?.date_of_listing ?? '',
  };
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
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

export default function EditCompanySheet({
  company,
  open,
  onOpenChange,
}: EditCompanySheetProps) {
  const [form, setForm] = useState<CompanyForm>(initForm(null));
  const [saving, setSaving] = useState(false);
  const updateMutation = useUpdateMasterCompany();

  useEffect(() => {
    if (company) {
      setForm(initForm(company));
    }
  }, [company]);

  const updateField = useCallback(
    (field: keyof CompanyForm) => (value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSave = async () => {
    if (!company) return;

    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        companyId: company.company_id,
        updates: {
          company_name: form.company_name,
          nse_symbol: toStr(form.nse_symbol),
          bse_code: toStr(form.bse_code),
          isin: toStr(form.isin),
          bloomberg_ticker: toStr(form.bloomberg_ticker),
          yahoo_code: toStr(form.yahoo_code),
          google_code: toStr(form.google_code),
          accord_code: toStr(form.accord_code),
          face_value: toNum(form.face_value),
          paid_up_value: toNum(form.paid_up_value),
          date_of_listing: toStr(form.date_of_listing),
        },
      });

      toast.success('Company updated', {
        description: `${form.company_name} has been saved.`,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Edit Company</SheetTitle>
          <SheetDescription>
            Update master database record for {company?.company_name}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <FormField
            label="Company Name"
            id="company_name"
            value={form.company_name}
            onChange={updateField('company_name')}
            placeholder="e.g. Tata Motors Ltd"
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="NSE Symbol"
              id="nse_symbol"
              value={form.nse_symbol}
              onChange={updateField('nse_symbol')}
              placeholder="TATAMOTORS"
            />
            <FormField
              label="BSE Code"
              id="bse_code"
              value={form.bse_code}
              onChange={updateField('bse_code')}
              placeholder="500570"
            />
          </div>
          <FormField
            label="ISIN"
            id="isin"
            value={form.isin}
            onChange={updateField('isin')}
            placeholder="INE155A01022"
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Bloomberg Ticker"
              id="bloomberg_ticker"
              value={form.bloomberg_ticker}
              onChange={updateField('bloomberg_ticker')}
              placeholder="TTMT:IN"
            />
            <FormField
              label="Yahoo Code"
              id="yahoo_code"
              value={form.yahoo_code}
              onChange={updateField('yahoo_code')}
              placeholder="TATAMOTORS.NS"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Google Code"
              id="google_code"
              value={form.google_code}
              onChange={updateField('google_code')}
              placeholder="NSE:TATAMOTORS"
            />
            <FormField
              label="Accord Code"
              id="accord_code"
              value={form.accord_code}
              onChange={updateField('accord_code')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Face Value"
              id="face_value"
              type="number"
              value={form.face_value}
              onChange={updateField('face_value')}
              placeholder="2"
            />
            <FormField
              label="Paid Up Value"
              id="paid_up_value"
              type="number"
              value={form.paid_up_value}
              onChange={updateField('paid_up_value')}
              placeholder="2"
            />
          </div>
          <FormField
            label="Date of Listing"
            id="date_of_listing"
            type="date"
            value={form.date_of_listing}
            onChange={updateField('date_of_listing')}
          />
        </div>

        <div className="mt-6 pt-4 border-t border-neutral-200">
          <Button
            onClick={handleSave}
            disabled={saving || !form.company_name.trim()}
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
      </SheetContent>
    </Sheet>
  );
}
