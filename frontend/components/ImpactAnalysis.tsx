'use client';

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
} from 'recharts';
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import type { HouseholdRequest } from '@/lib/types';

interface Props {
  request: HouseholdRequest | null;
  triggered: boolean;
  maxEarnings?: number;
}

export default function ImpactAnalysis({ request, triggered, maxEarnings }: Props) {
  const { data, isLoading, error } = useHouseholdImpact(request, triggered);

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

  const benefitData = data.benefit_at_income;

  const xMax = maxEarnings ?? data.x_axis_max;
  const chartData = data.income_range
    .map((inc, i) => ({
      income: inc,
      benefit: data.net_income_change[i],
    }))
    .filter((d) => d.income <= xMax);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-primary">Impact Analysis</h2>

      {/* Your Personal Impact */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4">Your Personal Impact ({request?.year ?? 2026})</h3>
        <p className="text-gray-600 mb-4">
          Based on your employment income of <strong>{formatCurrency(request?.income ?? 0)}</strong>
        </p>

        <div
          className={`rounded-lg p-6 border ${
            benefitData.difference > 0
              ? 'bg-green-50 border-success'
              : benefitData.difference < 0
              ? 'bg-red-50 border-red-300'
              : 'bg-gray-50 border-gray-300'
          }`}
        >
          <p className="text-sm text-gray-700 mb-2">Change in Net Income</p>
          <p
            className={`text-3xl font-bold ${
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

      <hr className="border-gray-200" />

      {/* Chart */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          Change in Net Income from EITC/CTC Reform by Employment Income ({request?.year ?? 2026})
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ left: 30, right: 20, top: 5, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="income"
              type="number"
              tickFormatter={formatIncome}
              stroke="#666"
              domain={[0, xMax]}
              allowDecimals={false}
              allowDataOverflow={false}
              label={{ value: 'Employment Income', position: 'bottom', offset: 5, style: { fill: '#666', fontSize: 12 } }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              stroke="#666"
              width={80}
              allowDecimals={false}
              label={{ value: 'Change in Net Income', angle: -90, position: 'left', offset: 0, style: { fill: '#666', fontSize: 12, textAnchor: 'middle' } }}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(value: number) => `Employment Income: ${formatCurrency(value)}`}
            />
            <ReferenceLine y={0} stroke="#666" strokeWidth={2} />
            <Line
              type="monotone"
              dataKey="benefit"
              stroke="#319795"
              strokeWidth={3}
              name="Change in Net Income"
              dot={false}
            />
            {request && request.income <= xMax && (
              <>
                <ReferenceLine
                  x={request.income}
                  stroke="#374151"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: formatCurrency(request.income), position: 'insideTopRight', fill: '#374151', fontSize: 11, offset: 8 }}
                />
                <ReferenceLine
                  y={benefitData.difference}
                  stroke="#374151"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: formatCurrency(benefitData.difference), position: 'insideBottomRight', fill: '#374151', fontSize: 11, offset: 8 }}
                />
                <ReferenceDot
                  x={request.income}
                  y={benefitData.difference}
                  r={6}
                  fill="#319795"
                  stroke="#fff"
                  strokeWidth={2}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
