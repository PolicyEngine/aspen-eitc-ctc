import sys
import unittest
from pathlib import Path

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from policyengine_bootstrap import (
    bootstrap_policyengine_us,
    disable_automatic_structural_reforms,
)

bootstrap_policyengine_us()
disable_automatic_structural_reforms()

from policyengine_us import Simulation

from microsimulation import _calculate_intra_decile_from_arrays
from reforms import create_aspen_reform


YEAR = "2026"


def build_situation(
    *,
    age_head: int,
    income: float,
    state_code: str = "CA",
    age_spouse: int | None = None,
    dependent_ages: list[int] | None = None,
):
    dependent_ages = dependent_ages or []
    situation = {
        "people": {
            "you": {
                "age": {YEAR: age_head},
                "employment_income": {YEAR: income},
            }
        },
        "families": {"your family": {"members": ["you"]}},
        "marital_units": {"your marital unit": {"members": ["you"]}},
        "spm_units": {"your household": {"members": ["you"]}},
        "tax_units": {"your tax unit": {"members": ["you"]}},
        "households": {
            "your household": {
                "members": ["you"],
                "state_code": {YEAR: state_code},
            }
        },
    }

    if age_spouse is not None:
        situation["people"]["your partner"] = {"age": {YEAR: age_spouse}}
        for unit in ("families", "spm_units", "tax_units", "households"):
            unit_key = next(iter(situation[unit]))
            situation[unit][unit_key]["members"].append("your partner")
        situation["marital_units"]["your marital unit"]["members"].append(
            "your partner"
        )

    dep_names = [
        "your first dependent",
        "your second dependent",
    ] + [f"dependent_{i + 1}" for i in range(2, 10)]
    for i, dep_age in enumerate(dependent_ages):
        dep_name = dep_names[i]
        situation["people"][dep_name] = {"age": {YEAR: dep_age}}
        for unit in ("families", "spm_units", "tax_units", "households"):
            unit_key = next(iter(situation[unit]))
            situation[unit][unit_key]["members"].append(dep_name)
        situation["marital_units"][f"{dep_name}'s marital unit"] = {
            "members": [dep_name]
        }

    return situation


class AspenReformTests(unittest.TestCase):
    def assertAlmostEqualCurrency(self, actual, expected):
        self.assertAlmostEqual(float(actual), float(expected), places=2)

    def test_childless_household_is_unchanged(self):
        situation = build_situation(age_head=40, age_spouse=38, income=10_000)
        baseline = Simulation(situation=situation)
        reform = Simulation(situation=situation, reform=create_aspen_reform())

        self.assertAlmostEqualCurrency(
            baseline.calculate("eitc", 2026)[0], 664.0
        )
        self.assertAlmostEqualCurrency(
            reform.calculate("eitc", 2026)[0],
            baseline.calculate("eitc", 2026)[0],
        )
        self.assertAlmostEqualCurrency(
            reform.calculate("household_net_income", 2026)[0],
            baseline.calculate("household_net_income", 2026)[0],
        )

    def test_married_filer_with_one_child_gets_higher_eitc_max(self):
        situation = build_situation(
            age_head=35,
            age_spouse=33,
            income=15_000,
            state_code="IN",
            dependent_ages=[4],
        )
        baseline = Simulation(situation=situation)
        reform = Simulation(situation=situation, reform=create_aspen_reform())

        baseline_eitc = baseline.calculate("eitc", 2026)[0]
        reform_eitc = reform.calculate("eitc", 2026)[0]

        self.assertGreater(float(reform_eitc), float(baseline_eitc))
        self.assertAlmostEqualCurrency(
            reform_eitc, 4993.0
        )

    def test_zero_earnings_family_gets_half_refundable_ctc_floor(self):
        situation = build_situation(
            age_head=30,
            income=0,
            state_code="NY",
            dependent_ages=[3],
        )
        reform = Simulation(situation=situation, reform=create_aspen_reform())

        self.assertAlmostEqualCurrency(
            reform.calculate("refundable_ctc", 2026)[0], 1800.0
        )

    def test_delaware_refundable_eitc_branch_stays_calculable(self):
        situation = build_situation(age_head=40, income=0, state_code="DE")
        reform = Simulation(situation=situation, reform=create_aspen_reform())

        refundable = reform.calculate(
            "de_income_tax_if_claiming_refundable_eitc", 2026
        )[0]
        non_refundable = reform.calculate(
            "de_income_tax_if_claiming_non_refundable_eitc", 2026
        )[0]

        self.assertTrue(np.isfinite(float(refundable)))
        self.assertTrue(np.isfinite(float(non_refundable)))

    def test_intra_decile_all_matches_api_decile_average(self):
        rel_change = np.array([-0.10, 0.00, 0.10, 0.00])
        decile = np.array([1, 1, 2, 2])
        people_weighted = np.array([1.0, 9.0, 100.0, 0.0])

        intra_all, intra_deciles = _calculate_intra_decile_from_arrays(
            decile, rel_change, people_weighted
        )

        self.assertAlmostEqual(intra_deciles["Lose more than 5%"][0], 0.1)
        self.assertAlmostEqual(intra_deciles["Gain more than 5%"][1], 1.0)
        self.assertAlmostEqual(intra_all["Gain more than 5%"], 0.1)
        self.assertAlmostEqual(intra_all["No change"], 0.09)
        self.assertAlmostEqual(intra_all["Lose more than 5%"], 0.01)


if __name__ == "__main__":
    unittest.main()
