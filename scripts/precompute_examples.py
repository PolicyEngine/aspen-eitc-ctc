"""Pre-compute household impact data for the 3 example households.

Calls the PE API with baseline and reform, computes net income curves,
MTR schedules, and saves as JSON to frontend/public/data/examples/.

Usage:
    python scripts/precompute_examples.py
"""

import json
import math
import os
import sys

import requests

PE_API_URL = "https://api.policyengine.org"
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "public",
    "data",
    "examples",
)

PERIOD = "2026-01-01.2100-12-31"
YEAR = 2026
YEAR_STR = "2026"
MAX_EARNINGS = 200000
COUNT = 401  # data points for smooth curves

REFORM = {
    # Streamlined EITC
    "gov.contrib.streamlined_eitc.in_effect": {PERIOD: True},
    "gov.contrib.streamlined_eitc.max.single[1].amount": {PERIOD: 3995},
    "gov.contrib.streamlined_eitc.max.joint[1].amount": {PERIOD: 4993},
    "gov.irs.credits.eitc.phase_in_rate[1].amount": {PERIOD: 0.34},
    "gov.irs.credits.eitc.phase_in_rate[2].amount": {PERIOD: 0.34},
    "gov.irs.credits.eitc.phase_in_rate[3].amount": {PERIOD: 0.34},
    "gov.irs.credits.eitc.phase_out.start[1].amount": {PERIOD: 21560},
    "gov.irs.credits.eitc.phase_out.start[2].amount": {PERIOD: 21560},
    "gov.irs.credits.eitc.phase_out.start[3].amount": {PERIOD: 21560},
    "gov.irs.credits.eitc.phase_out.joint_bonus[1].amount": {PERIOD: 5390},
    "gov.irs.credits.eitc.phase_out.rate[1].amount": {PERIOD: 0.1598},
    "gov.irs.credits.eitc.phase_out.rate[2].amount": {PERIOD: 0.1598},
    "gov.irs.credits.eitc.phase_out.rate[3].amount": {PERIOD: 0.1598},
    # Enhanced CTC
    "gov.irs.credits.ctc.amount.arpa[0].amount": {PERIOD: 3600},
    "gov.irs.credits.ctc.amount.arpa[1].amount": {PERIOD: 3000},
    "gov.irs.credits.ctc.phase_out.threshold.SINGLE": {PERIOD: 75000},
    "gov.irs.credits.ctc.phase_out.threshold.HEAD_OF_HOUSEHOLD": {PERIOD: 75000},
    "gov.irs.credits.ctc.phase_out.threshold.JOINT": {PERIOD: 110000},
    "gov.irs.credits.ctc.phase_out.threshold.SURVIVING_SPOUSE": {PERIOD: 110000},
    "gov.irs.credits.ctc.phase_out.threshold.SEPARATE": {PERIOD: 55000},
    "gov.contrib.ctc.linear_phase_out.in_effect": {PERIOD: True},
    "gov.contrib.ctc.linear_phase_out.end.SINGLE": {PERIOD: 240000},
    "gov.contrib.ctc.linear_phase_out.end.HEAD_OF_HOUSEHOLD": {PERIOD: 240000},
    "gov.contrib.ctc.linear_phase_out.end.JOINT": {PERIOD: 440000},
    "gov.contrib.ctc.linear_phase_out.end.SURVIVING_SPOUSE": {PERIOD: 440000},
    "gov.contrib.ctc.linear_phase_out.end.SEPARATE": {PERIOD: 175000},
    "gov.irs.credits.ctc.refundable.fully_refundable": {PERIOD: True},
    "gov.irs.credits.ctc.refundable.phase_in.rate": {PERIOD: 0.30},
    "gov.irs.credits.ctc.refundable.phase_in.threshold": {PERIOD: 0},
    "gov.contrib.ctc.minimum_refundable.in_effect": {PERIOD: True},
    "gov.contrib.ctc.minimum_refundable.amount[0].amount": {PERIOD: 1800},
    "gov.contrib.ctc.minimum_refundable.amount[1].amount": {PERIOD: 1500},
}

EXAMPLES = [
    {
        "id": "nyc_single_parent",
        "label": "Single parent, 1 child (NYC)",
        "age_head": 30,
        "age_spouse": None,
        "dependent_ages": [3],
        "income": 35000,
        "state_code": "NY",
        "in_nyc": True,
    },
    {
        "id": "in_married_2kids",
        "label": "Married couple, 2 children (IN)",
        "age_head": 35,
        "age_spouse": 33,
        "dependent_ages": [4, 8],
        "income": 55000,
        "state_code": "IN",
        "in_nyc": False,
    },
    {
        "id": "ca_married_nokids",
        "label": "Married couple, no children (CA)",
        "age_head": 40,
        "age_spouse": 38,
        "dependent_ages": [],
        "income": 80000,
        "state_code": "CA",
        "in_nyc": False,
    },
]


def _build_household(ex: dict) -> dict:
    """Build PE household situation matching frontend/lib/household.ts."""
    situation: dict = {
        "people": {
            "you": {
                "age": {YEAR_STR: ex["age_head"]},
                "employment_income": {YEAR_STR: None},
            }
        },
        "families": {"your family": {"members": ["you"]}},
        "marital_units": {"your marital unit": {"members": ["you"]}},
        "spm_units": {"your household": {"members": ["you"]}},
        "tax_units": {"your tax unit": {"members": ["you"]}},
        "households": {
            "your household": {
                "members": ["you"],
                "state_code": {YEAR_STR: ex["state_code"]},
                **(
                    {"county_str": {YEAR_STR: "NEW_YORK_COUNTY_NY"}}
                    if ex.get("in_nyc")
                    else {}
                ),
                "household_net_income": {YEAR_STR: None},
            }
        },
        "axes": [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": MAX_EARNINGS,
                    "count": COUNT,
                    "period": YEAR_STR,
                }
            ]
        ],
    }

    all_units = ["families", "spm_units", "tax_units", "households"]

    # Add spouse
    if ex["age_spouse"] is not None:
        situation["people"]["your partner"] = {
            "age": {YEAR_STR: ex["age_spouse"]}
        }
        for unit in all_units:
            key = list(situation[unit].keys())[0]
            situation[unit][key]["members"].append("your partner")
        situation["marital_units"]["your marital unit"]["members"].append(
            "your partner"
        )

    # Add dependents
    dep_names = [
        "your first dependent",
        "your second dependent",
    ] + [f"dependent_{i + 1}" for i in range(2, 10)]
    for i, age in enumerate(ex["dependent_ages"]):
        name = dep_names[i]
        situation["people"][name] = {"age": {YEAR_STR: age}}
        for unit in all_units:
            key = list(situation[unit].keys())[0]
            situation[unit][key]["members"].append(name)
        situation["marital_units"][f"{name}'s marital unit"] = {
            "members": [name]
        }

    return situation


def _pe_calculate(body: dict) -> dict:
    resp = requests.post(
        f"{PE_API_URL}/us/calculate",
        json=body,
        timeout=120,
    )
    if not resp.ok:
        error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
        print(f"  API error {resp.status_code}: {json.dumps(error_body, indent=2)[:500]}", file=sys.stderr)
        resp.raise_for_status()
    return resp.json()


def _compute_mtr(net_income: list, incomes: list) -> list:
    mtr = []
    for i in range(len(net_income)):
        if i == 0:
            if len(incomes) > 1:
                d_net = net_income[1] - net_income[0]
                d_inc = incomes[1] - incomes[0]
                mtr.append(1 - d_net / d_inc if d_inc > 0 else 0)
            else:
                mtr.append(0)
        else:
            d_net = net_income[i] - net_income[i - 1]
            d_inc = incomes[i] - incomes[i - 1]
            mtr.append(1 - d_net / d_inc if d_inc > 0 else 0)
    return mtr


def _interpolate(xs, ys, x):
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            t = (x - xs[i]) / (xs[i + 1] - xs[i])
            return ys[i] + t * (ys[i + 1] - ys[i])
    return ys[-1]


def precompute_example(ex: dict) -> dict:
    """Compute full household impact response for one example."""
    household = _build_household(ex)

    print(f"  Computing baseline...")
    baseline_result = _pe_calculate({"household": household})

    print(f"  Computing reform...")
    reform_result = _pe_calculate({"household": household, "policy": REFORM})

    income_range = baseline_result["result"]["people"]["you"][
        "employment_income"
    ][YEAR_STR]
    baseline_net = baseline_result["result"]["households"]["your household"][
        "household_net_income"
    ][YEAR_STR]
    reform_net = reform_result["result"]["households"]["your household"][
        "household_net_income"
    ][YEAR_STR]

    net_income_change = [
        reform_net[i] - baseline_net[i] for i in range(len(baseline_net))
    ]
    baseline_mtr = _compute_mtr(baseline_net, income_range)
    reform_mtr = _compute_mtr(reform_net, income_range)

    baseline_at = _interpolate(income_range, baseline_net, ex["income"])
    reform_at = _interpolate(income_range, reform_net, ex["income"])

    # Round arrays to reduce JSON size
    def _round_list(lst, decimals=2):
        return [round(v, decimals) for v in lst]

    return {
        "income_range": _round_list(income_range, 0),
        "net_income_change": _round_list(net_income_change),
        "baseline_net_income": _round_list(baseline_net),
        "reform_net_income": _round_list(reform_net),
        "baseline_mtr": _round_list(baseline_mtr, 4),
        "reform_mtr": _round_list(reform_mtr, 4),
        "benefit_at_income": {
            "baseline": round(baseline_at, 2),
            "reform": round(reform_at, 2),
            "difference": round(reform_at - baseline_at, 2),
        },
        "x_axis_max": MAX_EARNINGS,
    }


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for ex in EXAMPLES:
        print(f"\n[{ex['id']}] {ex['label']}...")
        result = precompute_example(ex)

        path = os.path.join(OUTPUT_DIR, f"{ex['id']}.json")
        with open(path, "w") as f:
            json.dump(result, f)
        size_kb = os.path.getsize(path) / 1024
        print(f"  Saved: {path} ({size_kb:.1f} KB)")

    print("\nDone.")


if __name__ == "__main__":
    main()
