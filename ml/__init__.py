__all__ = ["AeternaModel", "DatasetLoader"]


def __getattr__(name: str):
    if name == "AeternaModel":
        from ml.aeterna_model import AeternaModel

        return AeternaModel
    if name == "DatasetLoader":
        from ml.dataset_loader import DatasetLoader

        return DatasetLoader
    raise AttributeError(name)
