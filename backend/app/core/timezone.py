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
