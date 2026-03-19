from backend.schemas.api import RecommendationItem
from backend.services.profile_service import match_profile


def build_recommendations(latest: dict[str, float | str]) -> list[RecommendationItem]:
    items: list[RecommendationItem] = []
    profile = match_profile(str(latest.get("game_name", "")))
    if latest["mode"] == "disabled":
        items.append(
            RecommendationItem(
                title="Choose a telemetry mode",
                summary="Enable Demo mode for the thesis walkthrough or Live mode to inspect local gaming-session pressure.",
                impact="low",
            )
        )
        return items
    if profile:
        items.append(
            RecommendationItem(
                title=f"Test the {profile.game} safe preset",
                summary=profile.benchmark_expectation,
                impact="medium",
            )
        )
    if float(latest["frametime_p95_ms"]) > 16:
        items.append(
            RecommendationItem(
                title="Reduce frame-time variance",
                summary="A higher frame-time window suggests CPU or background contention. Test process priority first.",
                impact="high",
            )
        )
    if float(latest["cpu_total_pct"]) > 82:
        items.append(
            RecommendationItem(
                title="Lower CPU contention",
                summary="Foreground CPU pressure is elevated. Try the reversible affinity preset or close background launchers.",
                impact="medium",
            )
        )
    if float(latest["background_cpu_pct"]) > 28 or int(latest["background_process_count"]) > 36:
        items.append(
            RecommendationItem(
                title="Clean the session",
                summary="There are many desktop processes competing for scheduler time. Pause recording, overlays, and update agents.",
                impact="medium",
            )
        )
    if float(latest["anomaly_score"]) > 0.7:
        items.append(
            RecommendationItem(
                title="Watch for instability",
                summary="Session pressure is abnormal for the current window. Avoid stacking additional tweaks until the load settles.",
                impact="high",
            )
        )
    if not items:
        items.append(
            RecommendationItem(
                title="Session is stable",
                summary="Current local signals look healthy. You can keep the optimizer idle until you explicitly need a session profile.",
                impact="low",
            )
        )
    return items
