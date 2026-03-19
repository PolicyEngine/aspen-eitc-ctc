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
 * Streamlined EITC:
 * - Single schedule for all filers with dependent children (modeled on one-child schedule)
 * - Phase-in rate: 34% for all child brackets
 * - Max credit: $3,995 for all child brackets
 * - Phase-out start: $21,560 (single); joint bonus = $5,390
 * - Phase-out rate: 15.98% for all child brackets
 *
 * Enhanced CTC:
 * - Credit amounts: $3,600 (ages 0-5) / $3,000 (ages 6-17) via ARPA-style amounts
 * - Fully refundable
 * - 30% phase-in rate (from $0)
 * - Phase-out thresholds: $75,000 (single/HOH) / $110,000 (married)
 */
function buildReform(): Record<string, Record<string, number | boolean>> {
  const period = "2026-01-01.2100-12-31";

  return {
    // === EITC Reform ===
    // Phase-in rates: 34% for all child brackets (1, 2, 3+)
    // Bracket index 1 = 1 child (already 34%, but set explicitly)
    "gov.irs.credits.eitc.phase_in_rate.brackets[1].amount": { [period]: 0.34 },
    "gov.irs.credits.eitc.phase_in_rate.brackets[2].amount": { [period]: 0.34 },
    "gov.irs.credits.eitc.phase_in_rate.brackets[3].amount": { [period]: 0.34 },

    // Max credits: $3,995 for all child brackets
    "gov.irs.credits.eitc.max.brackets[1].amount": { [period]: 3995 },
    "gov.irs.credits.eitc.max.brackets[2].amount": { [period]: 3995 },
    "gov.irs.credits.eitc.max.brackets[3].amount": { [period]: 3995 },

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

    // === CTC Reform ===
    // Credit amounts via ARPA-style: $3,600 (ages 0-5) / $3,000 (ages 6-17)
    "gov.irs.credits.ctc.amount.arpa.brackets[0].amount": { [period]: 3600 },
    "gov.irs.credits.ctc.amount.arpa.brackets[1].amount": { [period]: 3000 },

    // Phase-out thresholds
    "gov.irs.credits.ctc.phase_out.threshold.SINGLE": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.threshold.HEAD_OF_HOUSEHOLD": { [period]: 75000 },
    "gov.irs.credits.ctc.phase_out.threshold.JOINT": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.threshold.SURVIVING_SPOUSE": { [period]: 110000 },
    "gov.irs.credits.ctc.phase_out.threshold.SEPARATE": { [period]: 55000 },

    // Fully refundable CTC
    "gov.irs.credits.ctc.refundable.fully_refundable": { [period]: true },

    // Phase-in rate: 30%
    "gov.irs.credits.ctc.refundable.phase_in.rate": { [period]: 0.30 },

    // Phase-in threshold: $0 (50% refundability at zero earnings)
    "gov.irs.credits.ctc.refundable.phase_in.threshold": { [period]: 0 },
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
