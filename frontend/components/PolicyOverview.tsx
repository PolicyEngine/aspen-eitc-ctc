'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

// Current law EITC parameters (2026 projected)
const CURRENT_EITC = {
  1: { phaseIn: 0.34, max: 4427, poStart: 23840, poStartJoint: 31100, poRate: 0.1598 },
  2: { phaseIn: 0.40, max: 7316, poStart: 23840, poStartJoint: 31100, poRate: 0.2106 },
  3: { phaseIn: 0.45, max: 8231, poStart: 23840, poStartJoint: 31100, poRate: 0.2106 },
};

// Proposed EITC parameters (Aspen ESG)
const REFORM_EITC = {
  single: { phaseIn: 0.34, max: 3995, poStart: 21560, poRate: 0.1598 },
  married: { phaseIn: 0.34, max: 4993, poStart: 26950, poRate: 0.1598 },
};

// Current law CTC parameters (2026)
const CURRENT_CTC = {
  amountUnder17: 2200,
  phaseOutSingle: 200000,
  phaseOutJoint: 400000,
  phaseOutRate: 0.05,
  refundableMax: 1700,
  refundablePhaseInRate: 0.15,
  refundablePhaseInThreshold: 2500,
};

// Proposed CTC parameters (Aspen ESG)
const REFORM_CTC = {
  amountUnder6: 3600,
  amount6to17: 3000,
  phaseOutSingle: 75000,
  phaseOutJoint: 110000,
  fullyRefundable: true,
  refundablePhaseInRate: 0.30,
  refundablePhaseInThreshold: 0,
  zeroEarningsRefundability: 0.50,
};

function calcEITC(income: number, params: { phaseIn: number; max: number; poStart: number; poRate: number }): number {
  const phaseInAmount = income * params.phaseIn;
  const credit = Math.min(phaseInAmount, params.max);
  if (income <= params.poStart) return credit;
  const reduction = (income - params.poStart) * params.poRate;
  return Math.max(0, credit - reduction);
}

function formatDollar(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function formatDollarFull(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export default function PolicyOverview() {
  const [eitcFilingStatus, setEitcFilingStatus] = useState<'single' | 'married'>('single');
  const [eitcChildren, setEitcChildren] = useState<1 | 2 | 3>(1);

  // EITC comparison data
  const eitcData = useMemo(() => {
    const points = [];
    const maxIncome = 70000;
    const currentParams = CURRENT_EITC[eitcChildren];
    const reformParams = eitcFilingStatus === 'single'
      ? REFORM_EITC.single
      : REFORM_EITC.married;
    const currentPoStart = eitcFilingStatus === 'single'
      ? currentParams.poStart
      : currentParams.poStartJoint;

    for (let inc = 0; inc <= maxIncome; inc += 250) {
      points.push({
        income: inc,
        current: calcEITC(inc, { ...currentParams, poStart: currentPoStart }),
        reform: calcEITC(inc, reformParams),
      });
    }
    return points;
  }, [eitcFilingStatus, eitcChildren]);

  // CTC comparison data (single child under 6, single filer)
  const ctcData = useMemo(() => {
    const points = [];
    const maxIncome = 500000;
    for (let inc = 0; inc <= maxIncome; inc += 1000) {
      // Current law CTC value (1 child under 17, HOH filer)
      // Phase-in at 15% from $2,500 threshold, full credit $2,200, phase-out at 5% from $200k
      const currentCreditAfterPhaseOut = Math.max(0,
        CURRENT_CTC.amountUnder17 - Math.max(0, inc - CURRENT_CTC.phaseOutSingle) * CURRENT_CTC.phaseOutRate
      );
      const currentPhaseIn = Math.max(0, (inc - CURRENT_CTC.refundablePhaseInThreshold) * CURRENT_CTC.refundablePhaseInRate);
      const currentValue = Math.min(currentCreditAfterPhaseOut, currentPhaseIn);

      // Reform CTC value (1 child under 6, fully refundable, linear phase-out)
      // 50% minimum at zero earnings ($1,800), 30% phase-in, linear phase-out $75k→$240k
      const reformPhaseOutRange = 240000 - REFORM_CTC.phaseOutSingle;
      const reformCreditAfterPhaseOut = Math.max(0,
        REFORM_CTC.amountUnder6 - Math.max(0, inc - REFORM_CTC.phaseOutSingle) * (REFORM_CTC.amountUnder6 / reformPhaseOutRange)
      );
      const reformPhaseIn = Math.min(REFORM_CTC.amountUnder6,
        REFORM_CTC.amountUnder6 * REFORM_CTC.zeroEarningsRefundability + inc * REFORM_CTC.refundablePhaseInRate
      );
      const reformValue = Math.min(reformCreditAfterPhaseOut, reformPhaseIn);

      points.push({
        income: inc,
        current: currentValue,
        reform: reformValue,
      });
    }
    return points;
  }, []);

  return (
    <div className="space-y-10">
      {/* Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Supporting Families, Rewarding Work
        </h2>
        <p className="text-gray-700 mb-4">
          The Aspen Economic Strategy Group proposes reforms to streamline the Earned Income Tax Credit
          (EITC) and enhance the Child Tax Credit (CTC) to better support working families.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
            <h3 className="font-semibold text-primary-800 mb-2">Streamlined EITC</h3>
            <p className="text-sm text-primary-700">
              A single schedule for all filers with dependent children, modeled on
              the current one-child schedule with a 34% phase-in rate.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Enhanced CTC</h3>
            <p className="text-sm text-gray-700">
              Higher credit amounts ($3,600/$3,000 by age), 50% refundability at
              zero earnings, and a 30% phase-in rate with lower phase-out thresholds.
            </p>
          </div>
        </div>
      </div>

      {/* EITC parameters table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Streamlined EITC parameters
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-900" rowSpan={2}>Parameter</th>
                <th className="text-center px-3 py-2 font-medium text-gray-900 border-l border-gray-200" colSpan={2}>Single / HOH</th>
                <th className="text-center px-3 py-2 font-medium text-gray-900 border-l border-gray-200" colSpan={2}>Married filing jointly</th>
              </tr>
              <tr className="border-b border-gray-300">
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 border-l border-gray-200">Current Law</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-primary-600">Reform</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 border-l border-gray-200">Current Law</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-primary-600">Reform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-gray-900">Phase-in rate</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">34%</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">34%</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">34%</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">34%</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-gray-900">Maximum credit</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">{formatDollarFull(4427)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">{formatDollarFull(3995)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">{formatDollarFull(4427)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">{formatDollarFull(4993)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-gray-900">Phase-out begins</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">{formatDollarFull(23840)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">{formatDollarFull(21560)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">{formatDollarFull(31100)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">{formatDollarFull(26950)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-gray-900">Full phase-out</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">{formatDollarFull(51543)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">{formatDollarFull(46560)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">{formatDollarFull(58803)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">{formatDollarFull(58195)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-gray-900">Phase-out rate</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">15.98%</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">15.98%</td>
                <td className="px-3 py-2.5 text-right text-gray-500 border-l border-gray-100">15.98%</td>
                <td className="px-3 py-2.5 text-right font-semibold text-primary-700">15.98%</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">
            Current law shown for 1-child schedule. The reform applies a single EITC schedule for all filers
            with dependent children, regardless of the number of children.
          </p>
        </div>
      </div>

      {/* EITC comparison chart */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          EITC: current law vs. reform
        </h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="flex gap-1">
            {(['single', 'married'] as const).map((fs) => (
              <button
                key={fs}
                onClick={() => setEitcFilingStatus(fs)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  eitcFilingStatus === fs
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {fs === 'single' ? 'Single' : 'Married filing jointly'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                onClick={() => setEitcChildren(n)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  eitcChildren === n
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {n === 3 ? '3+ children' : `${n} child${n > 1 ? 'ren' : ''}`}
              </button>
            ))}
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={eitcData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="income" tickFormatter={formatDollar} type="number" allowDecimals={false} />
              <YAxis tickFormatter={formatDollar} allowDecimals={false} />
              <Tooltip
                formatter={(value: number) => formatDollarFull(value)}
                labelFormatter={(label: number) => `Earned income: ${formatDollarFull(label)}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="current"
                name="Current law"
                stroke="#9ca3af"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={500}
              />
              <Line
                type="monotone"
                dataKey="reform"
                name="Aspen ESG reform"
                stroke="#319795"
                strokeWidth={2}
                dot={false}
                animationDuration={500}
              />
              <ReferenceLine y={0} stroke="#d1d5db" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CTC parameters table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Enhanced CTC parameters
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left px-4 py-3 font-medium text-gray-900">Parameter</th>
                <th className="text-right px-4 py-3 font-medium text-gray-900">Current law</th>
                <th className="text-right px-4 py-3 font-medium text-gray-900">Reform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Credit (ages 0-5)</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatDollarFull(2200)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">{formatDollarFull(3600)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Credit (ages 6-17)</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatDollarFull(2200)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">{formatDollarFull(3000)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Refundability at zero earnings</td>
                <td className="px-4 py-3 text-right text-gray-700">$0</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">50% of credit</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Phase-in rate</td>
                <td className="px-4 py-3 text-right text-gray-700">15%</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">30%</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Phase-out threshold (single)</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatDollarFull(200000)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">{formatDollarFull(75000)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Phase-out threshold (married)</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatDollarFull(400000)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">{formatDollarFull(110000)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Full phase-out (single)</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatDollarFull(244000)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">{formatDollarFull(240000)}</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-900">Full phase-out (married)</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatDollarFull(444000)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary-700">{formatDollarFull(440000)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* CTC comparison chart */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          CTC: current law vs. reform (single filer, one child under 6)
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ctcData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="income" tickFormatter={formatDollar} type="number" allowDecimals={false} />
              <YAxis tickFormatter={formatDollar} allowDecimals={false} />
              <Tooltip
                formatter={(value: number) => formatDollarFull(value)}
                labelFormatter={(label: number) => `Earned income: ${formatDollarFull(label)}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="current"
                name="Current law"
                stroke="#9ca3af"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={500}
              />
              <Line
                type="monotone"
                dataKey="reform"
                name="Aspen ESG reform"
                stroke="#319795"
                strokeWidth={2}
                dot={false}
                animationDuration={500}
              />
              <ReferenceLine y={0} stroke="#d1d5db" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sources */}
      <div className="border-t pt-4 text-sm text-gray-500">
        <p className="font-medium mb-1">Source</p>
        <ul className="space-y-1">
          <li>
            Aspen Economic Strategy Group, &ldquo;Supporting Families, Rewarding Work:
            A Proposal to Reform and Enhance the EITC and CTC&rdquo;
          </li>
        </ul>
      </div>
    </div>
  );
}
