import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MasterCompany, EquityUniverse } from '@/types/database';

export const companySearchKeys = {
  all: ['company_search'] as const,
  search: (query: string) => [...companySearchKeys.all, 'search', query] as const,
  financials: (isin: string) => [...companySearchKeys.all, 'financials', isin] as const,
};

// Search master_company by name or nse_symbol
export function useCompanySearch(searchTerm: string) {
  return useQuery({
    queryKey: companySearchKeys.search(searchTerm),
    queryFn: async (): Promise<MasterCompany[]> => {
      const term = `%${searchTerm.trim()}%`;

      const { data, error } = await supabase
        .from('master_company')
        .select('*')
        .or(`company_name.ilike.${term},nse_symbol.ilike.${term}`)
        .order('company_name', { ascending: true })
        .limit(10);

      if (error) {
        throw new Error(`Search failed: ${error.message}`);
      }

      return data ?? [];
    },
    enabled: searchTerm.trim().length >= 2,
    staleTime: 60000,
  });
}

// Fetch equity_universe data for the selected company using available identifiers
export function useCompanyFinancials(company: { nse_symbol?: string | null; isin?: string | null; bse_code?: string | null } | null) {
  const key = company?.nse_symbol || company?.isin || company?.bse_code || '';

  return useQuery({
    queryKey: companySearchKeys.financials(key),
    queryFn: async (): Promise<EquityUniverse | null> => {
      if (!company) return null;

      // Build OR filter from available identifiers
      const conditions: string[] = [];
      if (company.nse_symbol) conditions.push(`nse_code.eq.${company.nse_symbol}`);
      if (company.isin) conditions.push(`isin_code.eq.${company.isin}`);
      if (company.bse_code) conditions.push(`bse_code.eq.${company.bse_code}`);

      if (conditions.length === 0) return null;

      const { data, error } = await supabase
        .from('equity_universe')
        .select('*')
        .or(conditions.join(','))
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to fetch financials: ${error.message}`);
      }

      return data;
    },
    enabled: !!(company?.nse_symbol || company?.isin || company?.bse_code),
    staleTime: 60000,
  });
}
