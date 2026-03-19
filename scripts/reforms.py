"""Create Aspen ESG EITC/CTC reform objects for microsimulation.

Encodes the same parameter overrides as frontend/lib/api.ts buildReform(),
plus structural reforms from policyengine-us contrib.
"""

from policyengine_core.reforms import Reform


def create_aspen_reform():
    """
    Create the Aspen ESG EITC/CTC reform.

    Returns a tuple of Reform objects that can be passed to Microsimulation.

    Structural reforms (from policyengine-us contrib):
    - Streamlined EITC: filing-status-specific max credits
    - CTC linear phase-out: smooth phase-out instead of $50/$1000 step
    - CTC minimum refundable: 50% refundability at zero earnings

    IRS parameter overrides:
    - EITC phase-in/out rates and thresholds
    - CTC ARPA amounts, phase-out thresholds, full refundability
    """
    date_range = "2026-01-01.2100-12-31"

    return Reform.from_dict(
        {
            # === Streamlined EITC Reform ===
            "gov.contrib.streamlined_eitc.in_effect": {date_range: True},
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
            # Fully refundable CTC
            "gov.irs.credits.ctc.refundable.fully_refundable": {
                date_range: True,
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
