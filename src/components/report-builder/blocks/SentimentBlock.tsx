import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SentimentContent } from '@/types/report-builder';

interface Props {
  content: SentimentContent;
  onChange: (content: SentimentContent) => void;
}

const SENTIMENT_STYLES = {
  positive: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    title: 'text-green-800',
    text: 'text-green-700',
    icon: TrendingUp,
    iconColor: 'text-green-500',
    badge: 'bg-green-100 text-green-700',
  },
  negative: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    title: 'text-red-800',
    text: 'text-red-700',
    icon: TrendingDown,
    iconColor: 'text-red-500',
    badge: 'bg-red-100 text-red-700',
  },
  neutral: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    title: 'text-amber-800',
    text: 'text-amber-700',
    icon: Minus,
    iconColor: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
};

export default function SentimentBlock({ content, onChange }: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingText, setEditingText] = useState(false);
  
  const validSentiment = ['positive', 'negative', 'neutral'].includes(content?.sentiment) 
    ? content.sentiment 
    : 'neutral';
    
  const s = SENTIMENT_STYLES[validSentiment as 'positive' | 'negative' | 'neutral'];
  const Icon = s.icon;

  const cycleSentiment = () => {
    const order: Array<'positive' | 'negative' | 'neutral'> = ['positive', 'negative', 'neutral'];
    const idx = order.indexOf(validSentiment as 'positive' | 'negative' | 'neutral');
    onChange({ ...content, sentiment: order[(idx + 1) % order.length] });
  };

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 ${s.iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {editingTitle ? (
              <input
                autoFocus
                value={content.title}
                onChange={(e) => onChange({ ...content, title: e.target.value })}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                className={`bg-transparent border-b border-current outline-none text-sm font-semibold ${s.title} flex-1`}
              />
            ) : (
              <h4
                onClick={() => setEditingTitle(true)}
                className={`text-sm font-semibold ${s.title} cursor-text`}
              >
                {content.title}
              </h4>
            )}
            <button
              onClick={cycleSentiment}
              className={`text-xs px-2 py-0.5 rounded-md font-medium ${s.badge}} hover:opacity-80 transition-opacity`}
            >
              {content.sentiment.charAt(0).toUpperCase() + content.sentiment.slice(1)}
            </button>
          </div>
          {editingText ? (
            <textarea
              autoFocus
              value={content.text}
              onChange={(e) => onChange({ ...content, text: e.target.value })}
              onBlur={() => setEditingText(false)}
              className={`w-full bg-transparent border-b border-current outline-none text-sm ${s.text} resize-y min-h-[60px]`}
            />
          ) : (
            <p
              onClick={() => setEditingText(true)}
              className={`text-sm leading-relaxed ${s.text} cursor-text`}
            >
              {content.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
