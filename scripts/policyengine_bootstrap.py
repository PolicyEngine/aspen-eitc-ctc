"""Helpers to prefer a local policyengine-us checkout when available."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def bootstrap_policyengine_us() -> str | None:
    """Prepend a local policyengine-us repo to sys.path when present.

    Resolution order:
    1. ``POLICYENGINE_US_PATH`` environment variable
    2. sibling checkout at ``../policyengine-us``

    Returns the resolved path if one was added, otherwise None.
    """

    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent

    candidates: list[Path] = []
    env_path = os.getenv("POLICYENGINE_US_PATH")
    if env_path:
        candidates.append(Path(env_path).expanduser())
    candidates.append(repo_root.parent / "policyengine-us")

    for candidate in candidates:
        package_dir = candidate / "policyengine_us"
        if package_dir.exists():
            candidate_str = str(candidate)
            if candidate_str not in sys.path:
                sys.path.insert(0, candidate_str)
            return candidate_str

    return None


def disable_automatic_structural_reforms() -> None:
    """Disable policyengine-us automatic structural reform scanning.

    This repo applies only explicit reforms. Disabling the upstream
    parameter-driven structural scan avoids unrelated contrib/research
    reform loader failures during microsimulation runs.
    """

    import policyengine_us.reforms as pe_reforms
    import policyengine_us.system as pe_system

    def _no_structural_reforms(parameters, period):
        return ()

    pe_reforms.create_structural_reforms_from_parameters = (
        _no_structural_reforms
    )
    pe_system.create_structural_reforms_from_parameters = (
        _no_structural_reforms
    )
