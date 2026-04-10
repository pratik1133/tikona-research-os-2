import { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ChartContent } from '@/types/report-builder';

interface Props {
  content: ChartContent;
  onChange: (content: ChartContent) => void;
}

const COLORS = ['#4f46e5', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

export default function ChartBlock({ content, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  // Transform data for Recharts safely handling malformed LLM JSON
  const labels = Array.isArray(content.labels) ? content.labels : [];
  const datasets = Array.isArray(content.datasets) ? content.datasets : [];

  const chartData = labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    datasets.forEach((ds) => {
      point[ds.label] = (ds.data && ds.data[i]) ?? 0;
    });
    return point;
  });

  const pieData = labels.map((label, i) => ({
    name: label,
    value: (datasets[0]?.data && datasets[0]?.data[i]) ?? 0,
  }));

  const toggleType = () => {
    const types: Array<'bar' | 'line' | 'pie'> = ['bar', 'line', 'pie'];
    const idx = types.indexOf(content.chartType);
    onChange({ ...content, chartType: types[(idx + 1) % types.length] });
  };

  return (
    <div className="group/chart">
      {/* Title + controls */}
      <div className="flex items-center justify-between mb-3">
        {editing ? (
          <input
            autoFocus
            value={content.title}
            onChange={(e) => onChange({ ...content, title: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
            className="text-sm font-semibold text-neutral-800 bg-transparent border-b border-accent-400 outline-none"
          />
        ) : (
          <h4
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-neutral-800 cursor-text hover:text-accent-700 transition-colors"
          >
            {content.title}
          </h4>
        )}
        <button
          onClick={toggleType}
          className="text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 transition-colors opacity-0 group-hover/chart:opacity-100 font-medium"
        >
          Switch to {content.chartType === 'bar' ? 'Line' : content.chartType === 'line' ? 'Pie' : 'Bar'}
        </button>
      </div>

      {/* Chart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {content.chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#737373' }} />
              <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((ds, i) => (
                <Bar key={ds.label || i} dataKey={ds.label || `series_${i}`} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : content.chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#737373' }} />
              <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {datasets.map((ds, i) => (
                <Line key={ds.label || i} type="monotone" dataKey={ds.label || `series_${i}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
