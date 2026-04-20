'use client';

import { useState } from 'react';
import { useAggregateImpact } from '@/hooks/useAggregateImpact';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Customized,
} from 'recharts';

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

const COLORS = {
  gainMore5: '#285E61',
  gainLess5: '#31979599',
  noChange: '#E2E8F0',
  loseLess5: '#9CA3AF',
  loseMore5: '#4B5563',
  positive: '#319795',
  negative: '#4B5563',
};

const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i);

const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };
const TICK_STYLE = { fontFamily: 'Inter, sans-serif', fontSize: 12 };

function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 4,
      padding: '8px 12px',
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
    }}>
      {label && <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1A202C' }}>{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: 0, color: entry.color || '#4A5568' }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}

interface Props {
  triggered: boolean;
}

export default function AggregateImpact({ triggered }: Props) {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [scoringMode, setScoringMode] = useState<'static' | 'dynamic'>('static');
  const { data, isLoading, error } = useAggregateImpact(triggered, scoringMode, selectedYear);
  const [activeSection, setActiveSection] = useState<'fiscal' | 'distributional' | 'winners' | 'poverty' | 'inequality'>('fiscal');
  const [distMode, setDistMode] = useState<'relative' | 'absolute'>('relative');

  if (!triggered) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading national impact data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error loading national impact</h3>
        <p className="text-red-700 font-medium mb-2">{errorMessage}</p>
        <p className="text-sm text-gray-600 mt-4">
          Ensure precomputed data exists. Run: <code>python scripts/pipeline.py</code>
        </p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) =>
    `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatCurrencyWithSign = (value: number) => {
    const formatted = formatCurrency(value);
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };
  const formatBillions = (value: number) => {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    return formatCurrencyWithSign(value);
  };
  const formatGini = (value: number) => value.toFixed(3);
  const formatShare = (value: number) => `${(value * 100).toFixed(1)}%`;
  const hasInequality =
    data.inequality.gini.baseline !== null &&
    data.inequality.gini.reform !== null &&
    data.inequality.gini.change !== null;

  const sections = [
    { key: 'fiscal' as const, label: 'Budgetary impact' },
    { key: 'distributional' as const, label: 'Distributional impact' },
    { key: 'winners' as const, label: 'Winners & losers' },
    { key: 'poverty' as const, label: 'Poverty impact' },
    { key: 'inequality' as const, label: 'Inequality' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">National impact analysis</h2>

      {/* Scoring mode toggle */}
      <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-gray-500">
            {scoringMode === 'static'
              ? 'Static scoring: does not capture behavioral responses such as changes in labor supply.'
              : 'Dynamic scoring: incorporates CBO labor supply elasticities (income: -0.05, substitution: 0.25).'}
          </p>
          <div className="flex gap-1">
            {(['static', 'dynamic'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setScoringMode(mode)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  scoringMode === mode
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {mode === 'static' ? 'Static' : 'Dynamic'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Year selector */}
      <div>
        <p className="text-sm text-gray-500 mb-2">Select year</p>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {YEARS.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedYear === year
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeSection === s.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ===== FISCAL IMPACT ===== */}
      {activeSection === 'fiscal' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Federal tax revenue', value: data.budget.federal_tax_revenue_impact },
              { label: 'State/local tax revenue', value: data.budget.state_tax_revenue_impact },
              { label: 'Benefit spending', value: -data.budget.benefit_spending_impact },
              { label: 'Net budgetary impact', value: data.budget.budgetary_impact },
            ].map(({ label, value }) => (
              <div
                key={label}
                className={`rounded-lg p-6 border ${
                  value >= 0 ? 'bg-green-50 border-success' : 'bg-red-50 border-red-300'
                }`}
              >
                <p className="text-sm text-gray-700 mb-2">{label} ({selectedYear})</p>
                <p className={`text-3xl font-bold ${
                  value >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatBillions(value)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Federal tax revenue', value: data.ten_year_budget.federal_tax_revenue_impact },
              { label: 'State/local tax revenue', value: data.ten_year_budget.state_tax_revenue_impact },
              { label: 'Benefit spending', value: -data.ten_year_budget.benefit_spending_impact },
              { label: 'Net budgetary impact', value: data.ten_year_budget.budgetary_impact },
            ].map(({ label, value }) => (
              <div
                key={label}
                className={`rounded-lg p-6 border ${
                  value >= 0 ? 'bg-green-50 border-success' : 'bg-red-50 border-red-300'
                }`}
              >
                <p className="text-sm text-gray-700 mb-2">{label} (2026-2035)</p>
                <p className={`text-3xl font-bold ${
                  value >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatBillions(value)}
                </p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Impact by income bracket</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left px-4 py-3 font-medium text-gray-900">Income bracket</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Affected households</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Total impact</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Average impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.by_income_bracket.map((bracket, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">{bracket.bracket}</td>
                      <td className="px-4 py-3 text-gray-700 text-right">{Math.round(bracket.beneficiaries).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-right"
                        style={{ color: bracket.total_cost >= 0 ? COLORS.positive : COLORS.negative }}>
                        {formatBillions(bracket.total_cost)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-right"
                        style={{ color: bracket.avg_benefit >= 0 ? COLORS.positive : COLORS.negative }}>
                        {formatCurrencyWithSign(bracket.avg_benefit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'inequality' && (
        <div className="space-y-6">
          {!hasInequality ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
              <h3 className="text-lg font-semibold text-amber-900 mb-2">Inequality data unavailable</h3>
              <p className="text-sm text-amber-800">
                Regenerate the aggregate CSVs with <code>python scripts/pipeline.py --fresh</code> to populate Gini outputs.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Baseline Gini', value: data.inequality.gini.baseline! },
                { label: 'Reform Gini', value: data.inequality.gini.reform! },
                { label: 'Change in Gini', value: data.inequality.gini.change! },
                { label: 'Baseline Top 10% Share', value: data.inequality.top_10_pct_share.baseline, type: 'share' as const },
                { label: 'Reform Top 10% Share', value: data.inequality.top_10_pct_share.reform, type: 'share' as const },
                { label: 'Baseline Top 1% Share', value: data.inequality.top_1_pct_share.baseline, type: 'share' as const },
                { label: 'Reform Top 1% Share', value: data.inequality.top_1_pct_share.reform, type: 'share' as const },
              ]
                .filter(
                  (item): item is { label: string; value: number; type?: 'share' } =>
                    item.value !== null
                )
                .map(({ label, value }) => (
                <div key={label} className="rounded-lg p-6 border bg-gray-50 border-gray-200">
                  <p className="text-sm text-gray-700 mb-2">{label} ({selectedYear})</p>
                  <p className={`text-3xl font-bold ${
                    label === 'Change in Gini'
                      ? value <= 0 ? 'text-green-600' : 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {label === 'Change in Gini'
                      ? `${value >= 0 ? '+' : ''}${formatGini(value)}`
                      : label.includes('Share')
                        ? formatShare(value!)
                        : formatGini(value!)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== DISTRIBUTIONAL IMPACT ===== */}
      {activeSection === 'distributional' && (() => {
        const isRelative = distMode === 'relative';
        const rawValues = isRelative
          ? Object.values(data.decile.relative).map(v => v * 100)
          : Object.values(data.decile.average);
        const maxAbs = Math.max(...rawValues.map(Math.abs));
        const niceStep = (() => {
          const rough = maxAbs / 3;
          const mag = Math.pow(10, Math.floor(Math.log10(rough)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const niceMax = Math.ceil(maxAbs / niceStep) * niceStep;
        const symmetricDomain = [-niceMax, niceMax];
        const niceTicks = Array.from(
          { length: Math.round(2 * niceMax / niceStep) + 1 },
          (_, i) => -niceMax + i * niceStep,
        );
        const chartData = isRelative
          ? Object.entries(data.decile.relative).map(([k, v]) => ({ decile: k, value: v * 100 }))
          : Object.entries(data.decile.average).map(([k, v]) => ({ decile: k, value: v }));

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Impact by income decile</h3>
              <div className="flex gap-1">
                {(['relative', 'absolute'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDistMode(mode)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      distMode === mode
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {mode === 'relative' ? 'Relative' : 'Absolute'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-gray-700">
              {isRelative
                ? 'Change in household net income as a percentage of baseline income, by decile.'
                : 'Average change in household net income in dollars, by decile.'}
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="decile" tick={TICK_STYLE} stroke="#A0AEC0" label={{ value: 'Income decile', position: 'insideBottom', offset: -15, style: { ...TICK_STYLE, fill: '#718096' } }} />
                <YAxis
                  domain={symmetricDomain}
                  ticks={niceTicks}
                  tickFormatter={isRelative
                    ? (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
                    : formatCurrencyWithSign}
                  tick={TICK_STYLE}
                  stroke="#A0AEC0"
                  width={isRelative ? 60 : 80}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip formatter={isRelative
                  ? (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                  : (v) => formatCurrencyWithSign(v)} />}
                />
                <ReferenceLine y={0} stroke="#A0AEC0" strokeWidth={1} />
                <Bar dataKey="value" name={isRelative ? 'Relative impact (% of income)' : 'Average impact'} radius={[2, 2, 0, 0]}>
                  {rawValues.map((v, i) => (
                    <Cell key={i} fill={v >= 0 ? COLORS.positive : COLORS.negative} />
                  ))}
                </Bar>
                <Customized component={ChartWatermark} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ===== WINNERS & LOSERS ===== */}
      {activeSection === 'winners' && (() => {
        const intra = data.intra_decile;
        const categories = [
          { key: 'gain_more_than_5pct', label: 'Gain more than 5%', color: COLORS.gainMore5 },
          { key: 'gain_less_than_5pct', label: 'Gain less than 5%', color: COLORS.gainLess5 },
          { key: 'no_change', label: 'No change', color: COLORS.noChange },
          { key: 'lose_less_than_5pct', label: 'Lose less than 5%', color: COLORS.loseLess5 },
          { key: 'lose_more_than_5pct', label: 'Lose more than 5%', color: COLORS.loseMore5 },
        ] as const;
        const winnersShare =
          (intra.all.gain_more_than_5pct + intra.all.gain_less_than_5pct) * 100;
        const losersShare =
          (intra.all.lose_more_than_5pct + intra.all.lose_less_than_5pct) * 100;
        const noChangeShare = intra.all.no_change * 100;

        const stackedData = [
          {
            label: 'All',
            ...Object.fromEntries(categories.map(c => [c.key, (intra.all[c.key] * 100)])),
          },
          ...Array.from({ length: 10 }, (_, i) => {
            const d = 10 - i;
            return {
              label: `${d}`,
              ...Object.fromEntries(categories.map(c => [c.key, (intra.deciles[c.key][d - 1] * 100)])),
            };
          }),
        ];

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-6 border" style={{ backgroundColor: '#F0FDFA', borderColor: COLORS.positive }}>
                <p className="text-sm text-gray-700 mb-2">Winners</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.gainMore5 }}>{winnersShare.toFixed(1)}%</p>
                <p className="text-xs text-gray-600 mt-1">{Math.round(data.winners).toLocaleString()} households gain</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-300">
                <p className="text-sm text-gray-700 mb-2">No Change</p>
                <p className="text-3xl font-bold text-gray-600">
                  {noChangeShare.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg p-6 border" style={{ backgroundColor: '#F9FAFB', borderColor: COLORS.loseMore5 }}>
                <p className="text-sm text-gray-700 mb-2">Losers</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.loseMore5 }}>{losersShare.toFixed(1)}%</p>
                <p className="text-xs text-gray-600 mt-1">{Math.round(data.losers).toLocaleString()} households lose</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Winners & losers by income decile</h3>
              <div>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={stackedData} layout="vertical" stackOffset="expand" barSize={24} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis type="number" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tick={TICK_STYLE} stroke="#A0AEC0" />
                    <YAxis type="category" dataKey="label" tick={TICK_STYLE} stroke="#A0AEC0" width={40} />
                    <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
                    {categories.map((c) => (
                      <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} />
                    ))}
                    <Customized component={ChartWatermark} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4A5568' }}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== POVERTY IMPACT ===== */}
      {activeSection === 'poverty' && (() => {
        const pov = data.poverty;
        const povertyMetrics = [
          { label: 'Overall Poverty', baseline: pov.poverty.all.baseline, reform: pov.poverty.all.reform },
          { label: 'Child Poverty', baseline: pov.poverty.child.baseline, reform: pov.poverty.child.reform },
          { label: 'Deep Poverty', baseline: pov.deep_poverty.all.baseline, reform: pov.deep_poverty.all.reform },
          { label: 'Deep Child Poverty', baseline: pov.deep_poverty.child.baseline, reform: pov.deep_poverty.child.reform },
        ];

        const chartData = povertyMetrics.map((m) => ({
          ...m,
          ppChange: (m.reform - m.baseline) * 100,
        }));

        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Change in poverty rates (pp)</h3>
              <div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={TICK_STYLE} stroke="#A0AEC0" />
                    <YAxis tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`} tick={TICK_STYLE} stroke="#A0AEC0" width={70} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip formatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`} />} />
                    <ReferenceLine y={0} stroke="#A0AEC0" strokeWidth={1} />
                    <Bar dataKey="ppChange" name="Change (pp)" radius={[2, 2, 0, 0]}>
                      {chartData.map((m, i) => (
                        <Cell key={i} fill={m.ppChange <= 0 ? COLORS.positive : '#EF4444'} />
                      ))}
                    </Bar>
                    <Customized component={ChartWatermark} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
