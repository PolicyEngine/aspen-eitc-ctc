"""Subprocess worker for pipeline.py — runs one year in an isolated process.

Usage: python scripts/_pipeline_worker.py <year>

Outputs JSON to stdout with all variants' results.
All progress messages go to stderr to keep stdout clean for JSON.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _convert_for_json(obj):
    """Convert numpy types to Python types for JSON serialization."""
    import numpy as np

    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _convert_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_for_json(v) for v in obj]
    return obj


# (cbo_lsr, label)
VARIANTS = [
    (False, "static"),
    (True, "dynamic"),
]


def main():
    year = int(sys.argv[1])
    from microsimulation import calculate_aggregate_impact

    results = {}
    for cbo_lsr, variant in VARIANTS:
        print(f"  Computing {variant} {year}...", file=sys.stderr)
        result = calculate_aggregate_impact(year=year, cbo_lsr=cbo_lsr)
        results[variant] = _convert_for_json(result)
        print(f"  Done: {variant} {year}", file=sys.stderr)

    # Output JSON to stdout
    json.dump(results, sys.stdout)


if __name__ == "__main__":
    main()
