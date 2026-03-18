import { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Download,
  Trash2,
  Folder,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VaultDocument } from '@/types/vault';
import { groupDocumentsByCategory, formatFileSize, getCategoryDisplayName } from '@/types/vault';
import { cn } from '@/lib/utils';

interface FileManagerProps {
  folderId: string;
  folderUrl: string;
  documents: VaultDocument[];
  selectedDocumentIds?: string[];
  onFileSelect?: (fileIds: string[]) => void;
  onFileDelete?: (fileId: string) => void;
}

// Document category section component
function DocumentCategory({
  type,
  documents,
  selectedIds,
  onToggleSelect,
  onDelete,
}: {
  type: VaultDocument['type'];
  documents: VaultDocument[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(documents.length > 0);
  const categoryName = getCategoryDisplayName(type);

  if (documents.length === 0) return null;

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      {/* Category Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-neutral-500" />
          <span className="font-medium text-neutral-900">{categoryName}</span>
          <span className="text-sm text-neutral-500">({documents.length})</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        )}
      </button>

      {/* Documents List */}
      {isExpanded && (
        <div className="divide-y divide-neutral-100">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors',
                selectedIds.has(doc.id) && 'bg-neutral-100'
              )}
            >
              {/* Selection Checkbox */}
              <button
                onClick={() => onToggleSelect(doc.id)}
                className={cn(
                  'flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
                  selectedIds.has(doc.id)
                    ? 'bg-neutral-900 border-neutral-900'
                    : 'border-neutral-300 hover:border-neutral-400'
                )}
              >
                {selectedIds.has(doc.id) && (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                )}
              </button>

              {/* File Icon */}
              <div className="flex-shrink-0">
                <FileText className="h-5 w-5 text-neutral-400" />
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {doc.name}
                </p>
                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-0.5">
                  <span>{formatFileSize(doc.size)}</span>
                  <span>•</span>
                  <span>
                    {new Date(doc.uploadedAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={doc.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View in Google Drive"
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
                <a
                  href={doc.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Download"
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download className="h-4 w-4" />
                  </Button>
                </a>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(doc.id)}
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileManager({
  folderId, // Used for future file operations (upload, delete)
  folderUrl,
  documents,
  selectedDocumentIds = [],
  onFileSelect,
  onFileDelete,
}: FileManagerProps) {
  // Suppress unused variable warning for folderId (needed for future features)
  void folderId;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(selectedDocumentIds)
  );

  const groupedDocs = groupDocumentsByCategory(documents);

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    onFileSelect?.(Array.from(newSelected));
  };

  const totalFiles = documents.length;
  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">
            Research Documents
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            {totalFiles} {totalFiles === 1 ? 'document' : 'documents'} fetched
            {selectedCount > 0 && ` • ${selectedCount} selected for AI context`}
          </p>
        </div>
        <a
          href={folderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-1"
        >
          Open Folder in Drive
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Empty State */}
      {totalFiles === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-lg">
          <FileText className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm">
            No documents found in this vault
          </p>
        </div>
      )}

      {/* Document Categories */}
      {totalFiles > 0 && (
        <div className="space-y-3">
          {(['annual_report', 'investor_presentation', 'concall_transcript', 'broker_report', 'financial_model', 'other'] as const).map(
            (type) => (
              <DocumentCategory
                key={type}
                type={type}
                documents={groupedDocs[type]}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onDelete={onFileDelete}
              />
            )
          )}
        </div>
      )}

      {/* Helper Text */}
      {totalFiles > 0 && (
        <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
          <p className="text-sm text-neutral-700">
            <strong>Tip:</strong> Select documents you want to include in the AI
            context for research generation. Selected documents will be analyzed
            when creating your research report.
          </p>
        </div>
      )}
    </div>
  );
}
