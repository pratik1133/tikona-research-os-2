import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, getCurrentUserEmail } from '@/lib/supabase';
import type {
  MasterCompany,
  CreateMasterCompanyInput,
  CreateAuditLogInput,
} from '@/types/database';
import { AUDIT_ACTIONS } from '@/lib/constants';

// Query key factory
export const masterCompanyKeys = {
  all: ['master_company'] as const,
  list: (filters?: { search?: string; page?: number; pageSize?: number }) =>
    [...masterCompanyKeys.all, 'list', filters] as const,
  detail: (id: number) => [...masterCompanyKeys.all, 'detail', id] as const,
};

// Fetch all master company records with pagination
export function useMasterCompanyList(
  search?: string,
  page: number = 0,
  pageSize: number = 50
) {
  return useQuery({
    queryKey: masterCompanyKeys.list({ search, page, pageSize }),
    queryFn: async (): Promise<{ data: MasterCompany[]; count: number }> => {
      let query = supabase
        .from('master_company')
        .select('*', { count: 'exact' });

      // Apply search filter if provided
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.or(
          `company_name.ilike.${searchTerm},nse_symbol.ilike.${searchTerm},isin.ilike.${searchTerm},bse_code.ilike.${searchTerm},bloomberg_ticker.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order('company_name', { ascending: true })
        .range(from, to);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to fetch companies: ${error.message}`);
      }

      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 30000,
  });
}

// Fetch single master company record
export function useMasterCompanyDetail(companyId: number) {
  return useQuery({
    queryKey: masterCompanyKeys.detail(companyId),
    queryFn: async (): Promise<MasterCompany | null> => {
      const { data, error } = await supabase
        .from('master_company')
        .select('*')
        .eq('company_id', companyId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Failed to fetch company: ${error.message}`);
      }

      return data;
    },
    enabled: !!companyId,
  });
}

// Create audit log helper
async function createAuditLog(log: CreateAuditLogInput) {
  try {
    const { error } = await supabase.from('audit_logs').insert(log);
    if (error) {
      console.error('Failed to create audit log:', error);
    }
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Add new company mutation
export function useAddMasterCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMasterCompanyInput): Promise<MasterCompany> => {
      const { data, error } = await supabase
        .from('master_company')
        .insert({
          company_name: input.company_name,
          nse_symbol: input.nse_symbol?.toUpperCase() || null,
          bse_code: input.bse_code || null,
          isin: input.isin?.toUpperCase() || null,
          face_value: input.face_value || null,
          paid_up_value: input.paid_up_value || null,
          date_of_listing: input.date_of_listing || null,
          accord_code: input.accord_code || null,
          google_code: input.google_code || null,
          bloomberg_ticker: input.bloomberg_ticker?.toUpperCase() || null,
          yahoo_code: input.yahoo_code || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A company with this ISIN or NSE Symbol already exists');
        }
        throw new Error(`Failed to add company: ${error.message}`);
      }

      // Create audit log
      const userEmail = await getCurrentUserEmail();
      if (userEmail) {
        await createAuditLog({
          user_email: userEmail,
          action: AUDIT_ACTIONS.ADDED_COMPANY,
          details: {
            company_id: data.company_id,
            company_name: data.company_name,
            nse_symbol: data.nse_symbol,
            isin: data.isin,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: masterCompanyKeys.all });
    },
  });
}

// Update company mutation
export function useUpdateMasterCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyId,
      updates,
    }: {
      companyId: number;
      updates: Record<string, string | number | null | undefined>;
    }): Promise<MasterCompany> => {
      // Build payload: include all provided fields, uppercase where appropriate
      const payload: Record<string, unknown> = {
        modified_at: new Date().toISOString(),
      };

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        // Uppercase applicable string fields
        if (typeof value === 'string' && ['nse_symbol', 'isin', 'bloomberg_ticker'].includes(key)) {
          payload[key] = value.toUpperCase() || null;
        } else {
          payload[key] = value;
        }
      }

      const { data, error } = await supabase
        .from('master_company')
        .update(payload)
        .eq('company_id', companyId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update company: ${error.message}`);
      }

      // Create audit log
      const userEmail = await getCurrentUserEmail();
      if (userEmail) {
        await createAuditLog({
          user_email: userEmail,
          action: AUDIT_ACTIONS.UPDATED_COMPANY,
          details: {
            company_id: companyId,
            updates,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: masterCompanyKeys.all });
      queryClient.setQueryData(masterCompanyKeys.detail(data.company_id), data);
    },
  });
}

// Delete company mutation
export function useDeleteMasterCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: number): Promise<void> => {
      const { error } = await supabase
        .from('master_company')
        .delete()
        .eq('company_id', companyId);

      if (error) {
        throw new Error(`Failed to delete company: ${error.message}`);
      }

      // Create audit log
      const userEmail = await getCurrentUserEmail();
      if (userEmail) {
        await createAuditLog({
          user_email: userEmail,
          action: AUDIT_ACTIONS.DELETED_COMPANY,
          details: {
            company_id: companyId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: masterCompanyKeys.all });
    },
  });
}
