from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.schemas.api import BenchmarkEvidenceSummary, BenchmarkReport, BenchmarkWindow
from backend.services.benchmark_service import (
    benchmark_csv_file,
    benchmark_evidence,
    capture_baseline,
    latest_baseline,
    latest_report,
    run_benchmark,
)


router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


@router.get("/latest", response_model=BenchmarkReport | None)
def latest() -> BenchmarkReport | None:
    return latest_report()


@router.get("/baseline", response_model=BenchmarkWindow | None)
def baseline() -> BenchmarkWindow | None:
    return latest_baseline()


@router.get("/evidence", response_model=list[BenchmarkEvidenceSummary])
def evidence() -> list[BenchmarkEvidenceSummary]:
    return benchmark_evidence()


@router.get("/csv/{csv_id}")
def csv_download(csv_id: str) -> FileResponse:
    try:
        path = benchmark_csv_file(csv_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not path.exists():
        raise HTTPException(status_code=404, detail="Benchmark CSV was not found.")
    return FileResponse(path, media_type="text/csv", filename=f"{csv_id}.csv")


@router.post("/capture-baseline", response_model=BenchmarkWindow)
def capture(sample_limit: int = 60, scenario_id: str | None = None) -> BenchmarkWindow:
    try:
        return capture_baseline(sample_limit=sample_limit, scenario_id=scenario_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/run", response_model=BenchmarkReport)
def run(profile_id: str | None = None, sample_limit: int = 60) -> BenchmarkReport:
    try:
        return run_benchmark(profile_id=profile_id, sample_limit=sample_limit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
