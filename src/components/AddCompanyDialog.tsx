import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAddMasterCompany } from '@/hooks/useMasterCompany';
import type { CreateMasterCompanyInput } from '@/types/database';
import { validateISIN } from '@/lib/utils';

interface AddCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormErrors {
  company_name?: string;
  nse_symbol?: string;
  isin?: string;
  bse_code?: string;
}

const initialFormState: CreateMasterCompanyInput = {
  company_name: '',
  nse_symbol: '',
  bse_code: '',
  isin: '',
};

export default function AddCompanyDialog({
  open,
  onOpenChange,
}: AddCompanyDialogProps) {
  const [formData, setFormData] = useState<CreateMasterCompanyInput>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});

  const addCompanyMutation = useAddMasterCompany();

  // Reset form when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setFormData(initialFormState);
        setErrors({});
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Handle input changes
  const handleChange = useCallback(
    (field: keyof CreateMasterCompanyInput) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;

        // Force uppercase for symbol and ISIN
        if (field === 'nse_symbol' || field === 'isin') {
          value = value.toUpperCase();
        }

        setFormData((prev) => ({ ...prev, [field]: value }));

        // Clear error when user types
        if (errors[field as keyof FormErrors]) {
          setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
      },
    [errors]
  );

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Company name validation
    if (!formData.company_name.trim()) {
      newErrors.company_name = 'Company name is required';
    }

    // At least one identifier required
    if (!formData.nse_symbol?.trim() && !formData.bse_code?.trim()) {
      newErrors.nse_symbol = 'Either NSE Symbol or BSE Code is required';
    }

    // NSE Symbol validation (if provided)
    if (formData.nse_symbol && !/^[A-Z0-9&-]{1,20}$/.test(formData.nse_symbol)) {
      newErrors.nse_symbol = 'Invalid symbol format';
    }

    // ISIN validation (if provided)
    if (formData.isin && !validateISIN(formData.isin)) {
      newErrors.isin = 'ISIN must be 12 characters (2 letters + 10 alphanumeric)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) {
        return;
      }

      try {
        await addCompanyMutation.mutateAsync(formData);
        toast.success('Company added successfully', {
          description: `${formData.company_name} has been added to the database.`,
        });
        handleOpenChange(false);
      } catch (error) {
        toast.error('Failed to add company', {
          description:
            error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      }
    },
    [formData, validateForm, addCompanyMutation, handleOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Company</DialogTitle>
          <DialogDescription>
            Add a new company to the master database. Required fields are marked
            with an asterisk.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company_name">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="company_name"
              placeholder="e.g., Reliance Industries Ltd"
              value={formData.company_name}
              onChange={handleChange('company_name')}
              className={errors.company_name ? 'border-red-500' : ''}
              autoComplete="off"
            />
            {errors.company_name && (
              <p className="text-xs text-red-500">{errors.company_name}</p>
            )}
          </div>

          {/* NSE Symbol & BSE Code Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nse_symbol">
                NSE Symbol <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nse_symbol"
                placeholder="e.g., RELIANCE"
                value={formData.nse_symbol}
                onChange={handleChange('nse_symbol')}
                className={errors.nse_symbol ? 'border-red-500' : ''}
                autoComplete="off"
              />
              {errors.nse_symbol && (
                <p className="text-xs text-red-500">{errors.nse_symbol}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bse_code">BSE Code</Label>
              <Input
                id="bse_code"
                placeholder="e.g., 500325"
                value={formData.bse_code}
                onChange={handleChange('bse_code')}
                className={errors.bse_code ? 'border-red-500' : ''}
                autoComplete="off"
              />
              {errors.bse_code && (
                <p className="text-xs text-red-500">{errors.bse_code}</p>
              )}
            </div>
          </div>

          {/* ISIN */}
          <div className="space-y-2">
            <Label htmlFor="isin">ISIN</Label>
            <Input
              id="isin"
              placeholder="e.g., INE002A01018"
              value={formData.isin}
              onChange={handleChange('isin')}
              className={errors.isin ? 'border-red-500' : ''}
              maxLength={12}
              autoComplete="off"
            />
            {errors.isin && (
              <p className="text-xs text-red-500">{errors.isin}</p>
            )}
            <p className="text-xs text-neutral-500">
              12 characters: 2 letter country code + 10 alphanumeric
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={addCompanyMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addCompanyMutation.isPending} className="min-w-[135px]">
              {addCompanyMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Adding...
                </>
              ) : (
                'Add Company'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
