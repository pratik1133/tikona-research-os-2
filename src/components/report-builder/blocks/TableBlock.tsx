import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { TableContent } from '@/types/report-builder';

interface Props {
  content: TableContent;
  onChange: (content: TableContent) => void;
}

export default function TableBlock({ content, onChange }: Props) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);

  const updateCell = (row: number, col: number, value: string) => {
    const rows = content.rows || [];
    const newRows = rows.map((r, ri) =>
      ri === row ? (r || []).map((c, ci) => (ci === col ? value : c)) : r
    );
    onChange({ ...content, rows: newRows });
  };

  const updateHeader = (col: number, value: string) => {
    const newHeaders = content.headers.map((h, i) => (i === col ? value : h));
    onChange({ ...content, headers: newHeaders });
  };

  const addRow = () => {
    const headers = content.headers || [];
    const rows = content.rows || [];
    const newRow = headers.map(() => '');
    onChange({ ...content, rows: [...rows, newRow] });
  };

  const removeRow = (index: number) => {
    if (content.rows.length <= 1) return;
    onChange({ ...content, rows: content.rows.filter((_, i) => i !== index) });
  };

  const addColumn = () => {
    const headers = content.headers || [];
    const rows = content.rows || [];
    onChange({
      ...content,
      headers: [...headers, `Col ${headers.length + 1}`],
      rows: rows.map((r) => [...(r || []), '']),
    });
  };

  const removeColumn = (index: number) => {
    const headers = content.headers || [];
    const rows = content.rows || [];
    if (headers.length <= 1) return;
    onChange({
      ...content,
      headers: headers.filter((_, i) => i !== index),
      rows: rows.map((r) => (r || []).filter((_, i) => i !== index)),
    });
  };

  return (
    <div className="group/table relative">
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-800 text-white">
              {(content.headers || []).map((header, ci) => (
                <th
                  key={ci}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap relative"
                >
                  {editingHeader === ci ? (
                    <input
                      autoFocus
                      value={header}
                      onChange={(e) => updateHeader(ci, e.target.value)}
                      onBlur={() => setEditingHeader(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingHeader(null)}
                      className="bg-transparent border-b border-white/50 text-white text-xs font-semibold outline-none w-full"
                    />
                  ) : (
                    <span
                      onClick={() => setEditingHeader(ci)}
                      className="cursor-text hover:text-accent-200 transition-colors"
                    >
                      {header}
                    </span>
                  )}
                  <button
                    onClick={() => removeColumn(ci)}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white items-center justify-center text-xs opacity-0 group-hover/table:opacity-100 transition-opacity hidden group-hover/table:flex"
                    title="Remove column"
                  >
                    <Minus className="h-2.5 w-2.5" />
                  </button>
                </th>
              ))}
              <th className="px-1 py-3 w-8 opacity-0 group-hover/table:opacity-100 transition-opacity">
                <button
                  onClick={addColumn}
                  className="h-5 w-5 rounded bg-neutral-600 text-white flex items-center justify-center hover:bg-neutral-500"
                  title="Add column"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {(content.rows || []).map((row, ri) => (
              <tr
                key={ri}
                className={`border-b border-neutral-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'} hover:bg-accent-50/30 transition-colors group/row`}
              >
                {(row || []).map((cell, ci) => (
                  <td key={ci} className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                    {editingCell?.row === ri && editingCell?.col === ci ? (
                      <input
                        autoFocus
                        value={cell}
                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingCell(null);
                          if (e.key === 'Tab') {
                            e.preventDefault();
                            const nextCol = ci + 1 < row.length ? ci + 1 : 0;
                            const nextRow = nextCol === 0 ? ri + 1 : ri;
                            if (nextRow < content.rows.length) {
                              setEditingCell({ row: nextRow, col: nextCol });
                            } else {
                              setEditingCell(null);
                            }
                          }
                        }}
                        className="bg-transparent border-b border-accent-400 outline-none text-sm w-full text-neutral-800"
                      />
                    ) : (
                      <span
                        onClick={() => setEditingCell({ row: ri, col: ci })}
                        className="cursor-text hover:text-accent-700 transition-colors inline-block min-w-[2rem]"
                      >
                        {cell || <span className="text-neutral-300">—</span>}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-1 py-3 w-8 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <button
                    onClick={() => removeRow(ri)}
                    className="h-5 w-5 rounded bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200"
                    title="Remove row"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="mt-2 flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-600 transition-colors opacity-0 group-hover/table:opacity-100"
      >
        <Plus className="h-3 w-3" /> Add row
      </button>
    </div>
  );
}
