from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_ROOT = PROJECT_ROOT / "datasets" / "demo"

DATASETS = {
    "vendite": DATASET_ROOT / "vendite.csv",
    "magazzino": DATASET_ROOT / "magazzino.csv",
    "incassi": DATASET_ROOT / "incassi.csv",
    "transazioni": DATASET_ROOT / "transazioni.csv",
    "ordini": DATASET_ROOT / "ordini.csv",
    "righe_ordini": DATASET_ROOT / "righe_ordini.csv",
    "ddt": DATASET_ROOT / "ddt.csv",
    "righe_ddt": DATASET_ROOT / "righe_ddt.csv",
    "ordini_acquisto": DATASET_ROOT / "ordini_acquisto.csv",
    "fatture_vendita": DATASET_ROOT / "fatture_vendita.csv",
    "pagamenti": DATASET_ROOT / "pagamenti.csv",
}


def resolve_dataset(name: str) -> Path:
    """Return only registered datasets; arbitrary paths are never accepted."""
    try:
        path = DATASETS[name]
    except KeyError as exc:
        raise ValueError(f"Dataset non registrato: {name}") from exc
    if not path.is_file():
        raise FileNotFoundError(path)
    return path
