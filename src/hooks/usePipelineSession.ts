// Hook for pipeline session queries and mutations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPipelineSession,
  listPipelineSessions,
  createPipelineSession,
  transitionPipelineStatus,
  updatePipelineOutput,
  deletePipelineSession,
  getResearchSections,
  listSectors,
} from '@/lib/pipeline-api';
import type { PipelineStatus } from '@/types/pipeline';

export function usePipelineSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['pipeline-session', sessionId],
    queryFn: () => getPipelineSession(sessionId!),
    enabled: !!sessionId,
  });
}

export function usePipelineSessions(options?: {
  createdBy?: string;
  pipelineStatus?: PipelineStatus;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['pipeline-sessions', options],
    queryFn: () => listPipelineSessions(options),
  });
}

export function useResearchSections(
  sessionId: string | null,
  stage?: 'stage0' | 'stage1' | 'stage2'
) {
  return useQuery({
    queryKey: ['research-sections', sessionId, stage],
    queryFn: () => getResearchSections(sessionId!, stage),
    enabled: !!sessionId,
  });
}

export function useSectors() {
  return useQuery({
    queryKey: ['sectors'],
    queryFn: listSectors,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useCreatePipelineSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPipelineSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
    },
  });
}

export function useTransitionPipelineStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      newStatus,
      currentStatus,
    }: {
      sessionId: string;
      newStatus: PipelineStatus;
      currentStatus?: PipelineStatus;
    }) => transitionPipelineStatus(sessionId, newStatus, currentStatus),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-session', data.session_id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
    },
  });
}

export function useUpdatePipelineOutput() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: Parameters<typeof updatePipelineOutput>[1];
    }) => updatePipelineOutput(sessionId, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-session', data.session_id] });
    },
  });
}

export function useDeletePipelineSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePipelineSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
    },
  });
}
