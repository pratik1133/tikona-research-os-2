import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listResearchSessions,
  saveResearchSession,
  deleteResearchSession,
  updateSessionStatus,
  updateSessionDocuments,
  saveSessionDocuments,
  getSessionDocuments,
} from '@/lib/api';
import type {
  ResearchSession,
  CreateResearchSessionInput,
  CreateSessionDocumentInput,
} from '@/types/database';

// Query key factory
export const sessionKeys = {
  all: ['research_sessions'] as const,
  list: (filters?: { userEmail?: string; status?: string; page?: number }) =>
    [...sessionKeys.all, 'list', filters] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
  documents: (sessionId: string) =>
    [...sessionKeys.all, 'documents', sessionId] as const,
};

/**
 * Fetch paginated list of research sessions
 */
export function useResearchSessionList(
  userEmail?: string,
  page: number = 0,
  pageSize: number = 25
) {
  return useQuery({
    queryKey: sessionKeys.list({ userEmail, page }),
    queryFn: () => listResearchSessions({ userEmail, page, pageSize }),
    staleTime: 30000,
  });
}

/**
 * Fetch documents for a specific session
 */
export function useSessionDocuments(sessionId: string | null) {
  return useQuery({
    queryKey: sessionKeys.documents(sessionId || ''),
    queryFn: () => getSessionDocuments(sessionId!),
    enabled: !!sessionId,
    staleTime: 60000,
  });
}

/**
 * Create a new research session
 */
export function useSaveResearchSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateResearchSessionInput) => {
      return saveResearchSession(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

/**
 * Save documents to a session
 */
export function useSaveSessionDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documents: CreateSessionDocumentInput[]) => {
      return saveSessionDocuments(documents);
    },
    onSuccess: (_data, variables) => {
      if (variables.length > 0) {
        queryClient.invalidateQueries({
          queryKey: sessionKeys.documents(variables[0].session_id),
        });
      }
    },
  });
}

/**
 * Update session status
 */
export function useUpdateSessionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      status,
    }: {
      sessionId: string;
      status: ResearchSession['status'];
    }) => {
      return updateSessionStatus(sessionId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

/**
 * Update session selected document IDs
 */
export function useUpdateSessionDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      selectedDocumentIds,
    }: {
      sessionId: string;
      selectedDocumentIds: string[];
    }) => {
      return updateSessionDocuments(sessionId, selectedDocumentIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

/**
 * Delete a research session
 */
export function useDeleteResearchSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return deleteResearchSession(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}
