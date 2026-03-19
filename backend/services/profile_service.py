from backend.schemas.api import GameProfile


_PROFILES = [
    GameProfile(
        id="cs2-safe",
        game="CS2",
        title="CS2 Safe Competitive",
        detection_keywords=["cs2", "counter", "csgo"],
        description="Bias toward frametime stability and lower desktop contention without touching game memory or network routing.",
        safe_preset="Attach session, test Above normal priority, and keep power-plan changes session-scoped.",
        expected_benefit="Cleaner frametime pacing and less background scheduler interference during short competitive matches.",
        risk_note="Avoid aggressive affinity reduction unless the machine has already proven stable under the balanced preset.",
        benchmark_expectation="Frame-time p95 should tighten before average FPS moves dramatically.",
        allowed_actions=["process_priority", "cpu_affinity", "power_plan"],
    ),
    GameProfile(
        id="valorant-safe",
        game="Valorant",
        title="Valorant Compatibility First",
        detection_keywords=["valorant"],
        description="Keep the optimizer conservative and compatibility-oriented around stricter anti-cheat expectations.",
        safe_preset="Stay in Manual or Assisted mode, prefer priority first, and treat benchmark proof as a gate before more changes.",
        expected_benefit="Better session stability with fewer unnecessary tweaks stacked on top of anti-cheat-sensitive play.",
        risk_note="Do not escalate toward future overlay-style features until compatibility is explicitly verified.",
        benchmark_expectation="Lower background CPU pressure and a flatter frametime p95 are the signals that matter most.",
        allowed_actions=["process_priority", "power_plan"],
    ),
    GameProfile(
        id="fortnite-balanced",
        game="Fortnite",
        title="Fortnite Balanced Session",
        detection_keywords=["fortnite"],
        description="Favor broad session balance over aggressive one-off tuning because match conditions and asset streaming vary.",
        safe_preset="Use balanced affinity only if CPU contention remains high after testing process priority.",
        expected_benefit="Reduced streaming spikes and steadier frame pacing when the desktop is under load.",
        risk_note="Do not treat a small FPS gain as proof if frame drops and p95 frametime worsen.",
        benchmark_expectation="Background pressure and frame-drop ratio should move down together.",
        allowed_actions=["process_priority", "cpu_affinity", "power_plan"],
    ),
    GameProfile(
        id="apex-balanced",
        game="Apex Legends",
        title="Apex Low-Noise Preset",
        detection_keywords=["apex", "r5apex"],
        description="Keep the machine quiet and reversible so the optimizer improves the session without becoming the problem.",
        safe_preset="Start with priority plus benchmark proof, then test balanced affinity only if the session is still CPU-heavy.",
        expected_benefit="More stable pacing during heavy fights and less sensitivity to desktop background noise.",
        risk_note="Stacking multiple tweaks without a benchmark capture makes it harder to tell what actually helped.",
        benchmark_expectation="Anomaly score and frame-drop ratio should move down if the preset is genuinely helping.",
        allowed_actions=["process_priority", "cpu_affinity"],
    ),
    GameProfile(
        id="warzone-balanced",
        game="Warzone",
        title="Warzone Session Stabilizer",
        detection_keywords=["warzone", "cod", "modernwarfare"],
        description="Treat the session like a heavy-load desktop problem first: control contention, then measure whether the system actually calmed down.",
        safe_preset="Start with session-scoped power plan plus priority, and only then test affinity if CPU pressure still dominates.",
        expected_benefit="Lower whole-system contention and better consistency under heavy match load.",
        risk_note="Do not confuse a short FPS spike with a trustworthy improvement if anomaly score and p95 frametime remain elevated.",
        benchmark_expectation="CPU contention and p95 frametime should improve together before the preset is trusted.",
        allowed_actions=["process_priority", "cpu_affinity", "power_plan"],
    ),
]


def list_profiles() -> list[GameProfile]:
    return _PROFILES


def get_profile(profile_id: str | None) -> GameProfile | None:
    if not profile_id:
        return None
    return next((profile for profile in _PROFILES if profile.id == profile_id), None)


def match_profile(game_name: str | None) -> GameProfile | None:
    if not game_name:
        return None
    lowered = game_name.lower()
    return next(
        (
            profile
            for profile in _PROFILES
            if any(keyword in lowered for keyword in profile.detection_keywords)
        ),
        None,
    )
