import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import { buildHouseholdSituation } from "./household";

const PE_API_URL = "https://api.policyengine.org";

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
 * Enhanced CTC (uses contrib structural reform + IRS parameter overrides):
 * - Credit amounts: $3,600 (ages 0-5) / $3,000 (ages 6-17) via ARPA amounts
 * - Fully refundable with 30% phase-in rate from $0
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
    "gov.contrib.streamlined_eitc.max.single.brackets[1].amount": { [period]: 3995 },
    "gov.contrib.streamlined_eitc.max.joint.brackets[1].amount": { [period]: 4993 },

    // Phase-in rates: 34% for all child brackets (1, 2, 3+)
    "gov.irs.credits.eitc.phase_in_rate.brackets[1].amount": { [period]: 0.34 },
    "gov.irs.credits.eitc.phase_in_rate.brackets[2].amount": { [period]: 0.34 },
    "gov.irs.credits.eitc.phase_in_rate.brackets[3].amount": { [period]: 0.34 },

    // Phase-out start: $21,560 for all child brackets (single filer)
    "gov.irs.credits.eitc.phase_out.start.brackets[1].amount": { [period]: 21560 },
    "gov.irs.credits.eitc.phase_out.start.brackets[2].amount": { [period]: 21560 },
    "gov.irs.credits.eitc.phase_out.start.brackets[3].amount": { [period]: 21560 },

    // Joint bonus: $26,950 - $21,560 = $5,390
    "gov.irs.credits.eitc.phase_out.joint_bonus.brackets[1].amount": { [period]: 5390 },

    // Phase-out rates: 15.98% for all child brackets
    "gov.irs.credits.eitc.phase_out.rate.brackets[1].amount": { [period]: 0.1598 },
    "gov.irs.credits.eitc.phase_out.rate.brackets[2].amount": { [period]: 0.1598 },
    "gov.irs.credits.eitc.phase_out.rate.brackets[3].amount": { [period]: 0.1598 },

    // === Enhanced CTC Reform ===
    // Credit amounts via ARPA-style: $3,600 (ages 0-5) / $3,000 (ages 6-17)
    "gov.irs.credits.ctc.amount.arpa.brackets[0].amount": { [period]: 3600 },
    "gov.irs.credits.ctc.amount.arpa.brackets[1].amount": { [period]: 3000 },

    // Phase-out thresholds (start of phase-out)
    "gov.irs.credits.ctc.phase_out.threshold.SINGLE": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.threshold.HEAD_OF_HOUSEHOLD": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.threshold.JOINT": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.threshold.SURVIVING_SPOUSE": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.threshold.SEPARATE": { [period]: 55000 },

    // Enable linear phase-out structural reform
    "gov.contrib.ctc.linear_phase_out.in_effect": { [period]: true },

    // Full phase-out endpoints (linear phase-out reform params)
    "gov.contrib.ctc.linear_phase_out.end.SINGLE": { [period]: 240000 },
    "gov.contrib.ctc.linear_phase_out.end.HEAD_OF_HOUSEHOLD": { [period]: 240000 },
    "gov.contrib.ctc.linear_phase_out.end.JOINT": { [period]: 440000 },
    "gov.contrib.ctc.linear_phase_out.end.SURVIVING_SPOUSE": { [period]: 440000 },
    "gov.contrib.ctc.linear_phase_out.end.SEPARATE": { [period]: 175000 },

    // Fully refundable CTC
    "gov.irs.credits.ctc.refundable.fully_refundable": { [period]: true },

    // Phase-in rate: 30%
    "gov.irs.credits.ctc.refundable.phase_in.rate": { [period]: 0.30 },

    // Phase-in threshold: $0
    "gov.irs.credits.ctc.refundable.phase_in.threshold": { [period]: 0 },

    // 50% refundability at zero earnings via minimum refundable amount
    // $3,600 * 0.50 = $1,800 (ages 0-5), $3,000 * 0.50 = $1,500 (ages 6-17)
    "gov.contrib.ctc.minimum_refundable.in_effect": { [period]: true },
    "gov.contrib.ctc.minimum_refundable.amount.brackets[0].amount": { [period]: 1800 },
    "gov.contrib.ctc.minimum_refundable.amount.brackets[1].amount": { [period]: 1500 },
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

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
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

    // Extract employment income x-axis values
    const incomeRange: number[] =
      baselineResult.result.tax_units["your tax unit"]["employment_income"][yearStr];

    // Compute element-wise net income change
    const netIncomeChange = reformNetIncome.map(
      (val: number, i: number) => val - baselineNetIncome[i]
    );

    // Interpolate point estimate at user's income
    const baselineAtIncome = interpolate(incomeRange, baselineNetIncome, request.income);
    const reformAtIncome = interpolate(incomeRange, reformNetIncome, request.income);

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      benefit_at_income: {
        baseline: baselineAtIncome,
        reform: reformAtIncome,
        difference: reformAtIncome - baselineAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};
