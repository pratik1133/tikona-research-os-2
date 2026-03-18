// Types for Google Drive vault documents and API responses

// Google Drive API file object (simplified - only fields we need)
export interface DriveFile {
  kind: string;
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink: string;
  iconLink?: string;
  size: string; // Note: size is string in Drive API
  createdTime: string;
  modifiedTime: string;
  parents: string[];
}

// Our normalized document type for UI
export interface VaultDocument {
  id: string;
  name: string;
  viewUrl: string; // webViewLink
  downloadUrl: string; // webContentLink
  type: 'annual_report' | 'investor_presentation' | 'concall_transcript' | 'broker_report' | 'financial_model' | 'other';
  category: string; // Display name: "Annual Report", "Investor Presentation", etc.
  mimeType: string;
  size: number; // Converted to number
  uploadedAt: string; // createdTime
  parentFolderId: string;
}

// n8n webhook response
export interface VaultResponse {
  status: 'success' | 'error';
  folder_link: string;
  folder_id: string;
  files: DriveFile[]; // Array of Google Drive file objects
  message?: string;
}

// Helper function to parse document type from filename
// Filename format: "YYYYMMDD - TICKER - TICKER - Tikonacapital - DOCUMENT_TYPE.pdf"
// Example: "20260127 - RELIANCE - RELIANCE - Tikonacapital - Annual Report.pdf"
export function parseDocumentType(filename: string): VaultDocument['type'] {
  const lowerName = filename.toLowerCase();

  if (lowerName.includes('annual report')) return 'annual_report';
  if (lowerName.includes('investor ppt') || lowerName.includes('investor presentation')) return 'investor_presentation';
  if (lowerName.includes('concall') || lowerName.includes('transcript')) return 'concall_transcript';
  if (lowerName.includes('broker report')) return 'broker_report';
  if (lowerName.includes('financial model')) return 'financial_model';

  return 'other';
}

// Helper function to get display category name
export function getCategoryDisplayName(type: VaultDocument['type']): string {
  const categoryMap: Record<VaultDocument['type'], string> = {
    annual_report: 'Annual Reports',
    investor_presentation: 'Investor Presentations',
    concall_transcript: 'Concall Transcripts',
    broker_report: 'Broker Reports',
    financial_model: 'Financial Models',
    other: 'Other Documents',
  };
  return categoryMap[type];
}

// Convert Drive API file to our VaultDocument format
// Returns null if the file object is invalid (missing required fields)
export function normalizeDriveFile(driveFile: DriveFile): VaultDocument | null {
  // Validate required fields
  if (!driveFile || !driveFile.id) {
    console.warn('[VaultTypes] Invalid DriveFile - missing id:', driveFile?.name || 'unknown');
    return null;
  }

  const type = parseDocumentType(driveFile.name || 'unknown');

  return {
    id: driveFile.id,
    name: driveFile.name || 'Unnamed File',
    viewUrl: driveFile.webViewLink || '',
    downloadUrl: driveFile.webContentLink || '',
    type,
    category: getCategoryDisplayName(type),
    mimeType: driveFile.mimeType || 'application/octet-stream',
    size: parseInt(driveFile.size, 10) || 0,
    uploadedAt: driveFile.createdTime || new Date().toISOString(),
    parentFolderId: driveFile.parents?.[0] || '',
  };
}

// Group documents by category
export function groupDocumentsByCategory(documents: VaultDocument[]): Record<VaultDocument['type'], VaultDocument[]> {
  const grouped: Record<VaultDocument['type'], VaultDocument[]> = {
    annual_report: [],
    investor_presentation: [],
    concall_transcript: [],
    broker_report: [],
    financial_model: [],
    other: [],
  };

  documents.forEach((doc) => {
    grouped[doc.type].push(doc);
  });

  return grouped;
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
