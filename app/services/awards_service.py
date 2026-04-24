"""Awards service: calculate session/monthly/yearly/alltime awards."""

from __future__ import annotations

from collections import Counter

from app.database.models import AwardEntry, AwardType, Session


def calculate_session_awards(session: Session) -> list[AwardEntry]:
    """Calculate awards for a single session."""
    awards: list[AwardEntry] = []

    if not session.entries:
        return awards

    present = [e for e in session.entries if not e.absent]

    # Pudelkönig: most penalties by count
    penalty_counts: Counter[str] = Counter()
    for entry in present:
        penalty_counts[entry.user_id] = sum(p.count for p in entry.penalties)

    if penalty_counts:
        top_user, top_count = penalty_counts.most_common(1)[0]
        if top_count > 0:
            awards.append(AwardEntry(
                type=AwardType.pudelkoenig,
                user_id=top_user,
                value=top_count,
                label=f"{top_count} Strafen",
            ))

    # Goldesel: highest penalty sum by amount
    penalty_sums: dict[str, float] = {}
    for entry in present:
        penalty_sums[entry.user_id] = sum(p.amount * p.count for p in entry.penalties)

    if penalty_sums:
        top_user = max(penalty_sums, key=penalty_sums.get)  # type: ignore[arg-type]
        top_amount = penalty_sums[top_user]
        if top_amount > 0:
            awards.append(AwardEntry(
                type=AwardType.goldesel,
                user_id=top_user,
                value=top_amount,
                label=f"{top_amount:.2f} €",
            ))

    # Spätzünder: most late arrivals in this session
    late_counts: Counter[str] = Counter()
    for entry in session.entries:
        if entry.late_arrival and not entry.absent:
            late_counts[entry.user_id] += 1

    if late_counts:
        top_user, top_count = late_counts.most_common(1)[0]
        awards.append(AwardEntry(
            type=AwardType.spaetzuender,
            user_id=top_user,
            value=top_count,
            label=f"{top_count}× zu spät",
        ))

    return awards


def calculate_period_awards(sessions: list[Session], member_ids: list[str]) -> list[AwardEntry]:
    """Calculate period-level awards (streber, eisenmann) from multiple sessions."""
    awards: list[AwardEntry] = []

    if not sessions or not member_ids:
        return awards

    attendance: dict[str, int] = {uid: 0 for uid in member_ids}
    total: dict[str, int] = {uid: 0 for uid in member_ids}

    for s in sessions:
        for entry in s.entries:
            uid = entry.user_id
            if uid not in member_ids:
                continue
            total[uid] = total.get(uid, 0) + 1
            if not entry.absent:
                attendance[uid] = attendance.get(uid, 0) + 1

    # Streber: 100% attendance (only eligible members who attended all sessions)
    session_count = len(sessions)
    if session_count > 0:
        streberkandidaten = [
            uid for uid in member_ids
            if total.get(uid, 0) == session_count and attendance.get(uid, 0) == session_count
        ]
        for uid in streberkandidaten:
            awards.append(AwardEntry(
                type=AwardType.streber,
                user_id=uid,
                value=session_count,
                label=f"100 % — {session_count} Abende",
            ))

    # Eisenmann: longest consecutive attendance streak
    # Build per-member per-session attendance list (sorted chronologically)
    sorted_sessions = sorted(sessions, key=lambda s: s.date)
    best_streak_user: str | None = None
    best_streak_len = 0

    for uid in member_ids:
        streak = 0
        best = 0
        for s in sorted_sessions:
            entry = next((e for e in s.entries if e.user_id == uid), None)
            if entry and not entry.absent:
                streak += 1
                best = max(best, streak)
            else:
                streak = 0
        if best > best_streak_len:
            best_streak_len = best
            best_streak_user = uid

    if best_streak_user and best_streak_len > 1:
        awards.append(AwardEntry(
            type=AwardType.eisenmann,
            user_id=best_streak_user,
            value=best_streak_len,
            label=f"{best_streak_len} Abende in Folge",
        ))

    return awards
