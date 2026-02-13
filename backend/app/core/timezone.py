"""
Timezone utilities for Brazilian timezone (BRT/BRST).

All timestamps should use these functions instead of datetime.utcnow() or date.today()
to ensure correct timezone handling.
"""

from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

# Brazilian timezone (handles daylight saving automatically)
BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")


def now_brazil() -> datetime:
    """
    Get current datetime in Brazilian timezone.
    
    Use this instead of datetime.now() or datetime.utcnow()
    
    Returns:
        datetime: Current datetime in Brazil timezone (BRT/BRST)
    """
    return datetime.now(BRAZIL_TZ)


def today_brazil() -> date:
    """
    Get current date in Brazilian timezone.
    
    Use this instead of date.today()
    
    Returns:
        date: Current date in Brazil timezone
    """
    return now_brazil().date()


def to_brazil_tz(dt: datetime) -> datetime:
    """
    Convert any datetime to Brazilian timezone.
    
    Args:
        dt: datetime object (aware or naive)
        
    Returns:
        datetime: datetime in Brazilian timezone
    """
    if dt.tzinfo is None:
        # Naive datetime - assume UTC
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(BRAZIL_TZ)


def to_utc(dt: datetime) -> datetime:
    """
    Convert Brazilian datetime to UTC.
    
    Args:
        dt: datetime in Brazilian timezone
        
    Returns:
        datetime: datetime in UTC
    """
    if dt.tzinfo is None:
        # Naive datetime - assume Brazilian timezone
        dt = dt.replace(tzinfo=BRAZIL_TZ)
    return dt.astimezone(ZoneInfo("UTC"))


def make_aware(dt: datetime, tz: ZoneInfo = BRAZIL_TZ) -> datetime:
    """
    Make a naive datetime timezone-aware.
    
    Args:
        dt: naive datetime
        tz: timezone to use (default: Brazil)
        
    Returns:
        datetime: timezone-aware datetime
    """
    if dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=tz)


def remove_tz(dt: datetime) -> datetime:
    """
    Remove timezone info from datetime.
    Use when saving to database with TIMESTAMP WITHOUT TIME ZONE.

    Args:
        dt: timezone-aware datetime

    Returns:
        datetime: naive datetime (same local time)
    """
    return dt.replace(tzinfo=None)


def get_day_range_utc(target_date: date = None) -> tuple[datetime, datetime]:
    """
    Get UTC datetime range for a given day in Brazilian timezone.

    Useful for querying databases that store timestamps in UTC
    when you want to filter by a specific day in Brazil.

    Args:
        target_date: The date in Brazilian timezone (default: today in Brazil)

    Returns:
        tuple: (start_utc, end_utc) naive datetimes in UTC

    Example:
        For 2026-02-12 in São Paulo (UTC-3):
        - start_utc = 2026-02-12 03:00:00 UTC
        - end_utc = 2026-02-13 02:59:59.999999 UTC
    """
    if target_date is None:
        target_date = today_brazil()

    # Start of day in Brazil (00:00:00)
    start_brazil = datetime(target_date.year, target_date.month, target_date.day,
                           0, 0, 0, tzinfo=BRAZIL_TZ)

    # End of day in Brazil (23:59:59.999999)
    end_brazil = datetime(target_date.year, target_date.month, target_date.day,
                         23, 59, 59, 999999, tzinfo=BRAZIL_TZ)

    # Convert to UTC and remove timezone info (for naive datetime comparison)
    start_utc = start_brazil.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_utc = end_brazil.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    return start_utc, end_utc


def get_period_range_utc(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    """
    Get UTC datetime range for a date range in Brazilian timezone.

    Useful for querying databases that store timestamps in UTC
    when you want to filter by a date range in Brazil.

    Args:
        start_date: Start date in Brazilian timezone
        end_date: End date in Brazilian timezone

    Returns:
        tuple: (start_utc, end_utc) naive datetimes in UTC

    Example:
        For start=2026-02-01, end=2026-02-12 in São Paulo (UTC-3):
        - start_utc = 2026-02-01 03:00:00 UTC (midnight Feb 1 in Brazil)
        - end_utc = 2026-02-13 02:59:59.999999 UTC (end of Feb 12 in Brazil)
    """
    # Start of first day in Brazil (00:00:00)
    start_brazil = datetime(start_date.year, start_date.month, start_date.day,
                           0, 0, 0, tzinfo=BRAZIL_TZ)

    # End of last day in Brazil (23:59:59.999999)
    end_brazil = datetime(end_date.year, end_date.month, end_date.day,
                         23, 59, 59, 999999, tzinfo=BRAZIL_TZ)

    # Convert to UTC and remove timezone info (for naive datetime comparison)
    start_utc = start_brazil.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_utc = end_brazil.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    return start_utc, end_utc
