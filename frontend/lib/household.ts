/**
 * Build PolicyEngine household situations for EITC/CTC reform calculations.
 */

import { HouseholdRequest } from "./types";

const GROUP_UNITS = ["families", "spm_units", "tax_units", "households"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addMemberToUnits(situation: Record<string, any>, memberId: string) {
  for (const unit of GROUP_UNITS) {
    const key = Object.keys(situation[unit])[0];
    situation[unit][key].members.push(memberId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildHouseholdSituation(params: HouseholdRequest): Record<string, any> {
  const { age_head, age_spouse, dependent_ages, income, year, max_earnings, state_code, in_nyc } = params;
  const yearStr = String(year);
  const axisMax = Math.max(max_earnings, income);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const situation: Record<string, any> = {
    people: { you: { age: { [yearStr]: age_head }, employment_income: { [yearStr]: null } } },
    families: { "your family": { members: ["you"] } },
    marital_units: { "your marital unit": { members: ["you"] } },
    spm_units: { "your household": { members: ["you"] } },
    tax_units: {
      "your tax unit": {
        members: ["you"],
      },
    },
    households: {
      "your household": {
        members: ["you"],
        state_code: { [yearStr]: state_code },
        ...(state_code === "NY" && in_nyc
          ? { county_str: { [yearStr]: "NEW_YORK_COUNTY_NY" } }
          : {}),
        household_net_income: { [yearStr]: null },
      },
    },
  };

  // Sweep employment income on the head person (EITC depends on earned income)
  situation.axes = [
    [
      {
        name: "employment_income",
        min: 0,
        max: axisMax,
        count: Math.min(4001, Math.max(501, Math.floor(axisMax / 500))),
        period: yearStr,
      },
    ],
  ];

  // Add spouse
  if (age_spouse !== null && age_spouse !== undefined) {
    situation.people["your partner"] = { age: { [yearStr]: age_spouse } };
    addMemberToUnits(situation, "your partner");
    situation.marital_units["your marital unit"].members.push("your partner");
  }

  // Add dependents
  for (let i = 0; i < dependent_ages.length; i++) {
    let childId: string;
    if (i === 0) {
      childId = "your first dependent";
    } else if (i === 1) {
      childId = "your second dependent";
    } else {
      childId = `dependent_${i + 1}`;
    }

    situation.people[childId] = { age: { [yearStr]: dependent_ages[i] } };
    addMemberToUnits(situation, childId);
    situation.marital_units[`${childId}'s marital unit`] = {
      members: [childId],
    };
  }

  return situation;
}
