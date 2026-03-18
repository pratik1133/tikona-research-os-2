import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCompanySearch } from '@/hooks/useCompanySearch';
import { useSectors } from '@/hooks/usePipelineSession';
import { PIPELINE_MODELS, DEFAULT_PIPELINE_MODEL } from '@/types/pipeline';
import type { MasterCompany } from '@/types/database';
import { Search, Plus, Building2, Cpu } from 'lucide-react';

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    company: MasterCompany;
    sector: string;
    model: string;
  }) => void;
  isLoading?: boolean;
}

export default function NewSessionDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: NewSessionDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<MasterCompany | null>(null);
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PIPELINE_MODEL);
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: companies } = useCompanySearch(searchTerm);
  const { data: sectors } = useSectors();

  const handleSelectCompany = useCallback((company: MasterCompany) => {
    setSelectedCompany(company);
    setSearchTerm(company.company_name);
    setShowDropdown(false);
    // Auto-select sector if company has one
    if (company.sector) {
      setSelectedSector(company.sector);
    }
  }, []);

  const handleSubmit = () => {
    if (!selectedCompany || !selectedSector) return;
    onSubmit({
      company: selectedCompany,
      sector: selectedSector,
      model: selectedModel,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Report Generator Session
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Company Search */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Company
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                  if (selectedCompany && e.target.value !== selectedCompany.company_name) {
                    setSelectedCompany(null);
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by company name or NSE symbol..."
                className="pl-9"
              />

              {/* Dropdown */}
              {showDropdown && companies && companies.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {companies.map((company) => (
                    <button
                      key={company.company_id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 border-b border-neutral-50 last:border-0"
                      onClick={() => handleSelectCompany(company)}
                    >
                      <span className="font-medium text-neutral-900">{company.company_name}</span>
                      <span className="ml-2 text-xs text-neutral-400">
                        {company.nse_symbol}
                        {company.sector ? ` · ${company.sector}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedCompany && (
              <p className="text-xs text-green-600">
                Selected: {selectedCompany.company_name} ({selectedCompany.nse_symbol})
              </p>
            )}
          </div>

          {/* Sector */}
          <div className="space-y-2">
            <Label>Sector</Label>
            <Select value={selectedSector} onValueChange={setSelectedSector}>
              <SelectTrigger>
                <SelectValue placeholder="Select sector..." />
              </SelectTrigger>
              <SelectContent>
                {sectors?.map((s) => (
                  <SelectItem key={s.sector_name} value={s.sector_name}>
                    {s.sector_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              AI Model
            </Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!selectedCompany || !selectedSector || isLoading}
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white mr-2" />
                Setting up...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1.5" />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
