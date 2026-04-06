'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Customized,
} from 'recharts';
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import type { HouseholdRequest, HouseholdImpactResponse } from '@/lib/types';

interface Props {
  request: HouseholdRequest | null;
  triggered: boolean;
  maxEarnings?: number;
  exampleId?: string | null;
}

type ChartMode = 'change' | 'net_income' | 'mtr';

const CHART_MODES: { key: ChartMode; label: string }[] = [
  { key: 'change', label: 'Net income change' },
  { key: 'net_income', label: 'Net income curves' },
  { key: 'mtr', label: 'Marginal tax rates' },
];

export default function ImpactAnalysis({ request, triggered, maxEarnings, exampleId }: Props) {
  const { data, isLoading, error } = useHouseholdImpact(request, triggered, exampleId ?? undefined);
  const [chartMode, setChartMode] = useState<ChartMode>('change');

  if (!triggered) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Calculating impact...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Calculating Impact</h3>
        <p className="text-red-700">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('en-US')}`;
  const formatIncome = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${(value / 1000).toFixed(0)}k`;
  };
  const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`;

  const benefitData = data.benefit_at_income;
  const xMax = maxEarnings ?? data.x_axis_max;
  const income = request?.income ?? 0;
  const year = request?.year ?? 2026;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-primary">Impact Analysis</h2>

      {/* Personal impact summary */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4">Your Personal Impact ({year})</h3>
        <p className="text-gray-600 mb-4">
          Based on your employment income of <strong>{formatCurrency(income)}</strong>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg p-5 border bg-gray-50 border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Baseline net income</p>
            <p className="text-2xl font-bold text-gray-800">{formatCurrency(benefitData.baseline)}</p>
          </div>
          <div className="rounded-lg p-5 border bg-gray-50 border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Reform net income</p>
            <p className="text-2xl font-bold text-gray-800">{formatCurrency(benefitData.reform)}</p>
          </div>
          <div
            className={`rounded-lg p-5 border ${
              benefitData.difference > 0
                ? 'bg-green-50 border-success'
                : benefitData.difference < 0
                ? 'bg-red-50 border-red-300'
                : 'bg-gray-50 border-gray-300'
            }`}
          >
            <p className="text-sm text-gray-700 mb-1">Change in net income</p>
            <p
              className={`text-2xl font-bold ${
                benefitData.difference > 0
                  ? 'text-green-600'
                  : benefitData.difference < 0
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`}
            >
              {benefitData.difference !== 0
                ? `${benefitData.difference > 0 ? '+' : ''}${formatCurrency(benefitData.difference)}/year`
                : '$0/year'}
            </p>
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Chart mode selector */}
      <div className="flex flex-wrap gap-1.5">
        {CHART_MODES.map((mode) => (
          <button
            key={mode.key}
            onClick={() => setChartMode(mode.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              chartMode === mode.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      {chartMode === 'change' && (
        <ChangeChart data={data} xMax={xMax} income={income} year={year} />
      )}
      {chartMode === 'net_income' && (
        <NetIncomeChart data={data} xMax={xMax} income={income} year={year} />
      )}
      {chartMode === 'mtr' && (
        <MTRChart data={data} xMax={xMax} income={income} year={year} />
      )}
    </div>
  );
}

/* ===== Chart subcomponents ===== */

interface ChartProps {
  data: HouseholdImpactResponse;
  xMax: number;
  income: number;
  year: number;
}

const TICK_STYLE = { fontFamily: 'Inter, sans-serif', fontSize: 12 };
const BASELINE_COLOR = '#6B7280';
const REFORM_COLOR = '#319795';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartWatermark(props: any) {
  const { width, height } = props;
  if (!width || !height) return null;
  const logoW = 120;
  const logoH = 120;
  return (
    <image
      href="/policyengine-logo.png"
      x={width - logoW - 10}
      y={height - logoH - 10}
      width={logoW}
      height={logoH}
      opacity={0.08}
    />
  );
}

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatIncome(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${(value / 1000).toFixed(0)}k`;
}

/** Change in net income chart (original) */
function ChangeChart({ data, xMax, income, year }: ChartProps) {
  const chartData = data.income_range
    .map((inc, i) => ({ income: inc, benefit: data.net_income_change[i] }))
    .filter((d) => d.income <= xMax);

  const diff = data.benefit_at_income.difference;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Change in Net Income from EITC/CTC Reform ({year})
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ left: 30, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="income" type="number" tickFormatter={formatIncome} stroke="#666"
            domain={[0, xMax]} allowDecimals={false} allowDataOverflow={false}
          />
          <YAxis tickFormatter={formatCurrency} stroke="#666" width={80} allowDecimals={false}
            label={{ value: 'Change in Net Income', angle: -90, position: 'left', offset: 0, style: { fill: '#666', fontSize: 12, textAnchor: 'middle' } }}
          />
          <Tooltip formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(value: number) => `Employment Income: ${formatCurrency(value)}`}
          />
          <ReferenceLine y={0} stroke="#666" strokeWidth={2} />
          <Line type="monotone" dataKey="benefit" stroke={REFORM_COLOR} strokeWidth={3}
            name="Change in Net Income" dot={false}
          />
          {income <= xMax && (
            <>
              <ReferenceLine x={income} stroke="#374151" strokeDasharray="4 4" strokeWidth={1} />
              <ReferenceDot x={income} y={diff} r={6} fill={REFORM_COLOR} stroke="#fff" strokeWidth={2} />
            </>
          )}
          <Customized component={ChartWatermark} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Net income curves: baseline vs reform */
function NetIncomeChart({ data, xMax, income, year }: ChartProps) {
  const chartData = data.income_range
    .map((inc, i) => ({
      income: inc,
      baseline: data.baseline_net_income[i],
      reform: data.reform_net_income[i],
    }))
    .filter((d) => d.income <= xMax);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Net Income: Current Law vs. Reform ({year})
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ left: 30, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="income" type="number" tickFormatter={formatIncome} stroke="#666"
            domain={[0, xMax]} allowDecimals={false}
          />
          <YAxis tickFormatter={formatCurrency} stroke="#666" width={80} allowDecimals={false}
            label={{ value: 'Household Net Income', angle: -90, position: 'left', offset: 0, style: { fill: '#666', fontSize: 12, textAnchor: 'middle' } }}
          />
          <Tooltip formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(value: number) => `Employment Income: ${formatCurrency(value)}`}
          />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="baseline" stroke={BASELINE_COLOR} strokeWidth={2}
            name="Current law" dot={false} strokeDasharray="6 3"
          />
          <Line type="monotone" dataKey="reform" stroke={REFORM_COLOR} strokeWidth={2.5}
            name="Aspen ESG reform" dot={false}
          />
          {income <= xMax && (
            <ReferenceLine x={income} stroke="#374151" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: formatCurrency(income), position: 'insideTopRight', fill: '#374151', fontSize: 11, offset: 8 }}
            />
          )}
          <Customized component={ChartWatermark} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Marginal tax rate schedules with benefit cliff detection table */
function MTRChart({ data, xMax, income, year }: ChartProps) {
  const chartData = data.income_range
    .map((inc, i) => ({
      income: inc,
      baseline: Math.max(-2, Math.min(2, data.baseline_mtr[i])),
      reform: Math.max(-2, Math.min(2, data.reform_mtr[i])),
    }))
    .filter((d) => d.income <= xMax);

  // Detect benefit cliffs: income ranges where MTR > 100%
  const findCliffs = (mtr: number[], netIncome: number[]) => {
    const cliffs: { start: number; end: number; peakMTR: number; netLoss: number }[] = [];
    let inCliff = false;
    let cliffStart = 0;
    let peakMTR = 0;

    for (let i = 0; i < mtr.length; i++) {
      if (data.income_range[i] > xMax) break;
      if (mtr[i] > 1 && !inCliff) {
        inCliff = true;
        cliffStart = data.income_range[i];
        peakMTR = mtr[i];
      } else if (mtr[i] > 1 && inCliff) {
        peakMTR = Math.max(peakMTR, mtr[i]);
      } else if (mtr[i] <= 1 && inCliff) {
        inCliff = false;
        const startIdx = data.income_range.indexOf(cliffStart);
        cliffs.push({
          start: cliffStart,
          end: data.income_range[i],
          peakMTR,
          netLoss: netIncome[startIdx] - netIncome[i],
        });
      }
    }
    return cliffs;
  };

  const baselineCliffs = findCliffs(data.baseline_mtr, data.baseline_net_income);
  const reformCliffs = findCliffs(data.reform_mtr, data.reform_net_income);
  const hasCliffs = baselineCliffs.length > 0 || reformCliffs.length > 0;

  const CliffTable = ({ cliffs, label, color }: { cliffs: typeof baselineCliffs; label: string; color: string }) => (
    cliffs.length > 0 ? (
      <div>
        <h4 className="text-sm font-semibold mb-2" style={{ color }}>{label}</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left px-3 py-2 font-medium text-gray-700">Income range</th>
              <th className="text-right px-3 py-2 font-medium text-gray-700">Peak MTR</th>
              <th className="text-right px-3 py-2 font-medium text-gray-700">Net income loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cliffs.map((c, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-gray-900">{formatCurrency(c.start)} – {formatCurrency(c.end)}</td>
                <td className="px-3 py-2 text-right text-red-600 font-medium">{(c.peakMTR * 100).toFixed(0)}%</td>
                <td className="px-3 py-2 text-right text-red-600 font-medium">–{formatCurrency(c.netLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-sm text-gray-500">{label}: No benefit cliffs detected.</p>
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-800">
          Marginal Tax Rate Schedule ({year})
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          The effective marginal tax rate on each additional dollar earned, accounting for taxes and benefit phase-outs.
          Values are clamped to the -200% to 200% range.
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ left: 30, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="income" type="number" tickFormatter={formatIncome} stroke="#666"
              domain={[0, xMax]} allowDecimals={false}
            />
            <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} stroke="#666" width={60}
              domain={[-2, 2]}
              label={{ value: 'Marginal Tax Rate', angle: -90, position: 'left', offset: 0, style: { fill: '#666', fontSize: 12, textAnchor: 'middle' } }}
            />
            <Tooltip formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
              labelFormatter={(value: number) => `Employment Income: ${formatCurrency(value)}`}
            />
            <Legend verticalAlign="top" />
            <ReferenceLine y={0} stroke="#e0e0e0" strokeWidth={1} />
            <Line type="monotone" dataKey="baseline" stroke={BASELINE_COLOR} strokeWidth={2}
              name="Current law" dot={false} strokeDasharray="6 3"
            />
            <Line type="monotone" dataKey="reform" stroke={REFORM_COLOR} strokeWidth={2.5}
              name="Aspen ESG reform" dot={false}
            />
            {income <= xMax && (
              <ReferenceLine x={income} stroke="#374151" strokeDasharray="4 4" strokeWidth={1} />
            )}
            <Customized component={ChartWatermark} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Benefit cliff detection */}
      {hasCliffs && (
        <div>
          <h4 className="text-base font-semibold text-gray-800 mb-1">Benefit cliffs detected</h4>
          <p className="text-sm text-gray-500 mb-4">
            Income ranges where the effective marginal tax rate exceeds 100%, meaning earning more reduces net income.
            These are typically caused by sharp eligibility cutoffs in programs like Head Start, SNAP, or housing subsidies.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CliffTable cliffs={baselineCliffs} label="Current law" color={BASELINE_COLOR} />
            <CliffTable cliffs={reformCliffs} label="Aspen ESG reform" color={REFORM_COLOR} />
          </div>
        </div>
      )}
    </div>
  );
}
