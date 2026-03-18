// Application constants for Tikona Research OS

export const APP_NAME = 'Tikona Research OS';
export const COMPANY_NAME = 'Tikona Capital';

// Admin emails — these users get the admin portal; everyone else is a customer
export const ADMIN_EMAILS = [
  'tikonacapital@gmail.com',
] as const;

// Pagination defaults
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

// Recommendation badge colors (BUY/SELL/HOLD)
export const RECOMMENDATION_COLORS: Record<string, string> = {
  BUY: 'bg-green-50 text-green-700 border-green-200',
  SELL: 'bg-red-50 text-red-700 border-red-200',
  HOLD: 'bg-amber-50 text-amber-700 border-amber-200',
} as const;

// Default fallback for unknown recommendations
export const RECOMMENDATION_DEFAULT = 'bg-neutral-50 text-neutral-600 border-neutral-200';

// The 7 default report section keys (have dedicated DB columns)
export const DEFAULT_SECTION_KEYS = [
  'company_background', 'business_model', 'management_analysis',
  'industry_overview', 'industry_tailwinds', 'demand_drivers', 'industry_risks',
] as const;

// Audit log actions
export const AUDIT_ACTIONS = {
  ADDED_COMPANY: 'ADDED_COMPANY',
  UPDATED_COMPANY: 'UPDATED_COMPANY',
  DELETED_COMPANY: 'DELETED_COMPANY',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  VAULT_CREATED: 'VAULT_CREATED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_DELETED: 'SESSION_DELETED',
} as const;
