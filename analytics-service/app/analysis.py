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


def slow_stock(minimum_days: int = 180, as_of: str = "2025-08-31") -> dict:
    frame = pd.read_csv(resolve_dataset("magazzino"), parse_dates=["data_carico"])
    reference_date = pd.Timestamp(as_of)
    frame["giorni_in_magazzino"] = (reference_date - frame["data_carico"]).dt.days
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
        "method": f"Differenza tra {as_of} e data di carico; valore = giacenza × costo medio.",
        "warnings": ["Data di analisi esplicita; dataset sintetico e anonimo."],
    }


def customer_exposure(as_of: str = "2025-08-31") -> dict:
    frame = pd.read_csv(resolve_dataset("incassi"), parse_dates=["data_scadenza"])
    frame["scaduto_cents"] = frame["residuo_cents"].where(
        frame["data_scadenza"] < pd.Timestamp(as_of), 0
    )
    grouped = frame.groupby(["cliente_id", "cliente"], as_index=False).agg(
        fatturato_lordo_cents=("importo_cents", "sum"),
        incassato_cents=("incassato_cents", "sum"),
        esposizione_cents=("residuo_cents", "sum"),
        scaduto_cents=("scaduto_cents", "sum"),
        documenti=("ordine_id", "nunique"),
    ).sort_values(["scaduto_cents", "esposizione_cents"], ascending=False)
    return {
        "summary": f"Esposizione clienti alla data {as_of}.",
        "metrics": [
            {"label": "Esposizione totale", "value": int(grouped["esposizione_cents"].sum()), "unit": "cents"},
            {"label": "Scaduto totale", "value": int(grouped["scaduto_cents"].sum()), "unit": "cents"},
            {"label": "Clienti esposti", "value": int((grouped["esposizione_cents"] > 0).sum()), "unit": "count"},
        ],
        "table": {"columns": grouped.columns.tolist(), "rows": grouped.to_dict(orient="records")},
        "chart": {"type": "bar", "x": "cliente", "y": "esposizione_cents", "top": 10},
        "method": "Esposizione = importo fatture - pagamenti attribuiti; scaduto = residuo con data precedente alla data di analisi.",
        "warnings": ["Il dataset è sintetico; le scadenze rappresentano attese e non movimenti di cassa."],
    }


def transaction_volume() -> dict:
    frame = pd.read_csv(resolve_dataset("transazioni"), parse_dates=["data"])
    frame["mese"] = frame["data"].dt.to_period("M").astype(str)
    grouped = frame.groupby(["mese", "tipo"], as_index=False).agg(
        eventi=("id", "count"), importo_cents=("importo_cents", "sum")
    ).sort_values(["mese", "tipo"])
    return {
        "summary": "Volumi mensili per tipo di evento.",
        "table": {"columns": grouped.columns.tolist(), "rows": grouped.to_dict(orient="records")},
        "chart": {"type": "stacked_bar", "x": "mese", "y": "eventi", "series": "tipo"},
        "method": "Conteggio degli eventi della timeline normalizzata per mese e tipo; gli importi non sono sommati fra direzioni opposte.",
        "warnings": ["La timeline contiene documenti e scadenze: non equivale a fatturato o cassa."],
    }


def supplier_spend() -> dict:
    frame = pd.read_csv(resolve_dataset("ordini_acquisto"), parse_dates=["data"])
    grouped = frame.groupby(["fornitore_id", "fornitore_ragione_sociale"], as_index=False).agg(
        ordini=("id", "nunique"), imponibile_cents=("imponibile_cents", "sum"),
        trasporto_cents=("costo_trasporto_cents", "sum"), totale_cents=("totale_cents", "sum"),
    ).sort_values("totale_cents", ascending=False)
    total = grouped["totale_cents"].sum()
    grouped["quota_percentuale"] = (grouped["totale_cents"] / total * 100).round(2)
    return {
        "summary": "Valore degli ordini di acquisto e concentrazione per fornitore.",
        "table": {"columns": grouped.columns.tolist(), "rows": grouped.to_dict(orient="records")},
        "chart": {"type": "bar", "x": "fornitore_ragione_sociale", "y": "totale_cents"},
        "method": "Somma del totale lordo ordini di acquisto e quota sul totale del periodo.",
        "warnings": ["Sono inclusi anche ordini in bozza o confermati; filtrare per stato per analizzare il ricevuto."],
    }


def order_fulfillment() -> dict:
    rows = pd.read_csv(resolve_dataset("righe_ordini"))
    rows["evasione_percentuale"] = (
        rows["quantita_evasa_milli"] / rows["quantita_milli"] * 100
    ).round(2)
    result = rows[[
        "ordine_id", "articolo_id", "lotto_id", "quantita_milli",
        "quantita_evasa_milli", "unita_misura", "evasione_percentuale",
    ]].sort_values("evasione_percentuale")
    return {
        "summary": "Evasione quantitativa delle righe ordine.",
        "metrics": [
            {"label": "Righe complete", "value": int((result["evasione_percentuale"] == 100).sum()), "unit": "count"},
            {"label": "Righe parziali", "value": int(((result["evasione_percentuale"] > 0) & (result["evasione_percentuale"] < 100)).sum()), "unit": "count"},
            {"label": "Righe non evase", "value": int((result["evasione_percentuale"] == 0).sum()), "unit": "count"},
        ],
        "table": {"columns": result.columns.tolist(), "rows": result.to_dict(orient="records")},
        "method": "Quantità evasa / quantità ordinata × 100, calcolata per singola riga e unità.",
        "warnings": ["Le percentuali di unità diverse non vanno aggregate per quantità assoluta."],
    }
