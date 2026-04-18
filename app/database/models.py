"""Pydantic models matching the Cosmos DB document structures from PROJEKTPLAN.md."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> datetime:
    return datetime.now(tz=UTC)


# ── Enums ────────────────────────────────────────────────────────────────────


class Role(str, Enum):
    admin = "admin"
    praesident = "präsident"
    kassenwart = "kassenwart"
    mitglied = "mitglied"


class SessionStatus(str, Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"


class EventType(str, Enum):
    single = "single"
    recurring = "recurring"
    multi_day = "multi_day"


class RecurrencePattern(str, Enum):
    weekly = "weekly"
    monthly_nth_weekday = "monthly_nth_weekday"


class RSVPStatus(str, Enum):
    attending = "attending"
    declined = "declined"
    pending = "pending"


class DebtType(str, Enum):
    penalty = "penalty"
    monthly_fee = "monthly_fee"
    correction = "correction"
    storno = "storno"
    late_payment_fee = "late_payment_fee"


class TransactionType(str, Enum):
    income = "income"
    expense = "expense"


class TransactionCategory(str, Enum):
    member_payment = "member_payment"
    event_expense = "event_expense"
    equipment_expense = "equipment_expense"
    other_income = "other_income"
    other_expense = "other_expense"
    bank_interest = "bank_interest"


class TransactionSource(str, Enum):
    csv_import = "csv_import"
    manual = "manual"


class AwardPeriod(str, Enum):
    session = "session"
    monthly = "monthly"
    yearly = "yearly"
    alltime = "alltime"


class AwardType(str, Enum):
    pudelkoenig = "pudelkoenig"
    goldesel = "goldesel"
    streber = "streber"
    eisenmann = "eisenmann"
    spaetzuender = "spaetzuender"


class LogVisibility(str, Enum):
    all = "all"
    kassenwart_admin = "kassenwart_admin"


class PaymentDeadlineType(str, Enum):
    days_before_next_event = "days_before_next_event"
    days_after_booking = "days_after_booking"
    fixed_day_of_month = "fixed_day_of_month"


class PollType(str, Enum):
    single_choice = "single_choice"
    multi_choice = "multi_choice"
    yes_no = "yes_no"


# ── Nested / Embedded Models ────────────────────────────────────────────────


class NotificationSettings(BaseModel):
    new_penalty: bool = True
    monthly_summary: bool = True
    session_reminder: bool = False
    debt_reminder: bool = True
    event_invitation: bool = True
    rsvp_reminder: bool = True
    deadline_warning: bool = True
    payment_received: bool = True
    late_payment_fee: bool = True
    new_poll: bool = True
    poll_closing_soon: bool = True
    poll_closed: bool = False


class PaymentInfo(BaseModel):
    iban: str = ""
    paypal: str = ""


class PaymentDeadline(BaseModel):
    type: PaymentDeadlineType = PaymentDeadlineType.days_before_next_event
    days: int = 2
    day: Optional[int] = None  # only for fixed_day_of_month


class Treasury(BaseModel):
    opening_balance: float = 0.0
    opening_balance_date: Optional[datetime] = None
    payment_deadline: PaymentDeadline = Field(default_factory=PaymentDeadline)
    late_payment_fee: float = 2.0


class Rulebook(BaseModel):
    content: str = ""
    last_edited_by: Optional[str] = None
    last_edited_at: Optional[datetime] = None


class GroupMember(BaseModel):
    user_id: str
    role: Role = Role.mitglied
    joined_at: datetime = Field(default_factory=now_iso)
    iban: Optional[str] = None


class PenaltyEntry(BaseModel):
    catalog_id: str
    count: int = 1
    amount: float = 0.0


class SessionEntry(BaseModel):
    user_id: str
    penalties: list[PenaltyEntry] = Field(default_factory=list)
    absent: bool = False
    late_arrival: bool = False
    late_arrival_avg: float = 0.0


class GuestEntry(BaseModel):
    guest_id: str = Field(default_factory=new_id)
    name: str
    penalties: list[PenaltyEntry] = Field(default_factory=list)
    debt_total: float = 0.0
    paid: bool = False
    paid_at: Optional[datetime] = None


class Recurrence(BaseModel):
    pattern: RecurrencePattern
    weekday: int  # 0=Monday .. 6=Sunday
    nth: Optional[int] = None  # e.g. 4 = fourth occurrence
    until: Optional[datetime] = None


class RSVPEntry(BaseModel):
    user_id: str
    status: RSVPStatus = RSVPStatus.pending
    note: str = ""
    responded_at: Optional[datetime] = None
    late_response: bool = False


class DebtEntry(BaseModel):
    type: DebtType
    amount: float
    description: str = ""
    session_id: Optional[str] = None
    due_date: Optional[datetime] = None
    paid: bool = False
    paid_at: Optional[datetime] = None
    transaction_id: Optional[str] = None
    created_at: datetime = Field(default_factory=now_iso)
    created_by: Optional[str] = None
    cancelled: bool = False


class AwardEntry(BaseModel):
    type: AwardType
    user_id: str
    value: float = 0
    label: str = ""
    calculated_at: datetime = Field(default_factory=now_iso)


class PollOption(BaseModel):
    id: str = Field(default_factory=new_id)
    label: str


class PollVote(BaseModel):
    user_id: str
    option_ids: list[str] = Field(default_factory=list)
    voted_at: datetime = Field(default_factory=now_iso)


# ── Top-Level Document Models (Cosmos DB Containers) ────────────────────────


class User(BaseModel):
    id: str = Field(default_factory=new_id)
    email: str
    first_name: str
    last_name: str
    password_hash: str = ""
    email_verified: bool = False
    verification_token: Optional[str] = None
    verification_token_expires: Optional[datetime] = None
    reset_token: Optional[str] = None
    reset_token_expires: Optional[datetime] = None
    group_ids: list[str] = Field(default_factory=list)
    notification_settings: dict[str, NotificationSettings] = Field(
        default_factory=dict
    )
    created_at: datetime = Field(default_factory=now_iso)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class Group(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    invite_token: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    monthly_fee: float = 0.0
    fee_day: int = 1
    payment_info: PaymentInfo = Field(default_factory=PaymentInfo)
    rulebook: Rulebook = Field(default_factory=Rulebook)
    treasury: Treasury = Field(default_factory=Treasury)
    members: list[GroupMember] = Field(default_factory=list)
    setup_step: int = 1  # 0 = wizard complete


class PenaltyCatalog(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    name: str
    amount: float = 0.10
    icon: str = "\U0001f3b3"  # 🎳
    active: bool = True


class Session(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    event_id: Optional[str] = None
    date: datetime = Field(default_factory=now_iso)
    status: SessionStatus = SessionStatus.draft
    recorded_by: Optional[str] = None
    entries: list[SessionEntry] = Field(default_factory=list)
    guest_entries: list[GuestEntry] = Field(default_factory=list)
    submitted_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class Event(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    title: str
    description: str = ""
    type: EventType = EventType.single
    start_date: datetime = Field(default_factory=now_iso)
    end_date: Optional[datetime] = None
    recurrence: Optional[Recurrence] = None
    rsvp_deadline_hours: int = 48
    created_by: Optional[str] = None
    rsvp_entries: list[RSVPEntry] = Field(default_factory=list)
    linked_session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=now_iso)


class Debt(BaseModel):
    id: str = Field(default_factory=new_id)
    user_id: str
    group_id: str
    entries: list[DebtEntry] = Field(default_factory=list)


class Transaction(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    date: datetime = Field(default_factory=now_iso)
    type: TransactionType = TransactionType.income
    category: TransactionCategory = TransactionCategory.member_payment
    amount: float = 0.0
    description: str = ""
    matched_user_id: Optional[str] = None
    matched_debt_entry_ids: list[str] = Field(default_factory=list)
    source: TransactionSource = TransactionSource.manual
    csv_row_hash: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_iso)


class Award(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    period: AwardPeriod = AwardPeriod.monthly
    period_ref: str = ""  # e.g. "2026-04" or session_id
    awards: list[AwardEntry] = Field(default_factory=list)


class Log(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    actor_id: Optional[str] = None
    actor_name: str = ""
    action: str = ""
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    details: str = ""
    visible_to: LogVisibility = LogVisibility.all
    timestamp: datetime = Field(default_factory=now_iso)


class Poll(BaseModel):
    id: str = Field(default_factory=new_id)
    group_id: str
    title: str
    description: str = ""
    type: PollType = PollType.single_choice
    max_choices: int = 1
    options: list[PollOption] = Field(default_factory=list)
    anonymous: bool = False
    results_visible_before_close: bool = True
    deadline: Optional[datetime] = None
    closed: bool = False
    closed_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_iso)
    votes: list[PollVote] = Field(default_factory=list)
