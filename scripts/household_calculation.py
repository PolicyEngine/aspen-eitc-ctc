"""Shared household impact calculation logic for local scripts and Modal."""

from __future__ import annotations

import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from policyengine_bootstrap import bootstrap_policyengine_us

bootstrap_policyengine_us()

from policyengine_us import Simulation

from reforms import create_aspen_reform


def build_household_situation(params: dict[str, Any]) -> dict[str, Any]:
    """Build a PolicyEngine household situation matching the frontend."""

    age_head = params["age_head"]
    age_spouse = params.get("age_spouse")
    dependent_ages = params.get("dependent_ages", [])
    income = params["income"]
    year = params["year"]
    max_earnings = params["max_earnings"]
    state_code = params["state_code"]
    in_nyc = params.get("in_nyc")

    year_str = str(year)
    axis_max = max(max_earnings, 200_000, 2 * income)

    situation: dict[str, Any] = {
        "people": {
            "you": {
                "age": {year_str: age_head},
                "employment_income": {year_str: None},
                "marginal_tax_rate": {year_str: None},
            },
        },
        "families": {"your family": {"members": ["you"]}},
        "marital_units": {"your marital unit": {"members": ["you"]}},
        "spm_units": {"your household": {"members": ["you"]}},
        "tax_units": {
            "your tax unit": {
                "members": ["you"],
                "eitc_child_count": {year_str: None},
            }
        },
        "households": {
            "your household": {
                "members": ["you"],
                "state_code": {year_str: state_code},
                "household_net_income": {year_str: None},
            }
        },
        "axes": [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": axis_max,
                    "count": 401,
                    "period": year_str,
                }
            ]
        ],
    }

    if state_code == "NY" and in_nyc:
        situation["households"]["your household"]["county_str"] = {
            year_str: "NEW_YORK_COUNTY_NY"
        }

    if age_spouse is not None:
        situation["people"]["your partner"] = {"age": {year_str: age_spouse}}
        for unit in ("families", "spm_units", "tax_units", "households"):
            key = next(iter(situation[unit]))
            situation[unit][key]["members"].append("your partner")
        situation["marital_units"]["your marital unit"]["members"].append(
            "your partner"
        )

    dep_names = [
        "your first dependent",
        "your second dependent",
    ] + [f"dependent_{i + 1}" for i in range(2, 10)]
    for i, dep_age in enumerate(dependent_ages):
        dep_name = dep_names[i]
        situation["people"][dep_name] = {"age": {year_str: dep_age}}
        for unit in ("families", "spm_units", "tax_units", "households"):
            key = next(iter(situation[unit]))
            situation[unit][key]["members"].append(dep_name)
        situation["marital_units"][f"{dep_name}'s marital unit"] = {
            "members": [dep_name]
        }

    return situation


def _extract_axis_values(
    sim: Simulation, variable_name: str, year: int, situation: dict[str, Any]
) -> list[float]:
    """Extract axis values using the same reshape logic as the public API."""

    result = sim.calculate(variable_name, year)
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


def _interpolate(xs: list[float], ys: list[float], x: float) -> float:
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            t = (x - xs[i]) / (xs[i + 1] - xs[i])
            return ys[i] + t * (ys[i + 1] - ys[i])
    return ys[-1]


def calculate_household_impact(
    request: dict[str, Any],
) -> dict[str, Any]:
    """Return the household impact response consumed by the frontend."""

    year = int(request["year"])
    situation = build_household_situation(request)
    reform = create_aspen_reform()

    baseline = Simulation(situation=situation)
    reform_sim = Simulation(situation=situation, reform=reform)

    income_range = _extract_axis_values(
        baseline, "employment_income", year, situation
    )
    baseline_net_income = _extract_axis_values(
        baseline, "household_net_income", year, situation
    )
    reform_net_income = _extract_axis_values(
        reform_sim, "household_net_income", year, situation
    )
    baseline_mtr = _extract_axis_values(
        baseline, "marginal_tax_rate", year, situation
    )
    reform_mtr = _extract_axis_values(
        reform_sim, "marginal_tax_rate", year, situation
    )

    net_income_change = [
        reform_net_income[i] - baseline_net_income[i]
        for i in range(len(baseline_net_income))
    ]

    baseline_at_income = _interpolate(
        income_range, baseline_net_income, float(request["income"])
    )
    reform_at_income = _interpolate(
        income_range, reform_net_income, float(request["income"])
    )

    return {
        "income_range": income_range,
        "net_income_change": net_income_change,
        "baseline_net_income": baseline_net_income,
        "reform_net_income": reform_net_income,
        "baseline_mtr": baseline_mtr,
        "reform_mtr": reform_mtr,
        "benefit_at_income": {
            "baseline": baseline_at_income,
            "reform": reform_at_income,
            "difference": reform_at_income - baseline_at_income,
        },
        "x_axis_max": income_range[-1]
        if income_range
        else float(request["max_earnings"]),
    }
