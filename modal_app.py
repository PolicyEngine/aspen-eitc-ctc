"""Modal deployment for Aspen EITC/CTC household calculations."""

from __future__ import annotations

import os

import modal


APP_NAME = os.environ.get("MODAL_APP_NAME", "aspen-eitc-ctc")

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "fastapi>=0.115.0",
        "pydantic>=2.0",
        "httpx>=0.28.0",
        "tables>=3.10.2",
        "git+https://github.com/PolicyEngine/policyengine-us.git",
    )
    .add_local_python_source("scripts", copy=True)
)


@app.function(
    image=image,
    cpu=2.0,
    memory=8192,
    timeout=900,
)
@modal.asgi_app()
def web_app():
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    from scripts.household_calculation import calculate_household_impact

    class HouseholdRequest(BaseModel):
        age_head: int
        age_spouse: int | None
        dependent_ages: list[int]
        income: float
        year: int
        max_earnings: float
        state_code: str
        in_nyc: bool | None = None

    api = FastAPI(
        title="Aspen EITC/CTC Household API",
        version="1.0.0",
    )
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    def health():
        return {"ok": True}

    @api.post("/household-impact")
    def household_impact(request: HouseholdRequest):
        return calculate_household_impact(request.model_dump())

    return api
