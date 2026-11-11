import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { HouseholdRequest } from "./types";

const DASHBOARD_API_CALCULATE_URL =
  "https://www.policyengine.org/api/household/calculate";
const HOUSEHOLD_BACKEND_URL = "https://household-backend.example.test";

const REQUEST: HouseholdRequest = {
  age_head: 30,
  age_spouse: null,
  dependent_ages: [4],
  income: 5000,
  year: 2026,
  max_earnings: 20000,
  state_code: "TX",
};

// One household over three earnings points. The reform raises net income
// at the first two; at the third the household has no EITC child, so the
// calculator keeps the baseline there.
const EARNINGS = [0, 10000, 20000];
const EITC_CHILD_COUNT = [1, 1, 0];

function calculatedHousehold(netIncome: number[], marginalTaxRate: number[]) {
  return {
    people: {
      you: {
        employment_income: { "2026": EARNINGS },
        marginal_tax_rate: { "2026": marginalTaxRate },
      },
    },
    tax_units: {
      "your tax unit": { eitc_child_count: { "2026": EITC_CHILD_COUNT } },
    },
    households: {
      "your household": { household_net_income: { "2026": netIncome } },
    },
  };
}

const BASELINE_HOUSEHOLD = calculatedHousehold(
  [0, 10000, 19000],
  [0.1, 0.1, 0.2],
);
const REFORM_HOUSEHOLD = calculatedHousehold(
  [0, 12000, 20000],
  [-0.2, 0.05, 0.3],
);

const fetchMock = vi.fn<typeof fetch>();

function jsonAnswer(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

/** Answers only the dashboard API; any other address is unreachable. */
function answerFromDashboardApi(
  answerFor: (body: Record<string, unknown>) => Response,
) {
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input) !== DASHBOARD_API_CALCULATE_URL) {
      throw new TypeError(`Failed to fetch ${String(input)}`);
    }
    return answerFor(JSON.parse(String(init?.body)));
  });
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function requestBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

async function loadApi(householdBackendUrl: string) {
  vi.stubEnv("NEXT_PUBLIC_HOUSEHOLD_API_URL", householdBackendUrl);
  vi.resetModules();
  return (await import("./api")).api;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("calculateHouseholdImpact without a household backend", () => {
  test("given a household then it calculates current law and the reform through the dashboard API", async () => {
    // Given
    answerFromDashboardApi((body) =>
      jsonAnswer({
        status: "ok",
        message: null,
        result: body.policy ? REFORM_HOUSEHOLD : BASELINE_HOUSEHOLD,
      }),
    );
    const api = await loadApi("");

    // When
    await api.calculateHouseholdImpact(REQUEST).catch(() => undefined);

    // Then
    expect(requestedUrls()).toEqual([
      DASHBOARD_API_CALCULATE_URL,
      DASHBOARD_API_CALCULATE_URL,
    ]);
    const [baselineBody, reformBody] = requestBodies();
    expect(baselineBody.country).toBe("us");
    expect(baselineBody).not.toHaveProperty("policy");
    expect(reformBody.country).toBe("us");
    expect(reformBody.household).toEqual(baselineBody.household);
    expect(reformBody.policy).toMatchObject({
      "gov.contrib.streamlined_eitc.in_effect": {
        "2026-01-01.2100-12-31": true,
      },
      "gov.irs.credits.ctc.amount.arpa[0].amount": {
        "2026-01-01.2100-12-31": 3600,
      },
    });
    expect(
      requestedUrls().some((url) => url.includes("api.policyengine.org")),
    ).toBe(false);
  });

  test("given the calculated households then the impact is read from their results", async () => {
    // Given: every address answers, so this holds for any calculate route.
    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return jsonAnswer({
        status: "ok",
        message: null,
        result: body.policy ? REFORM_HOUSEHOLD : BASELINE_HOUSEHOLD,
      });
    });
    const api = await loadApi("");

    // When
    const impact = await api.calculateHouseholdImpact(REQUEST);

    // Then
    expect(impact).toEqual({
      income_range: EARNINGS,
      net_income_change: [0, 2000, 0],
      baseline_net_income: [0, 10000, 19000],
      reform_net_income: [0, 12000, 19000],
      baseline_mtr: [0.1, 0.1, 0.2],
      reform_mtr: [-0.2, 0.05, 0.2],
      benefit_at_income: { baseline: 5000, reform: 6000, difference: 1000 },
      x_axis_max: 20000,
    });
  });

  test("given the dashboard API refuses the household then the error carries its message", async () => {
    // Given
    answerFromDashboardApi(() =>
      jsonAnswer(
        {
          status: "error",
          message: "Variable 'not_a_variable' does not exist.",
          result: null,
        },
        400,
      ),
    );
    const api = await loadApi("");

    // When
    const calculation = api.calculateHouseholdImpact(REQUEST);

    // Then
    await expect(calculation).rejects.toThrow(
      "Variable 'not_a_variable' does not exist.",
    );
  });
});

describe("calculateHouseholdImpact with a household backend", () => {
  test("given NEXT_PUBLIC_HOUSEHOLD_API_URL then it calls only that backend", async () => {
    // Given
    const backendAnswer = { income_range: EARNINGS };
    fetchMock.mockResolvedValue(jsonAnswer(backendAnswer));
    const api = await loadApi(HOUSEHOLD_BACKEND_URL);

    // When
    const impact = await api.calculateHouseholdImpact(REQUEST);

    // Then
    expect(impact).toEqual(backendAnswer);
    expect(requestedUrls()).toEqual([
      `${HOUSEHOLD_BACKEND_URL}/household-impact`,
    ]);
    expect(requestBodies()).toEqual([REQUEST]);
  });
});
