"""Create Aspen ESG EITC/CTC reform objects for microsimulation.

This uses a local EITC maximum override so filers with no qualifying
children remain on current law while filers with qualifying children move
to the Aspen streamlined child schedule.
"""

import numpy as np
from policyengine_core.reforms import Reform
from policyengine_core.errors import VariableNotFoundError

from policyengine_bootstrap import bootstrap_policyengine_us

bootstrap_policyengine_us()

from policyengine_us.model_api import (
    StateCode,
    TaxUnit,
    Person,
    USD,
    YEAR,
    Variable,
    add,
    max_,
    where,
)
from policyengine_us.reforms.ctc import (
    create_ctc_linear_phase_out_reform,
    create_ctc_minimum_refundable_amount_reform,
)


def create_streamlined_eitc_reform():
    """Apply the Aspen child schedule without changing childless filers."""

    class eitc_maximum(Variable):
        value_type = float
        entity = TaxUnit
        label = "Maximum EITC"
        definition_period = YEAR
        reference = "https://www.law.cornell.edu/uscode/text/26/32#a"
        unit = USD

        def formula(tax_unit, period, parameters):
            child_count = tax_unit("eitc_child_count", period)
            filing_status = tax_unit("filing_status", period)
            joint = filing_status == filing_status.possible_values.JOINT

            current_law_max = parameters(period).gov.irs.credits.eitc.max.calc(
                child_count
            )
            streamlined = parameters(period).gov.contrib.streamlined_eitc.max
            streamlined_child_max = where(
                joint,
                streamlined.joint.calc(child_count),
                streamlined.single.calc(child_count),
            )

            return where(
                child_count >= 1,
                streamlined_child_max,
                current_law_max,
            )

    class reform(Reform):
        def apply(self):
            self.update_variable(eitc_maximum)

    return reform


def create_microsimulation_compatibility_reform():
    """Patch upstream dynamic-simulation incompatibilities used in this repo."""

    class vt_subtractions(Variable):
        value_type = float
        entity = TaxUnit
        label = "Vermont subtractions"
        unit = USD
        documentation = "Subtractions from Vermont adjusted gross income"
        definition_period = YEAR
        defined_for = StateCode.VT
        reference = (
            "https://tax.vermont.gov/sites/tax/files/documents/IN-112-2022.pdf#page=1",
            "https://legislature.vermont.gov/statutes/section/32/151/05811",
        )

        def formula(tax_unit, period, parameters):
            total_subtractions = add(
                tax_unit,
                period,
                [
                    "us_govt_interest",
                    "vt_medical_expense_deduction",
                    "student_loan_interest",
                    "vt_capital_gains_exclusion",
                    "vt_retirement_income_exemption",
                ],
            )
            return max_(0, total_subtractions)

    class marginal_tax_rate(Variable):
        label = "marginal tax rate"
        documentation = (
            "Fraction of marginal income gains that do not increase household net income."
        )
        entity = Person
        definition_period = YEAR
        value_type = float
        unit = "/1"

        def formula(person, period, parameters):
            netinc_base = person.household("household_net_income", period)
            delta = parameters(period).simulation.marginal_tax_rate_delta
            adult_count = parameters(period).simulation.marginal_tax_rate_adults
            sim = person.simulation
            mtr_values = np.zeros(person.count, dtype=np.float32)
            adult_indexes = person("adult_earnings_index", period)
            employment_income = person("employment_income", period)
            self_employment_income = person("self_employment_income", period)
            emp_self_emp_ratio = person("emp_self_emp_ratio", period)

            for adult_index in range(1, 1 + adult_count):
                alt_sim = sim.get_branch(f"mtr_for_adult_{adult_index}")
                for variable in sim.tax_benefit_system.variables:
                    if (
                        variable not in sim.input_variables
                        or variable == "employment_income"
                    ):
                        continue
                    try:
                        alt_sim.delete_arrays(variable)
                    except VariableNotFoundError:
                        continue
                mask = adult_index == adult_indexes
                alt_sim.set_input(
                    "employment_income",
                    period,
                    employment_income + mask * delta * emp_self_emp_ratio,
                )
                alt_sim.set_input(
                    "self_employment_income",
                    period,
                    self_employment_income
                    + mask * delta * (1 - emp_self_emp_ratio),
                )
                alt_person = alt_sim.person
                netinc_alt = alt_person.household("household_net_income", period)
                increase = netinc_alt - netinc_base
                mtr_values += where(mask, 1 - increase / delta, 0)
                del sim.branches[f"mtr_for_adult_{adult_index}"]
            return mtr_values

    class marginal_tax_rate_on_capital_gains(Variable):
        label = "capital gains marginal tax rate"
        documentation = (
            "Percent of marginal capital gains that do not increase household net income."
        )
        entity = Person
        definition_period = YEAR
        value_type = float
        unit = "/1"

        def formula(person, period, parameters):
            mtr_values = np.zeros(person.count, dtype=np.float32)
            simulation = person.simulation
            delta = 1_000
            adult_index_values = person("adult_index_cg", period)
            for adult_index in [1, 2]:
                alt_simulation = simulation.get_branch(
                    f"adult_{adult_index}_cg_rise"
                )
                mask = adult_index_values == adult_index
                for variable in simulation.tax_benefit_system.variables:
                    variable_data = simulation.tax_benefit_system.variables[
                        variable
                    ]
                    if (
                        variable not in simulation.input_variables
                        and not variable_data.is_input_variable()
                    ):
                        try:
                            alt_simulation.delete_arrays(variable)
                        except VariableNotFoundError:
                            continue
                alt_simulation.set_input(
                    "capital_gains",
                    period,
                    person("capital_gains", period) + mask * delta,
                )
                alt_person = alt_simulation.person
                household_net_income = person.household(
                    "household_net_income", period
                )
                household_net_income_higher_earnings = alt_person.household(
                    "household_net_income", period
                )
                increase = (
                    household_net_income_higher_earnings
                    - household_net_income
                )
                mtr_values += where(mask, 1 - increase / delta, 0)
                del simulation.branches[f"adult_{adult_index}_cg_rise"]
            return mtr_values

    class de_income_tax_if_claiming_refundable_eitc(Variable):
        value_type = float
        entity = TaxUnit
        label = "Delaware tax liability if claiming refundable Delaware EITC"
        unit = USD
        definition_period = YEAR
        defined_for = StateCode.DE

        def formula(tax_unit, period, parameters):
            simulation = tax_unit.simulation
            refundable_branch = simulation.get_branch(
                "de_refundable_eitc", clone_system=True
            )
            refundable_branch.set_input(
                "de_claims_refundable_eitc",
                period,
                np.ones((tax_unit.count,), dtype=bool),
            )
            return refundable_branch.calculate("de_income_tax", period)

    class de_income_tax_if_claiming_non_refundable_eitc(Variable):
        value_type = float
        entity = TaxUnit
        label = "Delaware tax liability if claiming non-refundable Delaware EITC"
        unit = USD
        definition_period = YEAR
        defined_for = StateCode.DE

        def formula(tax_unit, period, parameters):
            simulation = tax_unit.simulation
            non_refundable_branch = simulation.get_branch(
                "de_non_refundable_eitc", clone_system=True
            )
            non_refundable_branch.set_input(
                "de_claims_refundable_eitc",
                period,
                np.zeros((tax_unit.count,), dtype=bool),
            )
            return non_refundable_branch.calculate("de_income_tax", period)

    class va_income_tax_if_claiming_refundable_eitc(Variable):
        value_type = float
        entity = TaxUnit
        label = "Virginia tax liability if claiming refundable Virginia EITC"
        unit = USD
        definition_period = YEAR
        defined_for = StateCode.VA

        def formula(tax_unit, period, parameters):
            simulation = tax_unit.simulation
            refundable_branch = simulation.get_branch(
                "va_refundable_eitc", clone_system=True
            )
            refundable_branch.set_input(
                "va_claims_refundable_eitc",
                period,
                np.ones((tax_unit.count,), dtype=bool),
            )
            return refundable_branch.calculate("va_income_tax", period)

    class va_income_tax_if_claiming_non_refundable_eitc(Variable):
        value_type = float
        entity = TaxUnit
        label = "Virginia tax liability if claiming non-refundable Virginia EITC"
        unit = USD
        definition_period = YEAR
        defined_for = StateCode.VA

        def formula(tax_unit, period, parameters):
            simulation = tax_unit.simulation
            non_refundable_branch = simulation.get_branch(
                "va_non_refundable_eitc", clone_system=True
            )
            non_refundable_branch.set_input(
                "va_claims_refundable_eitc",
                period,
                np.zeros((tax_unit.count,), dtype=bool),
            )
            return non_refundable_branch.calculate("va_income_tax", period)

    class reform(Reform):
        def apply(self):
            self.update_variable(vt_subtractions)
            self.update_variable(marginal_tax_rate)
            self.update_variable(marginal_tax_rate_on_capital_gains)
            self.update_variable(de_income_tax_if_claiming_refundable_eitc)
            self.update_variable(de_income_tax_if_claiming_non_refundable_eitc)
            self.update_variable(va_income_tax_if_claiming_refundable_eitc)
            self.update_variable(va_income_tax_if_claiming_non_refundable_eitc)

    return reform


def create_aspen_reform():
    """
    Create the Aspen ESG EITC/CTC reform.

    Returns a tuple of Reform objects that can be passed to Simulation or
    Microsimulation.

    Structural reforms:
    - Streamlined EITC max: filing-status-specific max credits for filers
      with qualifying children, preserving current-law childless EITC
    - CTC linear phase-out: smooth phase-out instead of $50/$1000 step
    - CTC minimum refundable: 50% refundability at zero earnings

    IRS parameter overrides:
    - EITC phase-in/out rates and thresholds
    - CTC ARPA amounts, phase-out thresholds, and 50% zero-earnings
      refundability with a 30% phase-in
    """
    date_range = "2026-01-01.2100-12-31"

    parameter_reform = Reform.from_dict(
        {
            # === Streamlined EITC Reform ===
            # Max credits: $3,995 single/HOH, $4,993 married (1+ children)
            "gov.contrib.streamlined_eitc.max.single[1].amount": {
                date_range: 3995,
            },
            "gov.contrib.streamlined_eitc.max.joint[1].amount": {
                date_range: 4993,
            },
            # Phase-in rates: 34% for all child brackets
            "gov.irs.credits.eitc.phase_in_rate[1].amount": {
                date_range: 0.34,
            },
            "gov.irs.credits.eitc.phase_in_rate[2].amount": {
                date_range: 0.34,
            },
            "gov.irs.credits.eitc.phase_in_rate[3].amount": {
                date_range: 0.34,
            },
            # Phase-out start: $21,560 for all child brackets
            "gov.irs.credits.eitc.phase_out.start[1].amount": {
                date_range: 21560,
            },
            "gov.irs.credits.eitc.phase_out.start[2].amount": {
                date_range: 21560,
            },
            "gov.irs.credits.eitc.phase_out.start[3].amount": {
                date_range: 21560,
            },
            # Joint bonus: $5,390
            "gov.irs.credits.eitc.phase_out.joint_bonus[1].amount": {
                date_range: 5390,
            },
            # Phase-out rates: 15.98% for all child brackets
            "gov.irs.credits.eitc.phase_out.rate[1].amount": {
                date_range: 0.1598,
            },
            "gov.irs.credits.eitc.phase_out.rate[2].amount": {
                date_range: 0.1598,
            },
            "gov.irs.credits.eitc.phase_out.rate[3].amount": {
                date_range: 0.1598,
            },
            # === Enhanced CTC Reform ===
            # Enable ARPA CTC addition
            "gov.irs.credits.ctc.phase_out.arpa.in_effect": {
                date_range: True,
            },
            # ARPA amounts: $3,600 (ages 0-5) / $3,000 (ages 6-17)
            "gov.irs.credits.ctc.amount.arpa[0].amount": {
                date_range: 3600,
            },
            "gov.irs.credits.ctc.amount.arpa[1].amount": {
                date_range: 3000,
            },
            # Phase-out thresholds
            "gov.irs.credits.ctc.phase_out.threshold.SINGLE": {
                date_range: 75000,
            },
            "gov.irs.credits.ctc.phase_out.threshold.HEAD_OF_HOUSEHOLD": {
                date_range: 75000,
            },
            "gov.irs.credits.ctc.phase_out.threshold.JOINT": {
                date_range: 110000,
            },
            "gov.irs.credits.ctc.phase_out.threshold.SURVIVING_SPOUSE": {
                date_range: 110000,
            },
            "gov.irs.credits.ctc.phase_out.threshold.SEPARATE": {
                date_range: 55000,
            },
            # ARPA phase-out thresholds must match CTC thresholds
            # so the ARPA cap = 0 (linear phase-out handles everything)
            "gov.irs.credits.ctc.phase_out.arpa.threshold.SINGLE": {
                date_range: 75000,
            },
            "gov.irs.credits.ctc.phase_out.arpa.threshold.HEAD_OF_HOUSEHOLD": {
                date_range: 75000,
            },
            "gov.irs.credits.ctc.phase_out.arpa.threshold.JOINT": {
                date_range: 110000,
            },
            "gov.irs.credits.ctc.phase_out.arpa.threshold.SURVIVING_SPOUSE": {
                date_range: 110000,
            },
            "gov.irs.credits.ctc.phase_out.arpa.threshold.SEPARATE": {
                date_range: 55000,
            },
            # Linear phase-out structural reform
            "gov.contrib.ctc.linear_phase_out.in_effect": {
                date_range: True,
            },
            "gov.contrib.ctc.linear_phase_out.end.SINGLE": {
                date_range: 240000,
            },
            "gov.contrib.ctc.linear_phase_out.end.HEAD_OF_HOUSEHOLD": {
                date_range: 240000,
            },
            "gov.contrib.ctc.linear_phase_out.end.JOINT": {
                date_range: 440000,
            },
            "gov.contrib.ctc.linear_phase_out.end.SURVIVING_SPOUSE": {
                date_range: 440000,
            },
            "gov.contrib.ctc.linear_phase_out.end.SEPARATE": {
                date_range: 175000,
            },
            # Raise individual refundable max to cover full ARPA amounts
            "gov.irs.credits.ctc.refundable.individual_max": {
                date_range: 3600,
            },
            # Phase-in: 30% from $0
            "gov.irs.credits.ctc.refundable.phase_in.rate": {
                date_range: 0.30,
            },
            "gov.irs.credits.ctc.refundable.phase_in.threshold": {
                date_range: 0,
            },
            # 50% minimum refundable at zero earnings
            "gov.contrib.ctc.minimum_refundable.in_effect": {
                date_range: True,
            },
            "gov.contrib.ctc.minimum_refundable.amount[0].amount": {
                date_range: 1800,
            },
            "gov.contrib.ctc.minimum_refundable.amount[1].amount": {
                date_range: 1500,
            },
        },
        country_id="us",
    )

    return (
        create_streamlined_eitc_reform(),
        create_ctc_linear_phase_out_reform(None, None, bypass=True),
        create_ctc_minimum_refundable_amount_reform(
            None, None, bypass=True
        ),
        create_microsimulation_compatibility_reform(),
        parameter_reform,
    )


def create_cbo_lsr_reform():
    """
    Create a reform that enables CBO labor supply responses.

    Standard CBO elasticities:
    - Income elasticity: -0.05
    - Substitution elasticity: 0.25
    """
    date_range = "2026-01-01.2100-12-31"
    return Reform.from_dict(
        {
            "gov.simulation.labor_supply_responses.elasticities.income": {
                date_range: -0.05,
            },
            "gov.simulation.labor_supply_responses.elasticities.substitution.all": {
                date_range: 0.25,
            },
        },
        country_id="us",
    )
