"""Aggregate impact calculations using enhanced CPS microsimulation.

These calculations intentionally follow the shared macro-comparison logic
used by PolicyEngine's API/app stack as closely as possible.
"""

import numpy as np
from microdf import MicroSeries

from policyengine_bootstrap import (
    bootstrap_policyengine_us,
    disable_automatic_structural_reforms,
)

bootstrap_policyengine_us()
disable_automatic_structural_reforms()

from policyengine_us import Microsimulation
import policyengine_us.system as us_system

from reforms import (
    create_aspen_reform,
    create_cbo_lsr_reform,
    create_microsimulation_compatibility_reform,
)


# API v2 intra-decile bounds and labels
_INTRA_BOUNDS = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
_INTRA_LABELS = [
    "Lose more than 5%",
    "Lose less than 5%",
    "No change",
    "Gain less than 5%",
    "Gain more than 5%",
]

_COMPATIBILITY_PATCHED = False


def _ensure_global_compatibility_patch():
    global _COMPATIBILITY_PATCHED
    if _COMPATIBILITY_PATCHED:
        return
    us_system.system.apply_reform_set(
        (create_microsimulation_compatibility_reform(),)
    )
    _COMPATIBILITY_PATCHED = True


def _poverty_metrics(baseline_rate, reform_rate):
    """Return rate change and percent change for a poverty metric."""
    rate_change = reform_rate - baseline_rate
    percent_change = (
        rate_change / baseline_rate * 100 if baseline_rate > 0 else 0.0
    )
    return rate_change, percent_change


def _get_budget_totals(sim, year):
    total_tax = float(sim.calculate("household_tax", period=year).sum())
    try:
        total_state_tax = float(
            sim.calculate("household_state_income_tax", period=year).sum()
        )
    except Exception:
        total_state_tax = 0.0
    total_benefits = float(sim.calculate("household_benefits", period=year).sum())
    total_net_income = float(sim.calculate("household_net_income", period=year).sum())
    return total_tax, total_state_tax, total_benefits, total_net_income


def _calculate_inequality_metrics(sim, year):
    household_count_people = sim.calculate("household_count_people", period=year)
    equiv_income = sim.calculate("equiv_household_net_income", period=year)
    equiv_income[equiv_income < 0] = 0
    equiv_income.weights *= household_count_people

    gini = float(equiv_income.gini())
    in_top_10_pct = equiv_income.decile_rank() == 10
    in_top_1_pct = equiv_income.percentile_rank() == 100

    equiv_income.weights /= household_count_people
    top_10_share = float(
        equiv_income[in_top_10_pct].sum() / equiv_income.sum()
    )
    top_1_share = float(
        equiv_income[in_top_1_pct].sum() / equiv_income.sum()
    )
    return gini, top_10_share, top_1_share


def _calculate_decile_impact(baseline, reform, year):
    baseline_income = MicroSeries(
        baseline.calculate("household_net_income", period=year),
        weights=baseline.calculate("household_weight", period=year),
    )
    reform_income = MicroSeries(
        reform.calculate("household_net_income", period=year),
        weights=baseline_income.weights,
    )
    decile = MicroSeries(baseline.calculate("household_income_decile", period=year))
    decile_mask = decile >= 0
    decile_filtered = decile[decile_mask]
    baseline_income_filtered = baseline_income[decile_mask]
    reform_income_filtered = reform_income[decile_mask]
    income_change = reform_income_filtered - baseline_income_filtered

    relative = (
        income_change.groupby(decile_filtered).sum()
        / baseline_income_filtered.groupby(decile_filtered).sum()
    )
    average = (
        income_change.groupby(decile_filtered).sum()
        / baseline_income_filtered.groupby(decile_filtered).count()
    )
    return (
        {str(int(k)): float(v) for k, v in average.to_dict().items()},
        {str(int(k)): float(v) for k, v in relative.to_dict().items()},
    )


def _compute_income_change(baseline_values, reform_values):
    absolute_change = reform_values - baseline_values
    capped_baseline = np.maximum(baseline_values, 1)
    return absolute_change / capped_baseline


def _calculate_intra_decile_from_arrays(decile, income_change, people):
    outcome_groups = {label: [] for label in _INTRA_LABELS}
    all_outcomes = {}
    for lower, upper, label in zip(
        _INTRA_BOUNDS[:-1], _INTRA_BOUNDS[1:], _INTRA_LABELS
    ):
        for i in range(1, 11):
            in_decile = decile == i
            in_group = (income_change > lower) & (income_change <= upper)
            in_both = in_decile & in_group

            people_in_both = people[in_both].sum()
            people_in_decile = people[in_decile].sum()
            if people_in_decile == 0 and people_in_both == 0:
                people_in_proportion = 0.0
            else:
                people_in_proportion = float(people_in_both / people_in_decile)
            outcome_groups[label].append(people_in_proportion)

        all_outcomes[label] = sum(outcome_groups[label]) / 10
    return all_outcomes, outcome_groups


def _calculate_intra_decile(baseline, reform, year):
    baseline_income = MicroSeries(
        baseline.calculate("household_net_income", period=year),
        weights=baseline.calculate("household_weight", period=year),
    )
    reform_income = MicroSeries(
        reform.calculate("household_net_income", period=year),
        weights=baseline_income.weights,
    )
    people = MicroSeries(
        baseline.calculate("household_count_people", period=year),
        weights=baseline_income.weights,
    )
    decile = MicroSeries(
        baseline.calculate("household_income_decile", period=year)
    ).values
    income_change = _compute_income_change(
        baseline_income.values, reform_income.values
    )
    return _calculate_intra_decile_from_arrays(decile, income_change, people)


def _calculate_poverty_impact(baseline, reform, year):
    baseline_poverty = MicroSeries(
        baseline.calculate("in_poverty", period=year, map_to="person"),
        weights=baseline.calculate("person_weight", period=year),
    )
    baseline_deep_poverty = MicroSeries(
        baseline.calculate("in_deep_poverty", period=year, map_to="person"),
        weights=baseline.calculate("person_weight", period=year),
    )
    reform_poverty = MicroSeries(
        reform.calculate("in_poverty", period=year, map_to="person"),
        weights=baseline_poverty.weights,
    )
    reform_deep_poverty = MicroSeries(
        reform.calculate("in_deep_poverty", period=year, map_to="person"),
        weights=baseline_poverty.weights,
    )
    age = MicroSeries(baseline.calculate("age", period=year))

    poverty = dict(
        child=dict(
            baseline=float(baseline_poverty[age < 18].mean()),
            reform=float(reform_poverty[age < 18].mean()),
        ),
        adult=dict(
            baseline=float(baseline_poverty[(age >= 18) & (age < 65)].mean()),
            reform=float(reform_poverty[(age >= 18) & (age < 65)].mean()),
        ),
        senior=dict(
            baseline=float(baseline_poverty[age >= 65].mean()),
            reform=float(reform_poverty[age >= 65].mean()),
        ),
        all=dict(
            baseline=float(baseline_poverty.mean()),
            reform=float(reform_poverty.mean()),
        ),
    )

    deep_poverty = dict(
        child=dict(
            baseline=float(baseline_deep_poverty[age < 18].mean()),
            reform=float(reform_deep_poverty[age < 18].mean()),
        ),
        adult=dict(
            baseline=float(
                baseline_deep_poverty[(age >= 18) & (age < 65)].mean()
            ),
            reform=float(
                reform_deep_poverty[(age >= 18) & (age < 65)].mean()
            ),
        ),
        senior=dict(
            baseline=float(baseline_deep_poverty[age >= 65].mean()),
            reform=float(reform_deep_poverty[age >= 65].mean()),
        ),
        all=dict(
            baseline=float(baseline_deep_poverty.mean()),
            reform=float(reform_deep_poverty.mean()),
        ),
    )
    return poverty, deep_poverty


def calculate_aggregate_impact(
    year: int = 2026, cbo_lsr: bool = False
) -> dict:
    _ensure_global_compatibility_patch()
    reform = create_aspen_reform()
    if cbo_lsr:
        reform = reform + (create_cbo_lsr_reform(),)

    sim_baseline = Microsimulation()
    sim_reform = Microsimulation(reform=reform)

    # ===== FISCAL IMPACT =====
    (
        baseline_total_tax,
        baseline_total_state_tax,
        baseline_total_benefits,
        baseline_total_net_income,
    ) = _get_budget_totals(sim_baseline, year)
    (
        reform_total_tax,
        reform_total_state_tax,
        reform_total_benefits,
        _,
    ) = _get_budget_totals(sim_reform, year)

    tax_revenue_impact = reform_total_tax - baseline_total_tax
    state_tax_revenue_impact = (
        reform_total_state_tax - baseline_total_state_tax
    )
    federal_tax_revenue_impact = (
        tax_revenue_impact - state_tax_revenue_impact
    )
    benefit_spending_impact = reform_total_benefits - baseline_total_benefits
    budgetary_impact = tax_revenue_impact - benefit_spending_impact

    # household_net_income change for all distributional analysis
    baseline_net_income = sim_baseline.calculate(
        "household_net_income", period=year, map_to="household"
    )
    reform_net_income = sim_reform.calculate(
        "household_net_income", period=year, map_to="household"
    )
    income_change = reform_net_income - baseline_net_income
    baseline_gini, baseline_top_10_share, baseline_top_1_share = (
        _calculate_inequality_metrics(sim_baseline, year)
    )
    reform_gini, reform_top_10_share, reform_top_1_share = (
        _calculate_inequality_metrics(sim_reform, year)
    )

    total_households = float((income_change * 0 + 1).sum())

    # ===== WINNERS / LOSERS =====
    winners = float((income_change > 1).sum())
    losers = float((income_change < -1).sum())
    beneficiaries = float((income_change > 0).sum())

    affected = abs(income_change) > 1
    affected_count = float(affected.sum())
    avg_benefit = (
        float(income_change[affected].sum() / affected.sum())
        if affected_count > 0
        else 0.0
    )

    winners_rate = winners / total_households * 100
    losers_rate = losers / total_households * 100

    # ===== INCOME DECILE ANALYSIS =====
    decile_average, decile_relative = _calculate_decile_impact(
        sim_baseline, sim_reform, year
    )
    intra_decile_all, intra_decile_deciles = _calculate_intra_decile(
        sim_baseline, sim_reform, year
    )

    # ===== POVERTY IMPACT =====
    poverty, deep_poverty = _calculate_poverty_impact(
        sim_baseline, sim_reform, year
    )
    poverty_baseline_rate = poverty["all"]["baseline"]
    poverty_reform_rate = poverty["all"]["reform"]
    poverty_rate_change, poverty_percent_change = _poverty_metrics(
        poverty_baseline_rate, poverty_reform_rate
    )
    child_poverty_baseline_rate = poverty["child"]["baseline"]
    child_poverty_reform_rate = poverty["child"]["reform"]
    child_poverty_rate_change, child_poverty_percent_change = (
        _poverty_metrics(
            child_poverty_baseline_rate, child_poverty_reform_rate
        )
    )
    adult_poverty_baseline_rate = poverty["adult"]["baseline"]
    adult_poverty_reform_rate = poverty["adult"]["reform"]
    senior_poverty_baseline_rate = poverty["senior"]["baseline"]
    senior_poverty_reform_rate = poverty["senior"]["reform"]

    deep_poverty_baseline_rate = deep_poverty["all"]["baseline"]
    deep_poverty_reform_rate = deep_poverty["all"]["reform"]
    deep_poverty_rate_change, deep_poverty_percent_change = (
        _poverty_metrics(
            deep_poverty_baseline_rate, deep_poverty_reform_rate
        )
    )
    deep_child_poverty_baseline_rate = deep_poverty["child"]["baseline"]
    deep_child_poverty_reform_rate = deep_poverty["child"]["reform"]
    deep_child_poverty_rate_change, deep_child_poverty_percent_change = (
        _poverty_metrics(
            deep_child_poverty_baseline_rate,
            deep_child_poverty_reform_rate,
        )
    )
    deep_adult_poverty_baseline_rate = deep_poverty["adult"]["baseline"]
    deep_adult_poverty_reform_rate = deep_poverty["adult"]["reform"]
    deep_senior_poverty_baseline_rate = deep_poverty["senior"]["baseline"]
    deep_senior_poverty_reform_rate = deep_poverty["senior"]["reform"]

    # ===== INCOME BRACKET BREAKDOWN =====
    agi = sim_reform.calculate(
        "adjusted_gross_income", period=year, map_to="household"
    )
    agi_arr = np.array(agi)
    change_arr = np.array(income_change)
    affected_mask = np.abs(change_arr) > 1
    weight_arr = np.array(sim_reform.calculate("household_weight", period=year))

    income_brackets = [
        (float("-inf"), 50_000, "Under $50k"),
        (50_000, 100_000, "$50k-$100k"),
        (100_000, 200_000, "$100k-$200k"),
        (200_000, 500_000, "$200k-$500k"),
        (500_000, 1_000_000, "$500k-$1M"),
        (1_000_000, 2_000_000, "$1M-$2M"),
        (2_000_000, float("inf"), "Over $2M"),
    ]

    by_income_bracket = []
    for min_inc, max_inc, label in income_brackets:
        mask = (
            (agi_arr >= min_inc)
            & (agi_arr < max_inc)
            & affected_mask
        )
        bracket_affected = float(weight_arr[mask].sum())
        if bracket_affected > 0:
            bracket_cost = float(
                (change_arr[mask] * weight_arr[mask]).sum()
            )
            bracket_avg = float(
                np.average(change_arr[mask], weights=weight_arr[mask])
            )
        else:
            bracket_cost = 0.0
            bracket_avg = 0.0
        by_income_bracket.append(
            {
                "bracket": label,
                "beneficiaries": bracket_affected,
                "total_cost": bracket_cost,
                "avg_benefit": bracket_avg,
            }
        )

    return {
        "budget": {
            "budgetary_impact": budgetary_impact,
            "federal_tax_revenue_impact": federal_tax_revenue_impact,
            "state_tax_revenue_impact": state_tax_revenue_impact,
            "tax_revenue_impact": tax_revenue_impact,
            "benefit_spending_impact": benefit_spending_impact,
            "baseline_net_income": baseline_total_net_income,
            "households": total_households,
        },
        "decile": {
            "average": decile_average,
            "relative": decile_relative,
        },
        "inequality": {
            "gini": {
                "baseline": baseline_gini,
                "reform": reform_gini,
                "change": reform_gini - baseline_gini,
            },
            "top_10_pct_share": {
                "baseline": baseline_top_10_share,
                "reform": reform_top_10_share,
                "change": reform_top_10_share - baseline_top_10_share,
            },
            "top_1_pct_share": {
                "baseline": baseline_top_1_share,
                "reform": reform_top_1_share,
                "change": reform_top_1_share - baseline_top_1_share,
            },
        },
        "intra_decile": {
            "all": intra_decile_all,
            "deciles": intra_decile_deciles,
        },
        "poverty": {
            "poverty": poverty,
            "deep_poverty": deep_poverty,
        },
        "total_cost": -budgetary_impact,
        "beneficiaries": beneficiaries,
        "avg_benefit": avg_benefit,
        "winners": winners,
        "losers": losers,
        "winners_rate": winners_rate,
        "losers_rate": losers_rate,
        "poverty_baseline_rate": poverty_baseline_rate,
        "poverty_reform_rate": poverty_reform_rate,
        "poverty_rate_change": poverty_rate_change,
        "poverty_percent_change": poverty_percent_change,
        "child_poverty_baseline_rate": child_poverty_baseline_rate,
        "child_poverty_reform_rate": child_poverty_reform_rate,
        "child_poverty_rate_change": child_poverty_rate_change,
        "child_poverty_percent_change": child_poverty_percent_change,
        "adult_poverty_baseline_rate": adult_poverty_baseline_rate,
        "adult_poverty_reform_rate": adult_poverty_reform_rate,
        "senior_poverty_baseline_rate": senior_poverty_baseline_rate,
        "senior_poverty_reform_rate": senior_poverty_reform_rate,
        "deep_poverty_baseline_rate": deep_poverty_baseline_rate,
        "deep_poverty_reform_rate": deep_poverty_reform_rate,
        "deep_poverty_rate_change": deep_poverty_rate_change,
        "deep_poverty_percent_change": deep_poverty_percent_change,
        "deep_child_poverty_baseline_rate": deep_child_poverty_baseline_rate,
        "deep_child_poverty_reform_rate": deep_child_poverty_reform_rate,
        "deep_child_poverty_rate_change": deep_child_poverty_rate_change,
        "deep_child_poverty_percent_change": deep_child_poverty_percent_change,
        "deep_adult_poverty_baseline_rate": deep_adult_poverty_baseline_rate,
        "deep_adult_poverty_reform_rate": deep_adult_poverty_reform_rate,
        "deep_senior_poverty_baseline_rate": deep_senior_poverty_baseline_rate,
        "deep_senior_poverty_reform_rate": deep_senior_poverty_reform_rate,
        "by_income_bracket": by_income_bracket,
    }
