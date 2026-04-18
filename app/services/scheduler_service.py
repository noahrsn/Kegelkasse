"""APScheduler service: monthly fee booking, email reminders, poll deadlines."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    """Start the background scheduler with all configured jobs."""
    scheduler.add_job(
        book_monthly_fees,
        "cron",
        day=1,
        hour=2,
        minute=0,
        id="monthly_fees",
        replace_existing=True,
    )

    scheduler.add_job(
        send_debt_reminders,
        "cron",
        day_of_week="mon",
        hour=9,
        minute=0,
        id="debt_reminders",
        replace_existing=True,
    )

    scheduler.add_job(
        close_expired_polls,
        "interval",
        minutes=15,
        id="close_polls",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def book_monthly_fees() -> None:
    """Book monthly membership fees for all groups (runs on the 1st of each month)."""
    logger.info("Booking monthly fees...")
    # TODO: iterate groups, check fee_day, create debt entries


def send_debt_reminders() -> None:
    """Send weekly debt reminder emails to members with open balances."""
    logger.info("Sending debt reminders...")
    # TODO: query debts, send emails via email_service


def close_expired_polls() -> None:
    """Close polls that have passed their deadline."""
    logger.info("Checking for expired polls...")
    # TODO: query open polls with passed deadlines, close them
