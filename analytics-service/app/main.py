from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .analysis import margin_by_category, sales_summary, slow_stock

app = FastAPI(title="WoodRevive Analytics", version="0.1.0")


class AnalysisRequest(BaseModel):
    operation: Literal["sales_summary", "margin_by_category", "slow_stock"]
    minimum_days: int = Field(default=180, ge=1, le=3650)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "datasets": ["vendite", "magazzino", "incassi"]}


@app.post("/analyze")
def analyze(request: AnalysisRequest) -> dict:
    try:
        if request.operation == "sales_summary":
            return sales_summary()
        if request.operation == "margin_by_category":
            return margin_by_category()
        return slow_stock(request.minimum_days)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
