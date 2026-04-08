import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import { buildHouseholdSituation } from "./household";

const PE_API_URL = "https://api.policyengine.org";
const HOUSEHOLD_API_URL =
  process.env.NEXT_PUBLIC_HOUSEHOLD_API_URL || "";

class ApiError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.status = status;
    this.response = response;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 120000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function peCalculate(body: Record<string, any>): Promise<any> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/calculate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(
      `PE API error: ${response.status}`,
      response.status,
      errorBody
    );
  }
  return response.json();
}

/**
 * Build the Aspen ESG EITC/CTC reform parameter overrides.
 *
 * Streamlined EITC (uses contrib structural reform + IRS parameter overrides):
 * - gov.contrib.streamlined_eitc.in_effect = true (enables filing-status-specific max)
 * - gov.contrib.streamlined_eitc.max.single[1] = $3,995 (single/HOH max for 1+ children)
 * - gov.contrib.streamlined_eitc.max.joint[1] = $4,993 (married max for 1+ children)
 * - Phase-in rate: 34% for all child brackets (IRS param override)
 * - Phase-out start: $21,560 (single); joint bonus = $5,390
 * - Phase-out rate: 15.98% for all child brackets
 *
 * The public household API cannot express "preserve current-law childless
 * EITC" using parameter overrides alone. After requesting the structural
 * reform, the calculator patches any axes points with `eitc_child_count = 0`
 * back to the baseline path.
 *
 * Enhanced CTC (uses contrib structural reform + IRS parameter overrides):
 * - Credit amounts: $3,600 (ages 0-5) / $3,000 (ages 6-17) via ARPA amounts
 * - 50% refundable at zero earnings, then 30% phase-in from $0
 * - gov.contrib.ctc.linear_phase_out.in_effect = true (linear phase-out)
 * - Phase-out thresholds: $75,000 (single/HOH) / $110,000 (married)
 * - Full phase-out: $240,000 (single) / $440,000 (married)
 */
function buildReform(): Record<string, Record<string, number | boolean>> {
  const period = "2026-01-01.2100-12-31";

  return {
    // === Streamlined EITC Reform ===
    // Enable structural reform for filing-status-specific max credits
    "gov.contrib.streamlined_eitc.in_effect": { [period]: true },

    // Max credits by filing status (structural reform params)
    // $3,995 for single/HOH, $4,993 for married (1+ children)
    "gov.contrib.streamlined_eitc.max.single[1].amount": { [period]: 3995 },
    "gov.contrib.streamlined_eitc.max.joint[1].amount": { [period]: 4993 },

    // Phase-in rates: 34% for all child brackets (1, 2, 3+)
    "gov.irs.credits.eitc.phase_in_rate[1].amount": { [period]: 0.34 },
    "gov.irs.credits.eitc.phase_in_rate[2].amount": { [period]: 0.34 },
    "gov.irs.credits.eitc.phase_in_rate[3].amount": { [period]: 0.34 },

    // Phase-out start: $21,560 for all child brackets (single filer)
    "gov.irs.credits.eitc.phase_out.start[1].amount": { [period]: 21560 },
    "gov.irs.credits.eitc.phase_out.start[2].amount": { [period]: 21560 },
    "gov.irs.credits.eitc.phase_out.start[3].amount": { [period]: 21560 },

    // Joint bonus: $26,950 - $21,560 = $5,390
    "gov.irs.credits.eitc.phase_out.joint_bonus[1].amount": { [period]: 5390 },

    // Phase-out rates: 15.98% for all child brackets
    "gov.irs.credits.eitc.phase_out.rate[1].amount": { [period]: 0.1598 },
    "gov.irs.credits.eitc.phase_out.rate[2].amount": { [period]: 0.1598 },
    "gov.irs.credits.eitc.phase_out.rate[3].amount": { [period]: 0.1598 },

    // === Enhanced CTC Reform ===
    // Enable ARPA CTC addition mechanism
    "gov.irs.credits.ctc.phase_out.arpa.in_effect": { [period]: true },

    // Credit amounts via ARPA-style: $3,600 (ages 0-5) / $3,000 (ages 6-17)
    "gov.irs.credits.ctc.amount.arpa[0].amount": { [period]: 3600 },
    "gov.irs.credits.ctc.amount.arpa[1].amount": { [period]: 3000 },

    // Phase-out thresholds (start of phase-out)
    "gov.irs.credits.ctc.phase_out.threshold.SINGLE": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.threshold.HEAD_OF_HOUSEHOLD": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.threshold.JOINT": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.threshold.SURVIVING_SPOUSE": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.threshold.SEPARATE": { [period]: 55000 },

    // ARPA phase-out thresholds aligned to CTC thresholds
    // (prevents ARPA's own phase-out from conflicting with linear phase-out)
    "gov.irs.credits.ctc.phase_out.arpa.threshold.SINGLE": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.arpa.threshold.HEAD_OF_HOUSEHOLD": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.arpa.threshold.JOINT": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.arpa.threshold.SURVIVING_SPOUSE": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.arpa.threshold.SEPARATE": { [period]: 55000 },

    // Enable linear phase-out structural reform
    "gov.contrib.ctc.linear_phase_out.in_effect": { [period]: true },

    // Full phase-out endpoints (linear phase-out reform params)
    "gov.contrib.ctc.linear_phase_out.end.SINGLE": { [period]: 240000 },
    "gov.contrib.ctc.linear_phase_out.end.HEAD_OF_HOUSEHOLD": { [period]: 240000 },
    "gov.contrib.ctc.linear_phase_out.end.JOINT": { [period]: 440000 },
    "gov.contrib.ctc.linear_phase_out.end.SURVIVING_SPOUSE": { [period]: 440000 },
    "gov.contrib.ctc.linear_phase_out.end.SEPARATE": { [period]: 175000 },

    // Raise individual refundable max to cover full ARPA amounts
    "gov.irs.credits.ctc.refundable.individual_max": { [period]: 3600 },

    // Phase-in rate: 30%
    "gov.irs.credits.ctc.refundable.phase_in.rate": { [period]: 0.30 },

    // Phase-in threshold: $0
    "gov.irs.credits.ctc.refundable.phase_in.threshold": { [period]: 0 },

    // 50% refundability at zero earnings via minimum refundable amount
    // $3,600 * 0.50 = $1,800 (ages 0-5), $3,000 * 0.50 = $1,500 (ages 6-17)
    "gov.contrib.ctc.minimum_refundable.in_effect": { [period]: true },
    "gov.contrib.ctc.minimum_refundable.amount[0].amount": { [period]: 1800 },
    "gov.contrib.ctc.minimum_refundable.amount[1].amount": { [period]: 1500 },
  };
}

function interpolate(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[ys.length - 1];
}

function computeMTRFallback(netIncome: number[], incomes: number[]): number[] {
  const mtr: number[] = [];
  for (let i = 0; i < netIncome.length; i++) {
    if (i === 0) {
      if (incomes.length > 1) {
        const dNet = netIncome[1] - netIncome[0];
        const dInc = incomes[1] - incomes[0];
        mtr.push(dInc > 0 ? 1 - dNet / dInc : 0);
      } else {
        mtr.push(0);
      }
    } else {
      const dNet = netIncome[i] - netIncome[i - 1];
      const dInc = incomes[i] - incomes[i - 1];
      mtr.push(dInc > 0 ? 1 - dNet / dInc : 0);
    }
  }
  return mtr;
}

export const api = {
  async loadPrecomputedExample(
    exampleId: string
  ): Promise<HouseholdImpactResponse> {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const res = await fetch(`${basePath}/data/examples/${exampleId}.json`);
    if (!res.ok) {
      throw new Error(`Failed to load example: ${exampleId}`);
    }
    return res.json();
  },

  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
    if (HOUSEHOLD_API_URL) {
      const response = await fetchWithTimeout(
        `${HOUSEHOLD_API_URL.replace(/\/$/, "")}/household-impact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }
      );
      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }
        throw new ApiError(
          `Household API error: ${response.status}`,
          response.status,
          errorBody
        );
      }
      return response.json();
    }

    const household = buildHouseholdSituation(request);
    const policy = buildReform();
    const yearStr = String(request.year);

    // Run baseline and reform in parallel
    const [baselineResult, reformResult] = await Promise.all([
      peCalculate({ household }),
      peCalculate({ household, policy }),
    ]);

    // Extract net income arrays
    const baselineNetIncome: number[] =
      baselineResult.result.households["your household"]["household_net_income"][yearStr];
    const reformNetIncome: number[] =
      reformResult.result.households["your household"]["household_net_income"][yearStr];

    // Extract employment income x-axis values (person-level variable)
    const incomeRange: number[] =
      baselineResult.result.people["you"]["employment_income"][yearStr];
    const eitcChildCount: number[] =
      baselineResult.result.tax_units["your tax unit"]["eitc_child_count"][yearStr];
    const baselineMTRRaw: number[] | undefined =
      baselineResult.result.people["you"]["marginal_tax_rate"]?.[yearStr];
    const reformMTRRaw: number[] | undefined =
      reformResult.result.people["you"]["marginal_tax_rate"]?.[yearStr];

    const baselineMTR =
      baselineMTRRaw ?? computeMTRFallback(baselineNetIncome, incomeRange);
    const unpatchedReformMTR =
      reformMTRRaw ?? computeMTRFallback(reformNetIncome, incomeRange);
    const patchedReformNetIncome = reformNetIncome.map(
      (value: number, i: number) =>
        eitcChildCount[i] > 0 ? value : baselineNetIncome[i]
    );
    const reformMTR = unpatchedReformMTR.map((value: number, i: number) =>
      eitcChildCount[i] > 0 ? value : baselineMTR[i]
    );

    // Compute element-wise net income change
    const netIncomeChange = patchedReformNetIncome.map(
      (val: number, i: number) => val - baselineNetIncome[i]
    );

    // Interpolate point estimate at user's income
    const baselineAtIncome = interpolate(incomeRange, baselineNetIncome, request.income);
    const reformAtIncome = interpolate(
      incomeRange,
      patchedReformNetIncome,
      request.income
    );

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      baseline_net_income: baselineNetIncome,
      reform_net_income: patchedReformNetIncome,
      baseline_mtr: baselineMTR,
      reform_mtr: reformMTR,
      benefit_at_income: {
        baseline: baselineAtIncome,
        reform: reformAtIncome,
        difference: reformAtIncome - baselineAtIncome,
      },
      x_axis_max: incomeRange[incomeRange.length - 1] ?? request.max_earnings,
    };
  },
};
