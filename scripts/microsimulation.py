"""Aggregate impact calculations using the policyengine.py 4.3 API.

Replaces the earlier ``policyengine_us.Microsimulation``-based
implementation. The public ``calculate_aggregate_impact(year, cbo_lsr)``
return shape is preserved so that ``scripts/pipeline.py`` and the
frontend CSV extractors continue to work unchanged.
"""

from __future__ import annotations

import os
from typing import Any

import numpy as np
import pandas as pd

from policyengine.core import Simulation
from policyengine.outputs.change_aggregate import (
    ChangeAggregate,
    ChangeAggregateType,
)
from policyengine.outputs.inequality import (
    USInequalityPreset,
    calculate_us_inequality,
)
from policyengine.outputs.poverty import calculate_us_poverty_rates
from policyengine.tax_benefit_models.us import (
    ensure_datasets,
    us_latest,
)


DATA_FOLDER = os.environ.get(
    "POLICYENGINE_DATA_FOLDER",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
    ),
)

DATASET_REF = "hf://policyengine/policyengine-us-data/enhanced_cps_2024.h5"


# API v2 intra-decile bounds and labels — preserved for pipeline.py / tests.
_INTRA_BOUNDS = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
_INTRA_LABELS = [
    "Lose more than 5%",
    "Lose less than 5%",
    "No change",
    "Gain less than 5%",
    "Gain more than 5%",
]


def _build_reform_dict(cbo_lsr: bool) -> dict[str, Any]:
    """Parametric Aspen reform compatible with ``Simulation(policy=...)``.

    The new engine compiles a flat ``{path: value}`` mapping into a
    ``Policy`` effective from Jan 1 of the simulation year. Values are
    held open-ended, so one dict works for every year in the pipeline.
    """
    reform: dict[str, Any] = {
        # Streamlined EITC
        "gov.contrib.streamlined_eitc.in_effect": True,
        "gov.contrib.streamlined_eitc.max.single[1].amount": 3995,
        "gov.contrib.streamlined_eitc.max.joint[1].amount": 4993,
        "gov.irs.credits.eitc.phase_in_rate[1].amount": 0.34,
        "gov.irs.credits.eitc.phase_in_rate[2].amount": 0.34,
        "gov.irs.credits.eitc.phase_in_rate[3].amount": 0.34,
        "gov.irs.credits.eitc.phase_out.start[1].amount": 21560,
        "gov.irs.credits.eitc.phase_out.start[2].amount": 21560,
        "gov.irs.credits.eitc.phase_out.start[3].amount": 21560,
        "gov.irs.credits.eitc.phase_out.joint_bonus[1].amount": 5390,
        "gov.irs.credits.eitc.phase_out.rate[1].amount": 0.1598,
        "gov.irs.credits.eitc.phase_out.rate[2].amount": 0.1598,
        "gov.irs.credits.eitc.phase_out.rate[3].amount": 0.1598,
        # Enhanced CTC
        "gov.irs.credits.ctc.phase_out.arpa.in_effect": True,
        "gov.irs.credits.ctc.amount.arpa[0].amount": 3600,
        "gov.irs.credits.ctc.amount.arpa[1].amount": 3000,
        "gov.irs.credits.ctc.phase_out.threshold.SINGLE": 75000,
        "gov.irs.credits.ctc.phase_out.threshold.HEAD_OF_HOUSEHOLD": 75000,
        "gov.irs.credits.ctc.phase_out.threshold.JOINT": 110000,
        "gov.irs.credits.ctc.phase_out.threshold.SURVIVING_SPOUSE": 110000,
        "gov.irs.credits.ctc.phase_out.threshold.SEPARATE": 55000,
        "gov.irs.credits.ctc.phase_out.arpa.threshold.SINGLE": 75000,
        "gov.irs.credits.ctc.phase_out.arpa.threshold.HEAD_OF_HOUSEHOLD": 75000,
        "gov.irs.credits.ctc.phase_out.arpa.threshold.JOINT": 110000,
        "gov.irs.credits.ctc.phase_out.arpa.threshold.SURVIVING_SPOUSE": 110000,
        "gov.irs.credits.ctc.phase_out.arpa.threshold.SEPARATE": 55000,
        "gov.contrib.ctc.linear_phase_out.in_effect": True,
        "gov.contrib.ctc.linear_phase_out.end.SINGLE": 240000,
        "gov.contrib.ctc.linear_phase_out.end.HEAD_OF_HOUSEHOLD": 240000,
        "gov.contrib.ctc.linear_phase_out.end.JOINT": 440000,
        "gov.contrib.ctc.linear_phase_out.end.SURVIVING_SPOUSE": 440000,
        "gov.contrib.ctc.linear_phase_out.end.SEPARATE": 175000,
        "gov.irs.credits.ctc.refundable.individual_max": 3600,
        "gov.irs.credits.ctc.refundable.phase_in.rate": 0.30,
        "gov.irs.credits.ctc.refundable.phase_in.threshold": 0,
        "gov.contrib.ctc.minimum_refundable.in_effect": True,
        "gov.contrib.ctc.minimum_refundable.amount[0].amount": 1800,
        "gov.contrib.ctc.minimum_refundable.amount[1].amount": 1500,
    }
    if cbo_lsr:
        reform["gov.simulation.labor_supply_responses.elasticities.income"] = -0.05
        reform[
            "gov.simulation.labor_supply_responses.elasticities.substitution.all"
        ] = 0.25
    return reform


def _get_dataset(year: int):
    """Return the enhanced-CPS dataset for ``year``, downloading on first use."""
    datasets = ensure_datasets(
        datasets=[DATASET_REF],
        years=[year],
        data_folder=DATA_FOLDER,
    )
    return datasets[f"enhanced_cps_2024_{year}"]


def _sum_series(df, column: str) -> float:
    """Weighted sum of a MicroDataFrame column."""
    return float(df[column].sum())


def _household_net_income_change(baseline_sim, reform_sim):
    """Return (baseline_income, reform_income, income_change, weights) series."""
    baseline_hh = baseline_sim.output_dataset.data.household
    reform_hh = reform_sim.output_dataset.data.household
    baseline_income = baseline_hh["household_net_income"]
    reform_income = reform_hh["household_net_income"]
    income_change = reform_income - baseline_income
    return baseline_income, reform_income, income_change


def _poverty_metrics(baseline_rate: float, reform_rate: float) -> tuple[float, float]:
    rate_change = reform_rate - baseline_rate
    percent_change = (
        rate_change / baseline_rate * 100 if baseline_rate > 0 else 0.0
    )
    return rate_change, percent_change


def _poverty_by_age(sim, *, age_geq: int | None = None, age_leq: int | None = None):
    """Return ``{poverty_type: rate}`` from policyengine.py's helper."""
    kwargs = {"filter_variable": "age"}
    if age_geq is not None:
        kwargs["filter_variable_geq"] = age_geq
    if age_leq is not None:
        kwargs["filter_variable_leq"] = age_leq
    result = calculate_us_poverty_rates(sim, **kwargs)
    return {p.poverty_type: float(p.rate) for p in result.outputs}


def _calculate_intra_decile_from_arrays(
    decile: np.ndarray, income_change: np.ndarray, people: np.ndarray
) -> tuple[dict[str, float], dict[str, list[float]]]:
    """Decile-by-decile gain/loss group proportions, weighted by people.

    Preserved verbatim from the prior implementation so the response
    schema and the unit test in ``tests/test_aspen_reform.py`` keep
    working.
    """
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


def _compute_intra_decile(baseline_sim, reform_sim) -> tuple[dict, dict]:
    """Compute intra-decile gain/loss proportions weighted by person count."""
    baseline_hh = baseline_sim.output_dataset.data.household
    reform_hh = reform_sim.output_dataset.data.household

    baseline_income = np.asarray(baseline_hh["household_net_income"].values)
    reform_income = np.asarray(reform_hh["household_net_income"].values)
    decile = np.asarray(baseline_hh["household_income_decile"].values)
    count_people = np.asarray(baseline_hh["household_count_people"].values)
    weight = np.asarray(baseline_hh["household_weight"].values)
    people_weighted = count_people * weight

    capped_baseline = np.maximum(baseline_income, 1)
    rel_change = (reform_income - baseline_income) / capped_baseline
    return _calculate_intra_decile_from_arrays(decile, rel_change, people_weighted)


def _compute_decile_impact(baseline_sim, reform_sim) -> tuple[dict, dict]:
    """Per-decile average change ($) and relative change (fraction)."""
    baseline_hh = baseline_sim.output_dataset.data.household
    reform_hh = reform_sim.output_dataset.data.household
    baseline_income = np.asarray(baseline_hh["household_net_income"].values)
    reform_income = np.asarray(reform_hh["household_net_income"].values)
    decile = np.asarray(baseline_hh["household_income_decile"].values)
    weight = np.asarray(baseline_hh["household_weight"].values)

    income_change = reform_income - baseline_income
    mask = decile >= 1

    avg: dict[str, float] = {}
    rel: dict[str, float] = {}
    for d in range(1, 11):
        d_mask = mask & (decile == d)
        total_w = weight[d_mask].sum()
        if total_w == 0:
            avg[str(d)] = 0.0
            rel[str(d)] = 0.0
            continue
        sum_change = float((income_change[d_mask] * weight[d_mask]).sum())
        sum_baseline = float((baseline_income[d_mask] * weight[d_mask]).sum())
        avg[str(d)] = sum_change / total_w
        rel[str(d)] = sum_change / sum_baseline if sum_baseline else 0.0
    return avg, rel


def _compute_inequality(sim) -> tuple[float, float, float]:
    """Gini, top-10%, top-1% shares via policyengine.py's CBO-comparable preset.

    ``USInequalityPreset.CBO_COMPARABLE`` equivalises by household size
    (power 0.5) and weights by household_weight × household_count_people,
    matching the approach used in policyengine-app / api.
    """
    inequality = calculate_us_inequality(
        sim, preset=USInequalityPreset.CBO_COMPARABLE
    )
    return (
        float(inequality.gini),
        float(inequality.top_10_share),
        float(inequality.top_1_share),
    )


def calculate_aggregate_impact(
    year: int = 2026, cbo_lsr: bool = False
) -> dict:
    """Run baseline + reform microsimulation and return aggregate metrics.

    Returns a dict matching the shape consumed by
    ``scripts/pipeline.py`` and (via extracted CSVs) by
    ``frontend/hooks/useAggregateImpact.ts``.
    """
    dataset = _get_dataset(year)
    reform_dict = _build_reform_dict(cbo_lsr=cbo_lsr)

    baseline_sim = Simulation(
        dataset=dataset,
        tax_benefit_model_version=us_latest,
        extra_variables={"tax_unit": ["adjusted_gross_income"]},
    )
    reform_sim = Simulation(
        dataset=dataset,
        tax_benefit_model_version=us_latest,
        policy=reform_dict,
        extra_variables={"tax_unit": ["adjusted_gross_income"]},
    )
    baseline_sim.ensure()
    reform_sim.ensure()

    # ===== FISCAL IMPACT =====
    baseline_hh = baseline_sim.output_dataset.data.household
    reform_hh = reform_sim.output_dataset.data.household
    baseline_tu = baseline_sim.output_dataset.data.tax_unit
    reform_tu = reform_sim.output_dataset.data.tax_unit

    baseline_total_tax = _sum_series(baseline_hh, "household_tax")
    reform_total_tax = _sum_series(reform_hh, "household_tax")
    baseline_total_state_tax = _sum_series(baseline_tu, "household_state_income_tax")
    reform_total_state_tax = _sum_series(reform_tu, "household_state_income_tax")
    baseline_total_benefits = _sum_series(baseline_hh, "household_benefits")
    reform_total_benefits = _sum_series(reform_hh, "household_benefits")
    baseline_total_net_income = _sum_series(baseline_hh, "household_net_income")

    tax_revenue_impact = reform_total_tax - baseline_total_tax
    state_tax_revenue_impact = reform_total_state_tax - baseline_total_state_tax
    federal_tax_revenue_impact = tax_revenue_impact - state_tax_revenue_impact
    benefit_spending_impact = reform_total_benefits - baseline_total_benefits
    budgetary_impact = tax_revenue_impact - benefit_spending_impact

    total_households = float(np.asarray(baseline_hh["household_weight"].values).sum())

    # ===== WINNERS / LOSERS =====
    baseline_income_arr = np.asarray(baseline_hh["household_net_income"].values)
    reform_income_arr = np.asarray(reform_hh["household_net_income"].values)
    weight_arr = np.asarray(baseline_hh["household_weight"].values)
    change_arr = reform_income_arr - baseline_income_arr

    winners = float(weight_arr[change_arr > 1].sum())
    losers = float(weight_arr[change_arr < -1].sum())
    beneficiaries = float(weight_arr[change_arr > 0].sum())

    affected_mask = np.abs(change_arr) > 1
    affected_weight = float(weight_arr[affected_mask].sum())
    avg_benefit = (
        float((change_arr[affected_mask] * weight_arr[affected_mask]).sum() / affected_weight)
        if affected_weight > 0
        else 0.0
    )
    winners_rate = winners / total_households * 100 if total_households > 0 else 0.0
    losers_rate = losers / total_households * 100 if total_households > 0 else 0.0

    # ===== INCOME DECILE ANALYSIS =====
    decile_average, decile_relative = _compute_decile_impact(baseline_sim, reform_sim)
    intra_decile_all, intra_decile_deciles = _compute_intra_decile(
        baseline_sim, reform_sim
    )

    # ===== INEQUALITY =====
    baseline_gini, baseline_top_10_share, baseline_top_1_share = _compute_inequality(
        baseline_sim
    )
    reform_gini, reform_top_10_share, reform_top_1_share = _compute_inequality(
        reform_sim
    )

    # ===== POVERTY =====
    baseline_pov_all = _poverty_by_age(baseline_sim)
    reform_pov_all = _poverty_by_age(reform_sim)
    baseline_pov_child = _poverty_by_age(baseline_sim, age_leq=17)
    reform_pov_child = _poverty_by_age(reform_sim, age_leq=17)
    baseline_pov_adult = _poverty_by_age(baseline_sim, age_geq=18, age_leq=64)
    reform_pov_adult = _poverty_by_age(reform_sim, age_geq=18, age_leq=64)
    baseline_pov_senior = _poverty_by_age(baseline_sim, age_geq=65)
    reform_pov_senior = _poverty_by_age(reform_sim, age_geq=65)

    poverty = {
        "all": {"baseline": baseline_pov_all["spm"], "reform": reform_pov_all["spm"]},
        "child": {"baseline": baseline_pov_child["spm"], "reform": reform_pov_child["spm"]},
        "adult": {"baseline": baseline_pov_adult["spm"], "reform": reform_pov_adult["spm"]},
        "senior": {"baseline": baseline_pov_senior["spm"], "reform": reform_pov_senior["spm"]},
    }
    deep_poverty = {
        "all": {"baseline": baseline_pov_all["spm_deep"], "reform": reform_pov_all["spm_deep"]},
        "child": {"baseline": baseline_pov_child["spm_deep"], "reform": reform_pov_child["spm_deep"]},
        "adult": {"baseline": baseline_pov_adult["spm_deep"], "reform": reform_pov_adult["spm_deep"]},
        "senior": {"baseline": baseline_pov_senior["spm_deep"], "reform": reform_pov_senior["spm_deep"]},
    }

    poverty_rate_change, poverty_percent_change = _poverty_metrics(
        poverty["all"]["baseline"], poverty["all"]["reform"]
    )
    child_poverty_rate_change, child_poverty_percent_change = _poverty_metrics(
        poverty["child"]["baseline"], poverty["child"]["reform"]
    )
    deep_poverty_rate_change, deep_poverty_percent_change = _poverty_metrics(
        deep_poverty["all"]["baseline"], deep_poverty["all"]["reform"]
    )
    deep_child_poverty_rate_change, deep_child_poverty_percent_change = _poverty_metrics(
        deep_poverty["child"]["baseline"], deep_poverty["child"]["reform"]
    )

    # ===== INCOME BRACKET BREAKDOWN =====
    agi_by_household = baseline_sim.output_dataset.data.map_to_entity(
        "tax_unit", "household", columns=["adjusted_gross_income"]
    )
    agi_arr = np.asarray(agi_by_household["adjusted_gross_income"].values)

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
        mask = (agi_arr >= min_inc) & (agi_arr < max_inc) & affected_mask
        bracket_affected = float(weight_arr[mask].sum())
        if bracket_affected > 0:
            bracket_cost = float((change_arr[mask] * weight_arr[mask]).sum())
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
        "poverty_baseline_rate": poverty["all"]["baseline"],
        "poverty_reform_rate": poverty["all"]["reform"],
        "poverty_rate_change": poverty_rate_change,
        "poverty_percent_change": poverty_percent_change,
        "child_poverty_baseline_rate": poverty["child"]["baseline"],
        "child_poverty_reform_rate": poverty["child"]["reform"],
        "child_poverty_rate_change": child_poverty_rate_change,
        "child_poverty_percent_change": child_poverty_percent_change,
        "adult_poverty_baseline_rate": poverty["adult"]["baseline"],
        "adult_poverty_reform_rate": poverty["adult"]["reform"],
        "senior_poverty_baseline_rate": poverty["senior"]["baseline"],
        "senior_poverty_reform_rate": poverty["senior"]["reform"],
        "deep_poverty_baseline_rate": deep_poverty["all"]["baseline"],
        "deep_poverty_reform_rate": deep_poverty["all"]["reform"],
        "deep_poverty_rate_change": deep_poverty_rate_change,
        "deep_poverty_percent_change": deep_poverty_percent_change,
        "deep_child_poverty_baseline_rate": deep_poverty["child"]["baseline"],
        "deep_child_poverty_reform_rate": deep_poverty["child"]["reform"],
        "deep_child_poverty_rate_change": deep_child_poverty_rate_change,
        "deep_child_poverty_percent_change": deep_child_poverty_percent_change,
        "deep_adult_poverty_baseline_rate": deep_poverty["adult"]["baseline"],
        "deep_adult_poverty_reform_rate": deep_poverty["adult"]["reform"],
        "deep_senior_poverty_baseline_rate": deep_poverty["senior"]["baseline"],
        "deep_senior_poverty_reform_rate": deep_poverty["senior"]["reform"],
        "by_income_bracket": by_income_bracket,
    }
