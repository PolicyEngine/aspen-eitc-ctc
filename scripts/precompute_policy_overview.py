"""Pre-compute model-backed policy overview chart data.

Generates static curves for:
- EITC by filing status (single/married) and child count (1/2/3)
- CTC value by filing status (single/married) and child age (under6/6to17)

Usage:
    python scripts/precompute_policy_overview.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from policyengine_bootstrap import (
    bootstrap_policyengine_us,
    disable_automatic_structural_reforms,
)

bootstrap_policyengine_us()
disable_automatic_structural_reforms()

from policyengine_us import Simulation

from reforms import create_aspen_reform

YEAR = 2026
YEAR_STR = str(YEAR)
EITC_MAX = 70_000
EITC_STEP = 250
CTC_MAX = 500_000
CTC_STEP = 1_000

OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "lib",
    "data",
    "policyOverviewData.json",
)


def _add_member_to_units(situation: dict, member_id: str) -> None:
    for unit in ("families", "spm_units", "tax_units", "households"):
        key = next(iter(situation[unit]))
        situation[unit][key]["members"].append(member_id)


def _build_situation(
    *,
    age_head: int,
    age_spouse: int | None,
    dependent_ages: list[int],
    axis_max: int,
    axis_count: int,
    variable_name: str,
) -> dict:
    situation = {
        "people": {
            "you": {
                "age": {YEAR_STR: age_head},
                "employment_income": {YEAR_STR: 0},
            }
        },
        "families": {"your family": {"members": ["you"]}},
        "marital_units": {"your marital unit": {"members": ["you"]}},
        "spm_units": {"your household": {"members": ["you"]}},
        "tax_units": {
            "your tax unit": {
                "members": ["you"],
                "eitc_child_count": {YEAR_STR: None},
                variable_name: {YEAR_STR: None},
            }
        },
        "households": {
            "your household": {
                "members": ["you"],
                "state_code": {YEAR_STR: "CA"},
            }
        },
        "axes": [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": axis_max,
                    "count": axis_count,
                    "period": YEAR_STR,
                }
            ]
        ],
    }

    if age_spouse is not None:
        situation["people"]["your partner"] = {"age": {YEAR_STR: age_spouse}}
        _add_member_to_units(situation, "your partner")
        situation["marital_units"]["your marital unit"]["members"].append(
            "your partner"
        )

    dep_names = [
        "your first dependent",
        "your second dependent",
    ] + [f"dependent_{i + 1}" for i in range(2, 10)]
    for i, dep_age in enumerate(dependent_ages):
        dep_name = dep_names[i]
        situation["people"][dep_name] = {"age": {YEAR_STR: dep_age}}
        _add_member_to_units(situation, dep_name)
        situation["marital_units"][f"{dep_name}'s marital unit"] = {
            "members": [dep_name]
        }

    return situation


def _extract_axis_values(
    sim: Simulation, variable_name: str, situation: dict
) -> list[float]:
    result = sim.calculate(variable_name, YEAR)
    variable = sim.tax_benefit_system.get_variable(variable_name)
    entity_plural = variable.entity.plural
    count_entities = len(situation[entity_plural])
    entity_index = 0
    return (
        result.astype(float)
        .reshape((-1, count_entities))
        .T[entity_index]
        .tolist()
    )


def _round_list(values: list[float], decimals: int = 2) -> list[float]:
    return [round(value, decimals) for value in values]


def _compute_curve(
    *,
    age_head: int,
    age_spouse: int | None,
    dependent_ages: list[int],
    axis_max: int,
    axis_step: int,
    variable_name: str | None = None,
    variable_names: list[str] | None = None,
    patch_childless_eitc: bool = False,
) -> dict:
    if (variable_name is None) == (variable_names is None):
        raise ValueError(
            "Provide exactly one of variable_name or variable_names."
        )

    output_variable = variable_name or variable_names[0]
    axis_count = axis_max // axis_step + 1
    situation = _build_situation(
        age_head=age_head,
        age_spouse=age_spouse,
        dependent_ages=dependent_ages,
        axis_max=axis_max,
        axis_count=axis_count,
        variable_name=output_variable,
    )

    baseline = Simulation(situation=situation)
    reform = Simulation(situation=situation, reform=create_aspen_reform())

    income_range = _extract_axis_values(baseline, "employment_income", situation)
    if variable_name is not None:
        current = _extract_axis_values(baseline, variable_name, situation)
        reform_values = _extract_axis_values(reform, variable_name, situation)
    else:
        current_parts = [
            _extract_axis_values(baseline, name, situation)
            for name in variable_names
        ]
        reform_parts = [
            _extract_axis_values(reform, name, situation)
            for name in variable_names
        ]
        current = [
            sum(part[i] for part in current_parts)
            for i in range(len(current_parts[0]))
        ]
        reform_values = [
            sum(part[i] for part in reform_parts)
            for i in range(len(reform_parts[0]))
        ]

    if patch_childless_eitc:
        child_count = _extract_axis_values(
            baseline, "eitc_child_count", situation
        )
        reform_values = [
            reform_value if child_count[i] > 0 else current[i]
            for i, reform_value in enumerate(reform_values)
        ]

    return {
        "income_range": _round_list(income_range, 0),
        "current": _round_list(current),
        "reform": _round_list(reform_values),
        "x_axis_max": axis_max,
    }


def _compute_curve_with_custom_value_definitions(
    *,
    age_head: int,
    age_spouse: int | None,
    dependent_ages: list[int],
    axis_max: int,
    axis_step: int,
    current_variable_names: list[str],
    reform_variable_names: list[str],
) -> dict:
    axis_count = axis_max // axis_step + 1
    situation = _build_situation(
        age_head=age_head,
        age_spouse=age_spouse,
        dependent_ages=dependent_ages,
        axis_max=axis_max,
        axis_count=axis_count,
        variable_name=current_variable_names[0],
    )

    baseline = Simulation(situation=situation)
    reform = Simulation(situation=situation, reform=create_aspen_reform())

    income_range = _extract_axis_values(baseline, "employment_income", situation)
    current_parts = [
        _extract_axis_values(baseline, name, situation)
        for name in current_variable_names
    ]
    reform_parts = [
        _extract_axis_values(reform, name, situation)
        for name in reform_variable_names
    ]

    current = [
        sum(part[i] for part in current_parts)
        for i in range(len(current_parts[0]))
    ]
    reform_values = [
        sum(part[i] for part in reform_parts)
        for i in range(len(reform_parts[0]))
    ]

    return {
        "income_range": _round_list(income_range, 0),
        "current": _round_list(current),
        "reform": _round_list(reform_values),
        "x_axis_max": axis_max,
    }


def main() -> None:
    eitc = {}
    for filing_status, spouse_age in (("single", None), ("married", 30)):
        for child_count in (1, 2, 3):
            key = f"{filing_status}_{child_count}"
            eitc[key] = _compute_curve(
                age_head=30,
                age_spouse=spouse_age,
                dependent_ages=[4, 8, 12][:child_count],
                axis_max=EITC_MAX,
                axis_step=EITC_STEP,
                variable_name="eitc",
                patch_childless_eitc=True,
            )

    ctc = {}
    for filing_status, spouse_age in (("single", None), ("married", 30)):
        for age_label, dep_age in (("under6", 3), ("6to17", 10)):
            key = f"{filing_status}_{age_label}"
            print(f"  CTC: {key}...")
            ctc[key] = _compute_curve_with_custom_value_definitions(
                age_head=30,
                age_spouse=spouse_age,
                dependent_ages=[dep_age],
                axis_max=CTC_MAX,
                axis_step=CTC_STEP,
                current_variable_names=["ctc_value"],
                reform_variable_names=["refundable_ctc", "non_refundable_ctc"],
            )

    output = {
        "eitc": eitc,
        "ctc": ctc,
        # Keep legacy key for backward compatibility during deploy
        "ctc_single_under6": ctc["single_under6"],
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f)
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
