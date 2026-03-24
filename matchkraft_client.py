"""
Optimized MatchKraft API Client
- Session-level connection pooling (reuses TCP connections)
- Exponential backoff retries on transient failures
- Concurrent job polling with threading
- LRU cache for repeated result fetches
- Batch helpers for multi-job workflows
"""

import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_KEY = os.getenv("MATCHKRAFT_API_KEY", "")
BASE_URL = "https://app.matchkraft.com/api/v1"

DEFAULT_POLL_INTERVAL = 2      # seconds between status checks
DEFAULT_POLL_TIMEOUT  = 300    # max seconds to wait for a job
MAX_WORKERS           = 8      # thread pool size for concurrent jobs


# ---------------------------------------------------------------------------
# Internal HTTP session with pooling + retries
# ---------------------------------------------------------------------------

def _build_session(api_key: str) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })

    retry = Retry(
        total=5,
        backoff_factor=0.5,           # waits 0.5, 1, 2, 4, 8 s between retries
        status_forcelist={429, 500, 502, 503, 504},
        allowed_methods={"GET", "POST"},
        raise_on_status=False,
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=10,           # one pool per unique host
        pool_maxsize=20,               # max open sockets per pool
    )
    session.mount("https://", adapter)
    session.mount("http://",  adapter)
    return session


# ---------------------------------------------------------------------------
# MatchKraft Client
# ---------------------------------------------------------------------------

class MatchKraftClient:
    """
    Optimized wrapper around the MatchKraft REST API.

    Usage
    -----
    client = MatchKraftClient()                         # reads MATCHKRAFT_API_KEY env var
    client = MatchKraftClient(api_key="LYNFRt...")      # or pass directly

    # Deduplicate a single list
    results = client.deduplicate(["Acme Corp", "ACME", "Google LLC", "Google"])

    # Match two lists
    results = client.match(
        list_a=["Apple Inc", "Microsoft"],
        list_b=["Apple", "MSFT Corp"],
    )

    # Run multiple jobs concurrently
    results = client.batch([
        {"type": "deduplicate", "data": ["Foo Ltd", "foo ltd"]},
        {"type": "match", "list_a": ["Bar Inc"], "list_b": ["Bar"]},
    ])
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        poll_timeout: float  = DEFAULT_POLL_TIMEOUT,
        max_workers: int     = MAX_WORKERS,
    ):
        self.api_key       = api_key or API_KEY
        self.poll_interval = poll_interval
        self.poll_timeout  = poll_timeout
        self._session      = _build_session(self.api_key)
        self._executor     = ThreadPoolExecutor(max_workers=max_workers)

        if not self.api_key:
            raise ValueError(
                "No API key supplied. Pass api_key= or set MATCHKRAFT_API_KEY."
            )

    # ------------------------------------------------------------------
    # Low-level HTTP helpers
    # ------------------------------------------------------------------

    def _post(self, path: str, payload: dict) -> dict:
        url = f"{BASE_URL}{path}"
        resp = self._session.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _get(self, path: str) -> dict:
        url = f"{BASE_URL}{path}"
        resp = self._session.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Job lifecycle
    # ------------------------------------------------------------------

    def _create_dedup_job(self, names: list[str]) -> str:
        data = self._post("/jobs/highlight-duplicates", {"names": names})
        return data["job_id"]

    def _create_match_job(self, list_a: list[str], list_b: list[str]) -> str:
        data = self._post("/jobs/fuzzy-match", {"list_a": list_a, "list_b": list_b})
        return data["job_id"]

    def _execute_job(self, job_id: str) -> None:
        self._post(f"/jobs/{job_id}/execute", {})

    def _poll_until_done(self, job_id: str) -> dict:
        deadline = time.monotonic() + self.poll_timeout
        interval = self.poll_interval

        while time.monotonic() < deadline:
            info = self._get(f"/jobs/{job_id}")
            status = info.get("status", "").lower()

            if status == "completed":
                return info
            if status in {"failed", "error"}:
                raise RuntimeError(f"Job {job_id} failed: {info}")

            time.sleep(interval)
            # gentle back-off up to 10 s so we don't hammer the API
            interval = min(interval * 1.3, 10.0)

        raise TimeoutError(f"Job {job_id} did not complete within {self.poll_timeout}s")

    @lru_cache(maxsize=256)
    def _fetch_results(self, job_id: str) -> dict:
        """Cached – repeated calls for the same job_id are free."""
        return self._get(f"/jobs/{job_id}/results")

    def _run_job(self, job_id: str) -> dict:
        self._execute_job(job_id)
        self._poll_until_done(job_id)
        return self._fetch_results(job_id)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def deduplicate(self, names: list[str]) -> dict:
        """
        Find duplicate company names within a single list.

        Returns the raw MatchKraft results dict.
        """
        job_id = self._create_dedup_job(names)
        return self._run_job(job_id)

    def match(self, list_a: list[str], list_b: list[str]) -> dict:
        """
        Fuzzy-match company names across two lists.

        Returns the raw MatchKraft results dict.
        """
        job_id = self._create_match_job(list_a, list_b)
        return self._run_job(job_id)

    def batch(self, jobs: list[dict]) -> list[dict]:
        """
        Run multiple jobs concurrently and return results in the same order.

        Each job dict must have a "type" key ("deduplicate" or "match") plus
        the corresponding data keys ("data" for deduplicate, "list_a"/"list_b"
        for match).

        Example
        -------
        results = client.batch([
            {"type": "deduplicate", "data": ["Foo", "foo"]},
            {"type": "match", "list_a": ["A"], "list_b": ["a"]},
        ])
        """
        futures_map = {}

        for idx, job in enumerate(jobs):
            job_type = job["type"]
            if job_type == "deduplicate":
                future = self._executor.submit(self.deduplicate, job["data"])
            elif job_type == "match":
                future = self._executor.submit(self.match, job["list_a"], job["list_b"])
            else:
                raise ValueError(f"Unknown job type: {job_type!r}")
            futures_map[future] = idx

        results = [None] * len(jobs)
        for future in as_completed(futures_map):
            idx = futures_map[future]
            results[idx] = future.result()   # re-raises any exception

        return results

    def close(self):
        self._session.close()
        self._executor.shutdown(wait=False)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ---------------------------------------------------------------------------
# CLI entry-point  (python matchkraft_client.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import argparse

    parser = argparse.ArgumentParser(description="MatchKraft optimized CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    # -- deduplicate --------------------------------------------------------
    p_dedup = sub.add_parser("dedup", help="Find duplicates in a list")
    p_dedup.add_argument("names", nargs="+", help="Company names to deduplicate")

    # -- match --------------------------------------------------------------
    p_match = sub.add_parser("match", help="Fuzzy-match two lists")
    p_match.add_argument("--list-a", nargs="+", required=True)
    p_match.add_argument("--list-b", nargs="+", required=True)

    args = parser.parse_args()

    with MatchKraftClient() as client:
        if args.command == "dedup":
            out = client.deduplicate(args.names)
        else:
            out = client.match(args.list_a, args.list_b)

    print(json.dumps(out, indent=2))
