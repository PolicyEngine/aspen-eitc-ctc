"""Pre-compute household impact data for the 3 example households.

Uses the local policyengine-us package directly (not the API) so it works
as soon as the package has the required reforms, without waiting for API
deployment.

Usage:
    python scripts/precompute_examples.py
"""

import json
import os
import sys

import numpy as np
from policyengine_core.reforms import Reform
from policyengine_us import Simulation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reforms import create_aspen_reform

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "public",
    "data",
    "examples",
)

YEAR = 2026
MAX_EARNINGS = 200000
COUNT = 401

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


def _build_situation(ex: dict) -> dict:
    """Build PE household situation matching frontend/lib/household.ts."""
    year_str = str(YEAR)
    situation = {
        "people": {
            "you": {
                "age": {year_str: ex["age_head"]},
                "employment_income": {year_str: 0},
            }
        },
        "families": {"your family": {"members": ["you"]}},
        "marital_units": {"your marital unit": {"members": ["you"]}},
        "spm_units": {"your household": {"members": ["you"]}},
        "tax_units": {"your tax unit": {"members": ["you"]}},
        "households": {
            "your household": {
                "members": ["you"],
                "state_code": {year_str: ex["state_code"]},
            }
        },
        "axes": [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": MAX_EARNINGS,
                    "count": COUNT,
                    "period": year_str,
                }
            ]
        ],
    }

    if ex.get("in_nyc"):
        situation["households"]["your household"]["county_str"] = {
            year_str: "NEW_YORK_COUNTY_NY"
        }

    all_units = ["families", "spm_units", "tax_units", "households"]

    # Add spouse
    if ex["age_spouse"] is not None:
        situation["people"]["your partner"] = {
            "age": {year_str: ex["age_spouse"]}
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
        situation["people"][name] = {"age": {year_str: age}}
        for unit in all_units:
            key = list(situation[unit].keys())[0]
            situation[unit][key]["members"].append(name)
        situation["marital_units"][f"{name}'s marital unit"] = {
            "members": [name]
        }

    return situation


def _compute_mtr(net_income, incomes):
    mtr = []
    for i in range(len(net_income)):
        if i == 0:
            if len(incomes) > 1:
                d_net = net_income[1] - net_income[0]
                d_inc = incomes[1] - incomes[0]
                mtr.append(float(1 - d_net / d_inc) if d_inc > 0 else 0.0)
            else:
                mtr.append(0.0)
        else:
            d_net = net_income[i] - net_income[i - 1]
            d_inc = incomes[i] - incomes[i - 1]
            mtr.append(float(1 - d_net / d_inc) if d_inc > 0 else 0.0)
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


def _extract_axis_values(sim, variable, year, situation):
    """Extract per-entity values from an axes simulation, matching the API reshape logic.

    When axes are present, sim.calculate() returns a flat array with all
    entity instances interleaved.  The API reshapes via:
        result.reshape((-1, count_entities)).T[entity_index]
    We replicate that here.
    """
    result = sim.calculate(variable, year)
    variable_obj = sim.tax_benefit_system.get_variable(variable)
    entity_plural = variable_obj.entity.plural

    count_entities = len(situation[entity_plural])
    # First entity in the dict (e.g. "you" for people, "your household" for households)
    entity_index = 0

    return (
        result.astype(float)
        .reshape((-1, count_entities))
        .T[entity_index]
        .tolist()
    )


def precompute_example(ex: dict) -> dict:
    """Compute full household impact response for one example."""
    situation = _build_situation(ex)
    reform = (create_aspen_reform(),)

    print("  Running baseline...")
    sim_baseline = Simulation(situation=situation)
    print("  Running reform...")
    sim_reform = Simulation(situation=situation, reform=reform)

    # Extract arrays using axes reshape (matches PE API pattern)
    income_range = _extract_axis_values(
        sim_baseline, "employment_income", YEAR, situation
    )
    baseline_net = _extract_axis_values(
        sim_baseline, "household_net_income", YEAR, situation
    )
    reform_net = _extract_axis_values(
        sim_reform, "household_net_income", YEAR, situation
    )

    net_income_change = [
        reform_net[i] - baseline_net[i] for i in range(len(baseline_net))
    ]
    baseline_mtr = _compute_mtr(baseline_net, income_range)
    reform_mtr = _compute_mtr(reform_net, income_range)

    baseline_at = _interpolate(income_range, baseline_net, ex["income"])
    reform_at = _interpolate(income_range, reform_net, ex["income"])

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
