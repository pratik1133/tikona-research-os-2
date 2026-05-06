from __future__ import annotations

import os

from supabase import Client, create_client


def get_service_client() -> Client:
    """Build a Supabase client using the service-role key (full DB + storage access)."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in env")
    return create_client(url, key)
