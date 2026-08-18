from datetime import date

import pandas as pd

from .catalog import resolve_dataset


def sales_summary() -> dict:
    frame = pd.read_csv(resolve_dataset("vendite"), parse_dates=["data"])
    revenue = int(frame["ricavo_cents"].sum())
    cost = int(frame["costo_cents"].sum())
    margin = revenue - cost
    margin_percent = round((margin / revenue * 100) if revenue else 0, 2)
    return {
        "summary": "Riepilogo delle vendite dimostrative.",
        "metrics": [
            {"label": "Fatturato", "value": revenue, "unit": "cents"},
            {"label": "Costo del venduto", "value": cost, "unit": "cents"},
            {"label": "Margine", "value": margin, "unit": "cents"},
            {"label": "Margine percentuale", "value": margin_percent, "unit": "%"},
        ],
        "method": "Somma ricavi e costi; margine % = (ricavi - costi) / ricavi × 100.",
        "warnings": ["Dataset sintetico e anonimo."],
    }


def margin_by_category() -> dict:
    frame = pd.read_csv(resolve_dataset("vendite"))
    grouped = frame.groupby("categoria", as_index=False).agg(
        ricavo_cents=("ricavo_cents", "sum"),
        costo_cents=("costo_cents", "sum"),
    )
    grouped["margine_cents"] = grouped["ricavo_cents"] - grouped["costo_cents"]
    grouped["margine_percentuale"] = (
        grouped["margine_cents"] / grouped["ricavo_cents"] * 100
    ).round(2)
    grouped = grouped.sort_values("margine_cents", ascending=False)
    return {
        "summary": "Margine aggregato per categoria.",
        "table": {
            "columns": grouped.columns.tolist(),
            "rows": grouped.to_dict(orient="records"),
        },
        "method": "Raggruppamento per categoria e differenza tra ricavo e costo.",
        "warnings": ["Dataset sintetico e anonimo."],
    }


def slow_stock(minimum_days: int = 180) -> dict:
    frame = pd.read_csv(resolve_dataset("magazzino"), parse_dates=["data_carico"])
    today = pd.Timestamp(date.today())
    frame["giorni_in_magazzino"] = (today - frame["data_carico"]).dt.days
    frame["valore_giacenza_cents"] = (
        frame["giacenza_milli"] * frame["costo_medio_cents"] / 1000
    ).round().astype(int)
    result = frame[frame["giorni_in_magazzino"] >= minimum_days].sort_values(
        "giorni_in_magazzino", ascending=False
    )
    columns = [
        "articolo_id", "lotto_id", "categoria", "giorni_in_magazzino",
        "giacenza_milli", "valore_giacenza_cents",
    ]
    return {
        "summary": f"Lotti in giacenza da almeno {minimum_days} giorni.",
        "table": {"columns": columns, "rows": result[columns].to_dict(orient="records")},
        "method": "Differenza tra data odierna e data di carico; valore = giacenza × costo medio.",
        "warnings": ["La data odierna influenza il risultato."],
    }
