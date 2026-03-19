"""Data generation pipeline for Aspen EITC/CTC calculator dashboard.

Runs microsimulation for static and dynamic (CBO labor supply response)
variants across multiple years and saves output to frontend/public/data/
as CSV files.

Uses subprocess isolation per year to prevent memory accumulation.

Usage:
    python scripts/pipeline.py
"""

import gc
import json
import os
import subprocess
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DEFAULT_OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "public",
    "data",
)

YEARS = list(range(2026, 2036))

# (cbo_lsr, label) — must match _pipeline_worker.py
VARIANTS = [
    (False, "static"),
    (True, "dynamic"),
]


def _save_csv(df: pd.DataFrame, path: str) -> None:
    """Save DataFrame to CSV, creating parent directories if needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)
    print(f"Saved: {path}")


def _extract_distributional(
    result: dict, variant: str, year: int
) -> list[dict]:
    rows = []
    for decile, avg in result["decile"]["average"].items():
        rows.append(
            {
                "year": year,
                "variant": variant,
                "decile": decile,
                "average_change": round(avg, 2),
                "relative_change": round(
                    result["decile"]["relative"][decile], 6
                ),
            }
        )
    return rows


def _extract_metrics(result: dict, variant: str, year: int) -> list[dict]:
    metrics = [
        ("budgetary_impact", result["budget"]["budgetary_impact"]),
        (
            "federal_tax_revenue_impact",
            result["budget"]["federal_tax_revenue_impact"],
        ),
        (
            "state_tax_revenue_impact",
            result["budget"]["state_tax_revenue_impact"],
        ),
        ("tax_revenue_impact", result["budget"]["tax_revenue_impact"]),
        (
            "benefit_spending_impact",
            result["budget"]["benefit_spending_impact"],
        ),
        (
            "baseline_net_income",
            result["budget"].get("baseline_net_income", 0),
        ),
        ("households", result["budget"]["households"]),
        ("total_cost", result["total_cost"]),
        ("beneficiaries", result["beneficiaries"]),
        ("avg_benefit", result["avg_benefit"]),
        ("winners", result["winners"]),
        ("losers", result["losers"]),
        ("winners_rate", result["winners_rate"]),
        ("losers_rate", result["losers_rate"]),
        ("poverty_baseline_rate", result["poverty_baseline_rate"]),
        ("poverty_reform_rate", result["poverty_reform_rate"]),
        ("poverty_rate_change", result["poverty_rate_change"]),
        ("poverty_percent_change", result["poverty_percent_change"]),
        (
            "child_poverty_baseline_rate",
            result["child_poverty_baseline_rate"],
        ),
        ("child_poverty_reform_rate", result["child_poverty_reform_rate"]),
        ("child_poverty_rate_change", result["child_poverty_rate_change"]),
        (
            "child_poverty_percent_change",
            result["child_poverty_percent_change"],
        ),
        ("deep_poverty_baseline_rate", result["deep_poverty_baseline_rate"]),
        ("deep_poverty_reform_rate", result["deep_poverty_reform_rate"]),
        ("deep_poverty_rate_change", result["deep_poverty_rate_change"]),
        (
            "deep_poverty_percent_change",
            result["deep_poverty_percent_change"],
        ),
        (
            "deep_child_poverty_baseline_rate",
            result["deep_child_poverty_baseline_rate"],
        ),
        (
            "deep_child_poverty_reform_rate",
            result["deep_child_poverty_reform_rate"],
        ),
        (
            "deep_child_poverty_rate_change",
            result["deep_child_poverty_rate_change"],
        ),
        (
            "deep_child_poverty_percent_change",
            result["deep_child_poverty_percent_change"],
        ),
    ]
    return [
        {"year": year, "variant": variant, "metric": k, "value": v}
        for k, v in metrics
    ]


def _extract_winners_losers(
    result: dict, variant: str, year: int
) -> list[dict]:
    intra = result["intra_decile"]
    rows = []

    rows.append(
        {
            "year": year,
            "variant": variant,
            "decile": "All",
            "gain_more_5pct": intra["all"]["Gain more than 5%"],
            "gain_less_5pct": intra["all"]["Gain less than 5%"],
            "no_change": intra["all"]["No change"],
            "lose_less_5pct": intra["all"]["Lose less than 5%"],
            "lose_more_5pct": intra["all"]["Lose more than 5%"],
        }
    )

    for i in range(10):
        rows.append(
            {
                "year": year,
                "variant": variant,
                "decile": str(i + 1),
                "gain_more_5pct": intra["deciles"]["Gain more than 5%"][i],
                "gain_less_5pct": intra["deciles"]["Gain less than 5%"][i],
                "no_change": intra["deciles"]["No change"][i],
                "lose_less_5pct": intra["deciles"]["Lose less than 5%"][i],
                "lose_more_5pct": intra["deciles"]["Lose more than 5%"][i],
            }
        )

    return rows


def _extract_income_brackets(
    result: dict, variant: str, year: int
) -> list[dict]:
    return [
        {
            "year": year,
            "variant": variant,
            "bracket": b["bracket"],
            "beneficiaries": b["beneficiaries"],
            "total_cost": b["total_cost"],
            "avg_benefit": b["avg_benefit"],
        }
        for b in result["by_income_bracket"]
    ]


def _run_year_in_process(year: int) -> dict:
    """Run all variants for a single year, then free memory."""
    from microsimulation import calculate_aggregate_impact

    results = {}
    for cbo_lsr, variant in VARIANTS:
        print(f"  Computing {variant}...")
        results[variant] = calculate_aggregate_impact(
            year=year, cbo_lsr=cbo_lsr
        )
        gc.collect()

    return results


def _run_year_subprocess(year: int) -> dict:
    """Run all variants for one year in a subprocess to isolate memory."""
    worker_script = os.path.join(
        os.path.dirname(__file__), "_pipeline_worker.py"
    )
    proc = subprocess.run(
        [sys.executable, "-u", worker_script, str(year)],
        capture_output=False,
        stderr=None,
        stdout=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Worker failed for year {year}")
    return json.loads(proc.stdout)


def generate_all_data(
    output_dir: str = None, use_subprocess: bool = True
) -> dict[str, pd.DataFrame]:
    """Generate all dashboard data as CSVs for all years and variants."""
    output_dir = output_dir or DEFAULT_OUTPUT_DIR

    all_distributional = []
    all_metrics = []
    all_winners_losers = []
    all_income_brackets = []

    for i, year in enumerate(YEARS):
        print(f"\n[{i + 1}/{len(YEARS)}] Year {year}...")

        if use_subprocess:
            year_results = _run_year_subprocess(year)
        else:
            year_results = _run_year_in_process(year)

        for variant, result in year_results.items():
            all_distributional.extend(
                _extract_distributional(result, variant, year)
            )
            all_metrics.extend(_extract_metrics(result, variant, year))
            all_winners_losers.extend(
                _extract_winners_losers(result, variant, year)
            )
            all_income_brackets.extend(
                _extract_income_brackets(result, variant, year)
            )

        print(f"  Year {year} complete.")

    results = {
        "distributional_impact": pd.DataFrame(all_distributional),
        "metrics": pd.DataFrame(all_metrics),
        "winners_losers": pd.DataFrame(all_winners_losers),
        "income_brackets": pd.DataFrame(all_income_brackets),
    }

    for name, df in results.items():
        _save_csv(df, os.path.join(output_dir, f"{name}.csv"))

    print(f"\nAll data saved to {output_dir}/")
    return results


if __name__ == "__main__":
    generate_all_data()
