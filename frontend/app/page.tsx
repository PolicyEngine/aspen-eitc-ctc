'use client';

import { useState } from 'react';
import ImpactAnalysis from '@/components/ImpactAnalysis';
import AggregateImpact from '@/components/AggregateImpact';
import PolicyOverview from '@/components/PolicyOverview';
import type { HouseholdRequest } from '@/lib/types';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
];

const selectStyle = "w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-8";

export default function Home() {
  const [activeTab, setActiveTab] = useState<'policy' | 'impact' | 'aggregate'>('policy');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">
            EITC &amp; CTC Reform Calculator
          </h1>
          <p className="text-lg opacity-90">
            Estimate the impact of the Aspen ESG proposal to reform and enhance the EITC and CTC
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-4">
          {(['policy', 'impact', 'aggregate'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-white text-primary-600 border-t-4 border-primary-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tab === 'policy'
                ? 'Policy overview'
                : tab === 'impact'
                ? 'Household impact'
                : 'National impact'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-md p-6">
          {activeTab === 'policy' ? (
            <PolicyOverview />
          ) : activeTab === 'impact' ? (
            <HouseholdImpactTab />
          ) : (
            <NationalImpactTab />
          )}
        </div>
      </div>
    </div>
  );
}

const EXAMPLE_HOUSEHOLDS = [
  {
    id: 'nyc_single_parent',
    label: 'Single parent, 1 child (NYC)',
    description: 'Single parent, age 30, with one child (age 3) in New York City',
    ageHead: 30,
    ageSpouse: null as number | null,
    married: false,
    dependentAges: [3],
    income: 35000,
    stateCode: 'NY',
    inNyc: true,
  },
  {
    id: 'in_married_2kids',
    label: 'Married couple, 2 children (IN)',
    description: 'Married couple, ages 35 & 33, with two children (ages 4 & 8) in Indiana',
    ageHead: 35,
    ageSpouse: 33 as number | null,
    married: true,
    dependentAges: [4, 8],
    income: 55000,
    stateCode: 'IN',
    inNyc: false,
  },
  {
    id: 'ca_married_nokids',
    label: 'Married couple, no children (CA)',
    description: 'Married couple, ages 40 & 38, with no children in California',
    ageHead: 40,
    ageSpouse: 38 as number | null,
    married: true,
    dependentAges: [] as number[],
    income: 80000,
    stateCode: 'CA',
    inNyc: false,
  },
];

/** Household impact tab — includes inline household config */
function HouseholdImpactTab() {
  const [ageHead, setAgeHead] = useState(35);
  const [ageSpouse, setAgeSpouse] = useState<number | null>(null);
  const [married, setMarried] = useState(false);
  const [dependentAges, setDependentAges] = useState<number[]>([3]);
  const [income, setIncome] = useState(40000);
  const [stateCode, setStateCode] = useState('CA');
  const [inNyc, setInNyc] = useState(false);
  const [maxEarnings, setMaxEarnings] = useState(200000);
  const [triggered, setTriggered] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<HouseholdRequest | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);

  const handleMarriedChange = (value: boolean) => {
    setMarried(value);
    if (!value) setAgeSpouse(null);
    else setAgeSpouse(35);
  };

  const loadExample = (ex: typeof EXAMPLE_HOUSEHOLDS[0]) => {
    setAgeHead(ex.ageHead);
    setAgeSpouse(ex.ageSpouse);
    setMarried(ex.married);
    setDependentAges([...ex.dependentAges]);
    setIncome(ex.income);
    setStateCode(ex.stateCode);
    setInNyc(ex.inNyc);
    setMaxEarnings(200000);
    setActiveExampleId(ex.id);
    const req: HouseholdRequest = {
      age_head: ex.ageHead,
      age_spouse: ex.married ? ex.ageSpouse : null,
      dependent_ages: ex.dependentAges,
      income: ex.income,
      year: 2026,
      max_earnings: 200000,
      state_code: ex.stateCode,
      in_nyc: ex.inNyc,
    };
    setSubmittedRequest(req);
    setTriggered(true);
  };

  const handleDependentCountChange = (count: number) => {
    const ages = [...dependentAges];
    while (ages.length < count) ages.push(5);
    ages.splice(count);
    setDependentAges(ages);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  const parseNumber = (str: string) => {
    const num = Number(str.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const buildRequest = (): HouseholdRequest => ({
    age_head: ageHead,
    age_spouse: married ? ageSpouse : null,
    dependent_ages: dependentAges,
    income,
    year: 2026,
    max_earnings: maxEarnings,
    state_code: stateCode,
    in_nyc: stateCode === 'NY' ? inNyc : undefined,
  });

  const handleCalculate = () => {
    setActiveExampleId(null);
    setSubmittedRequest(buildRequest());
    setTriggered(true);
  };

  return (
    <div className="space-y-6">
      {/* Example households */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Example households</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {EXAMPLE_HOUSEHOLDS.map((ex) => (
            <button
              key={ex.label}
              onClick={() => loadExample(ex)}
              className={`text-left p-4 rounded-lg border transition-colors group ${
                activeExampleId === ex.id
                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                  : 'border-gray-200 hover:border-primary-400 hover:bg-primary-50'
              }`}
            >
              <p className="font-medium text-gray-900 group-hover:text-primary-700 text-sm">{ex.label}</p>
              <p className="text-xs text-gray-500 mt-1">{ex.description}</p>
              <p className="text-xs text-gray-400 mt-1">Income: ${ex.income.toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-sm text-gray-500">or configure your own</span></div>
      </div>

      {/* Inline household config */}
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-5">Your household</h3>

        {/* Row 1: Income + State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Employment income
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="text"
                value={formatNumber(income)}
                onChange={(e) => setIncome(parseNumber(e.target.value))}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <select
              value={stateCode}
              onChange={(e) => {
                setStateCode(e.target.value);
                if (e.target.value !== 'NY') setInNyc(false);
              }}
              className={selectStyle}
            >
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
            {stateCode === 'NY' && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inNyc}
                  onChange={(e) => setInNyc(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Lives in New York City</span>
              </label>
            )}
          </div>
        </div>

        {/* Row 2: Filing status + Ages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filing status</label>
            <select
              value={married ? 'married' : 'single'}
              onChange={(e) => handleMarriedChange(e.target.value === 'married')}
              className={selectStyle}
            >
              <option value="single">Single</option>
              <option value="married">Married filing jointly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your age</label>
            <input
              type="number"
              value={ageHead}
              onChange={(e) => setAgeHead(parseInt(e.target.value) || 0)}
              onBlur={() => setAgeHead(Math.max(18, Math.min(100, ageHead)))}
              min={18}
              max={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {married && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Spouse age</label>
              <input
                type="number"
                value={ageSpouse ?? 35}
                onChange={(e) => setAgeSpouse(parseInt(e.target.value) || 0)}
                onBlur={() => setAgeSpouse(prev => prev !== null ? Math.max(18, Math.min(100, prev)) : null)}
                min={18}
                max={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          )}
        </div>

        {/* Row 3: Dependents */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Number of dependents</label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              value={dependentAges.length}
              onChange={(e) => handleDependentCountChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              min={0}
              max={10}
              className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {dependentAges.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500">Ages:</span>
                {dependentAges.map((age, i) => (
                  <input
                    key={i}
                    type="number"
                    value={age}
                    onChange={(e) => {
                      const newAges = [...dependentAges];
                      newAges[i] = parseInt(e.target.value) || 0;
                      setDependentAges(newAges);
                    }}
                    onBlur={() => {
                      const newAges = [...dependentAges];
                      newAges[i] = Math.max(0, Math.min(26, newAges[i]));
                      setDependentAges(newAges);
                    }}
                    min={0}
                    max={26}
                    className="w-16 px-2 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder={`#${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={handleCalculate}
            className="py-2.5 px-8 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 transition-colors shadow-sm sm:w-auto w-full"
          >
            Calculate impact
          </button>
        </div>
      </div>

      {/* Chart x-axis options */}
      {triggered && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Chart x-axis max:</span>
          {[100000, 200000, 500000, 1000000].map((v) => (
            <button
              key={v}
              onClick={() => {
                setMaxEarnings(v);
                setSubmittedRequest(prev => prev ? { ...prev, max_earnings: v } : null);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                maxEarnings === v
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ${v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`}
            </button>
          ))}
        </div>
      )}

      {/* Impact results */}
      <ImpactAnalysis request={submittedRequest} triggered={triggered} maxEarnings={maxEarnings} exampleId={activeExampleId} />
    </div>
  );
}

/** National impact tab */
function NationalImpactTab() {
  return (
    <div className="space-y-6">
      <AggregateImpact triggered={true} />
    </div>
  );
}
