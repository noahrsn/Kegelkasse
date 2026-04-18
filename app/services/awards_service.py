"""Awards service: calculate session/monthly/yearly/alltime awards."""

from __future__ import annotations

from collections import Counter

from app.database.models import AwardEntry, AwardType, Session


def calculate_session_awards(session: Session) -> list[AwardEntry]:
    """Calculate awards for a single session."""
    awards: list[AwardEntry] = []

    if not session.entries:
        return awards

    # Pudelkönig: most penalties by count
    penalty_counts: Counter[str] = Counter()
    for entry in session.entries:
        if not entry.absent:
            total = sum(p.count for p in entry.penalties)
            penalty_counts[entry.user_id] = total

    if penalty_counts:
        top_user, top_count = penalty_counts.most_common(1)[0]
        if top_count > 0:
            awards.append(
                AwardEntry(
                    type=AwardType.pudelkoenig,
                    user_id=top_user,
                    value=top_count,
                    label=f"{top_count} Strafen",
                )
            )

    # Goldesel: highest penalty sum by amount
    penalty_sums: dict[str, float] = {}
    for entry in session.entries:
        if not entry.absent:
            total = sum(p.amount for p in entry.penalties)
            penalty_sums[entry.user_id] = total

    if penalty_sums:
        top_user = max(penalty_sums, key=penalty_sums.get)  # type: ignore[arg-type]
        top_amount = penalty_sums[top_user]
        if top_amount > 0:
            awards.append(
                AwardEntry(
                    type=AwardType.goldesel,
                    user_id=top_user,
                    value=top_amount,
                    label=f"{top_amount:.2f} €",
                )
            )

    return awards
