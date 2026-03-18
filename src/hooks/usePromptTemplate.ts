import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPromptTemplates,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  reorderPromptTemplates,
} from '@/lib/api';

// Query key factory
export const promptTemplateKeys = {
  all: ['prompt_templates'] as const,
  list: (userEmail?: string) =>
    [...promptTemplateKeys.all, 'list', userEmail] as const,
};

/**
 * Fetch all prompt templates (default + user's custom ones)
 */
export function usePromptTemplates(userEmail?: string) {
  return useQuery({
    queryKey: promptTemplateKeys.list(userEmail),
    queryFn: () => listPromptTemplates(userEmail),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Create a new custom prompt template
 */
export function useCreatePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      section_key: string;
      title: string;
      heading_prompt?: string;
      prompt_text: string;
      search_keywords: string[];
    }) => {
      return createPromptTemplate(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.all });
    },
  });
}

/**
 * Update an existing prompt template
 */
export function useUpdatePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        title?: string;
        heading_prompt?: string;
        prompt_text?: string;
        search_keywords?: string[];
        section_key?: string;
      };
    }) => {
      return updatePromptTemplate(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.all });
    },
  });
}

/**
 * Delete a custom prompt template
 */
export function useDeletePromptTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return deletePromptTemplate(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.all });
    },
  });
}

/**
 * Reorder prompt templates (batch update sort_order)
 */
export function useReorderPromptTemplates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      return reorderPromptTemplates(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptTemplateKeys.all });
    },
  });
}
