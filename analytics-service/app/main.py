from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .analysis import (
    customer_exposure,
    margin_by_category,
    order_fulfillment,
    sales_summary,
    slow_stock,
    supplier_spend,
    transaction_volume,
)

app = FastAPI(title="WoodRevive Analytics", version="0.1.0")


class AnalysisRequest(BaseModel):
    operation: Literal[
        "sales_summary", "margin_by_category", "slow_stock", "customer_exposure",
        "transaction_volume", "supplier_spend", "order_fulfillment",
    ]
    minimum_days: int = Field(default=180, ge=1, le=3650)
    as_of: str = Field(default="2025-08-31", pattern=r"^\d{4}-\d{2}-\d{2}$")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "dataset_family": "woodrevive-demo-v2", "operations": 7}


@app.post("/analyze")
def analyze(request: AnalysisRequest) -> dict:
    try:
        if request.operation == "sales_summary":
            return sales_summary()
        if request.operation == "margin_by_category":
            return margin_by_category()
        if request.operation == "slow_stock":
            return slow_stock(request.minimum_days, request.as_of)
        if request.operation == "customer_exposure":
            return customer_exposure(request.as_of)
        if request.operation == "transaction_volume":
            return transaction_volume()
        if request.operation == "supplier_spend":
            return supplier_spend()
        return order_fulfillment()
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
