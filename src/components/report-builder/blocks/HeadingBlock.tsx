import { useState, useRef, useEffect } from 'react';
import type { HeadingContent } from '@/types/report-builder';

interface Props {
  content: HeadingContent;
  onChange: (content: HeadingContent) => void;
}

export default function HeadingBlock({ content, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const Tag = content.level === 1 ? 'h1' : content.level === 2 ? 'h2' : 'h3';
  const sizeClass =
    content.level === 1
      ? 'text-2xl font-bold'
      : content.level === 2
        ? 'text-xl font-semibold'
        : 'text-lg font-semibold';

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={content.text}
        onChange={(e) => onChange({ ...content, text: e.target.value })}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
        className={`w-full border-0 border-b-2 border-accent-400 bg-transparent outline-none text-neutral-900 ${sizeClass} pb-1`}
      />
    );
  }

  return (
    <Tag
      onClick={() => setEditing(true)}
      className={`${sizeClass} text-neutral-900 cursor-text hover:text-accent-700 transition-colors border-b border-transparent hover:border-neutral-200 pb-1`}
    >
      {content.text || 'Click to edit heading...'}
    </Tag>
  );
}
