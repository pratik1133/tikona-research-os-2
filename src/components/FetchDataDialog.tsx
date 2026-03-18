import { useState, useCallback } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Download } from 'lucide-react';
import { equityUniverseKeys } from '@/hooks/useEquityUniverse';

interface FetchDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type IdentifierType = 'nse_symbol' | 'bse_code' | 'isin';

const IDENTIFIER_OPTIONS: { value: IdentifierType; label: string; placeholder: string }[] = [
  { value: 'nse_symbol', label: 'NSE Symbol', placeholder: 'Enter NSE ticker like TATAMOTORS' },
  { value: 'bse_code', label: 'BSE Code', placeholder: 'Enter BSE code like 500570' },
  { value: 'isin', label: 'ISIN', placeholder: 'Enter ISIN like INE155A01022' },
];

const N8N_WEBHOOK_URL = 'https://n8n.tikonacapital.com/webhook/fetch-price';

export default function FetchDataDialog({
  open,
  onOpenChange,
}: FetchDataDialogProps) {
  const [identifierType, setIdentifierType] = useState<IdentifierType>('nse_symbol');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const queryClient = useQueryClient();

  // Get current placeholder based on selected type
  const currentOption = IDENTIFIER_OPTIONS.find((opt) => opt.value === identifierType);
  const placeholder = currentOption?.placeholder || '';

  // Reset form when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setIdentifierType('nse_symbol');
        setInputValue('');
        setIsLoading(false);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Handle input change with uppercase for NSE/ISIN
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;
      if (identifierType === 'nse_symbol' || identifierType === 'isin') {
        value = value.toUpperCase();
      }
      setInputValue(value);
    },
    [identifierType]
  );

  // Handle type change - clear input when switching
  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setIdentifierType(e.target.value as IdentifierType);
    setInputValue('');
  }, []);

  // Handle fetch request
  const handleFetch = useCallback(async () => {
    if (!inputValue.trim()) {
      toast.error('Please enter a value');
      return;
    }

    setIsLoading(true);

    try {
      // Send POST request to n8n webhook
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: identifierType,
          value: inputValue.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      // Show processing toast
      toast.success('Request sent successfully', {
        description: `Fetching data for ${identifierType}: ${inputValue}. Updating in background...`,
      });

      // Close dialog
      handleOpenChange(false);

      // After 2 seconds, invalidate React Query to refresh the grid
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: equityUniverseKeys.all });
        toast.info('Data refreshed', {
          description: 'The equity universe table has been updated.',
        });
      }, 2000);

    } catch (error) {
      toast.error('Failed to fetch data', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  }, [identifierType, inputValue, handleOpenChange, queryClient]);

  // Handle form submission
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleFetch();
    },
    [handleFetch]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Fetch Financial Data
          </DialogTitle>
          <DialogDescription>
            Fetch or update financial data by providing any stock identifier.
            The data will be retrieved and updated in the background.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identifier Type Dropdown */}
          <div className="space-y-1.5">
            <Label htmlFor="identifier_type">Identifier Type</Label>
            <select
              id="identifier_type"
              value={identifierType}
              onChange={handleTypeChange}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent"
              disabled={isLoading}
            >
              {IDENTIFIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Input Field */}
          <div className="space-y-1.5">
            <Label htmlFor="identifier_value">
              {currentOption?.label} Value
            </Label>
            <Input
              id="identifier_value"
              placeholder={placeholder}
              value={inputValue}
              onChange={handleInputChange}
              disabled={isLoading}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-neutral-500">
              {identifierType === 'nse_symbol' && 'Enter the exact NSE trading symbol'}
              {identifierType === 'bse_code' && 'Enter the 6-digit BSE scrip code'}
              {identifierType === 'isin' && 'Enter the 12-character ISIN code'}
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !inputValue.trim()}>
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Fetching...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Fetch & Update
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
