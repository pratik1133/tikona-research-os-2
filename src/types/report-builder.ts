// ========================
// Block Types
// ========================

export type BlockType = 'heading' | 'text' | 'table' | 'chart' | 'sentiment' | 'keyMetrics';

export interface HeadingContent {
  text: string;
  level: 1 | 2 | 3;
}

export interface TextContent {
  markdown: string;
}

export interface TableContent {
  headers: string[];
  rows: string[][];
}

export interface ChartContent {
  chartType: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

export interface SentimentContent {
  sentiment: 'positive' | 'negative' | 'neutral';
  title: string;
  text: string;
}

export interface KeyMetricsContent {
  metrics: { label: string; value: string; subtext?: string }[];
}

export type BlockContent =
  | HeadingContent
  | TextContent
  | TableContent
  | ChartContent
  | SentimentContent
  | KeyMetricsContent;

export interface ReportBlock {
  id: string;
  type: BlockType;
  content: BlockContent;
  questionId?: string;
}

// ========================
// Template Types
// ========================

export type AnswerFormat = 'text' | 'table' | 'chart' | 'sentiment';

export interface TemplateQuestion {
  id: string;
  heading?: string;
  question: string;
  guidance?: string;
  sourcePriorities?: string[][];
  answerFormats: AnswerFormat[];
  sortOrder: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  sectors: string[];
  questions: TemplateQuestion[];
  isDefault?: boolean;
  createdAt: string;
}

// ========================
// Generated Report
// ========================

export interface GeneratedReport {
  id: string;
  name: string;
  companyName: string;
  nseSymbol: string;
  sector: string;
  templateId: string;
  templateName: string;
  blocks: ReportBlock[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

// ========================
// Generation State
// ========================

export interface GenerationProgress {
  currentQuestion: number;
  totalQuestions: number;
  currentHeading: string;
  status: 'idle' | 'generating' | 'done' | 'error';
  error?: string;
}
