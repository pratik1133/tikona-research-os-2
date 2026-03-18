import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EquityUniverse } from '@/types/database';

// Query key factory
export const equityUniverseKeys = {
  all: ['equity_universe'] as const,
  list: (filters?: { search?: string; page?: number; pageSize?: number }) =>
    [...equityUniverseKeys.all, 'list', filters] as const,
};

// Fetch equity universe records
export function useEquityUniverseList(
  search?: string,
  page: number = 0,
  pageSize: number = 50
) {
  return useQuery({
    queryKey: equityUniverseKeys.list({ search, page, pageSize }),
    queryFn: async (): Promise<{ data: EquityUniverse[]; count: number }> => {
      let query = supabase
        .from('equity_universe')
        .select('*', { count: 'exact' });

      // Apply search filter if provided
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.or(
          `isin_code.ilike.${searchTerm},nse_code.ilike.${searchTerm},bse_code.ilike.${searchTerm},sector.ilike.${searchTerm},company_name.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order('market_cap', { ascending: false, nullsFirst: false })
        .range(from, to);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to fetch equity universe: ${error.message}`);
      }

      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 30000,
  });
}

// Update equity universe record
export function useUpdateEquityUniverse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyId,
      updates,
    }: {
      companyId: number;
      updates: Partial<Omit<EquityUniverse, 'company_id' | 'created_at' | 'updated_at'>>;
    }): Promise<EquityUniverse> => {
      const { data, error } = await supabase
        .from('equity_universe')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update equity record: ${error.message}`);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equityUniverseKeys.all });
    },
  });
}

// Delete equity universe record
export function useDeleteEquityUniverse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: number): Promise<void> => {
      const { error } = await supabase
        .from('equity_universe')
        .delete()
        .eq('company_id', companyId);

      if (error) {
        throw new Error(`Failed to delete equity record: ${error.message}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equityUniverseKeys.all });
    },
  });
}
