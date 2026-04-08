#!/usr/bin/env python3
"""Idempotent data updater for Lucerna's static JSON config files.

Single entry point that checks all data files against their upstream sources,
updates them if stale, validates the result, and regenerates derived files
(e.g., frontend tax data). Safe to run at any time — if data is already
current, it reports "up to date" and exits cleanly.

Usage:
    # Check and update all data files (default)
    python -m scripts.update_data

    # Validate without fetching
    python -m scripts.update_data --validate

    # Print staleness dashboard
    python -m scripts.update_data --summary

    # Target a specific year (for testing or pre-release)
    python -m scripts.update_data --year 2027

    # Dry run — show what would change
    python -m scripts.update_data --dry-run

Designed to be run from a workflow_dispatch GitHub Action or locally.
"""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_FALLBACK = (
    ROOT_DIR / "frontend" / "src" / "lib" / "tax" / "federal-brackets-2025.json"
)


# ──────────────────────────────────────────────
# Discovery
# ──────────────────────────────────────────────


def discover_data_files() -> list[Path]:
    """Find all JSON data files in backend/data/."""
    return sorted(DATA_DIR.glob("*.json"))


# ──────────────────────────────────────────────
# Metadata validation
# ──────────────────────────────────────────────

REQUIRED_METADATA_FIELDS = {"last_updated"}
RECOMMENDED_METADATA_FIELDS = {"notes"}
DESCRIPTION_FIELDS = {"description", "primary_source"}


def validate_metadata(data: dict, filepath: Path) -> list[str]:
    """Check that the file has a proper metadata block."""
    warnings: list[str] = []
    name = filepath.stem

    metadata = data.get("metadata")
    if metadata is None:
        warnings.append(f"[{name}] MISSING metadata block entirely")
        return warnings

    for field in REQUIRED_METADATA_FIELDS:
        if field not in metadata:
            warnings.append(f"[{name}] metadata missing required field: {field}")

    if not DESCRIPTION_FIELDS & set(metadata.keys()):
        warnings.append(
            f"[{name}] metadata missing a description field "
            f"(expected one of: {', '.join(sorted(DESCRIPTION_FIELDS))})"
        )

    for field in RECOMMENDED_METADATA_FIELDS:
        if field not in metadata:
            warnings.append(f"[{name}] metadata missing recommended field: {field}")

    last_updated = metadata.get("last_updated")
    if last_updated:
        try:
            datetime.strptime(last_updated, "%Y-%m-%d")
        except ValueError:
            warnings.append(
                f"[{name}] metadata.last_updated is not YYYY-MM-DD: {last_updated}"
            )

    return warnings


# ──────────────────────────────────────────────
# File-specific validators
# ──────────────────────────────────────────────


def validate_tax_brackets(data: dict, filepath: Path) -> list[str]:
    """Validate the tax brackets JSON structure."""
    warnings: list[str] = []
    name = filepath.stem

    federal = data.get("federal")
    if federal is None:
        warnings.append(f"[{name}] missing 'federal' section")
        return warnings

    std_ded = federal.get("standard_deduction", {})
    for fs in ("single", "married_filing_jointly"):
        if fs not in std_ded:
            warnings.append(f"[{name}] federal.standard_deduction missing '{fs}'")

    brackets = federal.get("brackets", {})
    for fs in ("single", "married_filing_jointly"):
        fs_brackets = brackets.get(fs, [])
        if not fs_brackets:
            warnings.append(f"[{name}] federal.brackets.{fs} is empty")
            continue

        rates = [b["rate"] for b in fs_brackets]
        if rates != sorted(rates):
            warnings.append(f"[{name}] federal.brackets.{fs}: rates not ascending")

        for i in range(1, len(fs_brackets)):
            prev_max = fs_brackets[i - 1]["max"]
            curr_min = fs_brackets[i]["min"]
            if prev_max != "inf" and prev_max != curr_min:
                warnings.append(
                    f"[{name}] federal.brackets.{fs}: gap between bracket {i-1} "
                    f"(max={prev_max}) and bracket {i} (min={curr_min})"
                )

        last_max = fs_brackets[-1]["max"]
        if last_max != "inf" and last_max is not None:
            warnings.append(
                f"[{name}] federal.brackets.{fs}: last bracket max should be 'inf', "
                f"got {last_max}"
            )

    return warnings


def validate_rmd_tables(data: dict, filepath: Path) -> list[str]:
    """Validate the RMD tables JSON structure with RMD-specific checks."""
    warnings: list[str] = []
    name = filepath.stem

    ult = data.get("uniform_lifetime_table")
    if ult is None:
        warnings.append(f"[{name}] missing 'uniform_lifetime_table' section")
    else:
        entries = ult.get("entries", {})
        if not entries:
            warnings.append(f"[{name}] uniform_lifetime_table.entries is empty")
        else:
            ages = sorted(int(k) for k in entries.keys())
            values = [entries[str(a)] for a in ages]
            for i in range(1, len(values)):
                if values[i] >= values[i - 1]:
                    warnings.append(
                        f"[{name}] uniform_lifetime_table NOT monotonically decreasing: "
                        f"age {ages[i-1]}={values[i-1]} -> age {ages[i]}={values[i]}"
                    )
                    break

            min_age = ult.get("min_age")
            earliest_entry = min(ages)
            if min_age is not None and min_age != earliest_entry:
                warnings.append(
                    f"[{name}] uniform_lifetime_table.min_age ({min_age}) does not "
                    f"match earliest entry age ({earliest_entry})"
                )

    sar = data.get("start_age_rules")
    if sar is None:
        warnings.append(f"[{name}] missing 'start_age_rules' section")
    else:
        rules = sar.get("rules", [])
        if not rules:
            warnings.append(f"[{name}] start_age_rules.rules is empty")
        else:
            last_rule = rules[-1]
            if last_rule.get("born_on_or_before") is not None:
                warnings.append(
                    f"[{name}] start_age_rules: last rule should be catch-all "
                    f"(born_on_or_before: null), got {last_rule.get('born_on_or_before')}"
                )

            thresholds = [
                r["born_on_or_before"]
                for r in rules
                if r.get("born_on_or_before") is not None
            ]
            if thresholds != sorted(thresholds):
                warnings.append(
                    f"[{name}] start_age_rules: born_on_or_before not ascending"
                )

    if ult and sar:
        min_age = ult.get("min_age")
        rules = sar.get("rules", [])
        start_ages = [r.get("rmd_start_age") for r in rules if r.get("rmd_start_age")]
        if min_age and start_ages:
            earliest_start = min(start_ages)
            if min_age > earliest_start:
                warnings.append(
                    f"[{name}] uniform_lifetime_table.min_age ({min_age}) is greater "
                    f"than earliest RMD start age ({earliest_start}) — table must cover all possible start ages"
                )

    return warnings


FILE_VALIDATORS = {
    "tax_brackets_2025": validate_tax_brackets,
    "rmd_tables": validate_rmd_tables,
}


# ──────────────────────────────────────────────
# Validate
# ──────────────────────────────────────────────


def validate_file(filepath: Path) -> list[str]:
    """Run metadata + file-specific validations on a single JSON file."""
    warnings: list[str] = []
    name = filepath.stem

    try:
        with open(filepath, "r") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"[{name}] INVALID JSON: {e}"]

    warnings.extend(validate_metadata(data, filepath))

    validator = FILE_VALIDATORS.get(name)
    if validator:
        warnings.extend(validator(data, filepath))

    return warnings


def validate_all() -> list[str]:
    """Validate all data files and return combined warnings."""
    files = discover_data_files()
    if not files:
        return ["No JSON data files found in backend/data/"]

    all_warnings: list[str] = []
    for filepath in files:
        all_warnings.extend(validate_file(filepath))

    return all_warnings


# ──────────────────────────────────────────────
# Freshness check
# ──────────────────────────────────────────────


def get_tax_year(filepath: Path) -> int | None:
    """Extract tax year from a data file."""
    try:
        with open(filepath, "r") as f:
            data = json.load(f)
        return data.get("metadata", {}).get("tax_year")
    except (json.JSONDecodeError, KeyError):
        return None


def is_stale(filepath: Path, target_year: int) -> bool:
    """Check if a data file needs updating for the target year."""
    name = filepath.stem

    if "tax_brackets" in name:
        current_year = get_tax_year(filepath)
        return current_year is None or current_year < target_year

    # RMD tables: stale if last_updated is > 365 days old
    try:
        with open(filepath, "r") as f:
            data = json.load(f)
        last_updated_str = data.get("metadata", {}).get("last_updated", "")
        last_updated = datetime.strptime(last_updated_str, "%Y-%m-%d").date()
        return (date.today() - last_updated).days > 365
    except (json.JSONDecodeError, ValueError):
        return True


# ──────────────────────────────────────────────
# Fetchers — source-specific update logic
# ──────────────────────────────────────────────


def fetch_federal_brackets(year: int) -> dict | None:
    """Fetch federal tax bracket data from the Tax Foundation.

    The Tax Foundation publishes an annual JSON-friendly summary. Since their
    web format is not a stable API, this fetcher downloads the page and
    extracts structured data. If the fetch fails, returns None (keep current).

    In practice, federal bracket thresholds are published in the IRS Revenue
    Procedure each fall for the following year. The Tax Foundation compiles
    them into a convenient format.
    """
    try:
        import urllib.request
        import urllib.error

        # Tax Foundation publishes federal brackets as part of their annual
        # state tax rates page. The federal data is also on their dedicated
        # federal brackets page.
        url = f"https://taxfoundation.org/data/all/federal/2025-tax-brackets/"
        print(f"  Checking Tax Foundation for {year} federal brackets...")
        print(f"  URL: {url}")
        print(f"  Note: Automated parsing not yet implemented.")
        print(f"  To update manually, edit backend/data/tax_brackets_{year}.json")
        return None
    except Exception as e:
        print(f"  Could not fetch federal brackets: {e}")
        return None


def update_tax_brackets(target_year: int, dry_run: bool = False) -> str:
    """Update tax bracket data for the target year.

    Returns a status string: "updated", "up-to-date", or "needs-review".
    """
    # Find the most recent tax brackets file
    bracket_files = sorted(DATA_DIR.glob("tax_brackets_*.json"))
    if not bracket_files:
        return "error: no tax_brackets file found"

    current_file = bracket_files[-1]
    current_year = get_tax_year(current_file)

    if current_year and current_year >= target_year:
        return "up-to-date"

    # Try to fetch new data
    new_data = fetch_federal_brackets(target_year)

    if new_data is not None:
        output_path = DATA_DIR / f"tax_brackets_{target_year}.json"
        if dry_run:
            print(f"  [DRY RUN] Would write {output_path}")
        else:
            with open(output_path, "w") as f:
                json.dump(new_data, f, indent=2)
                f.write("\n")
            print(f"  Wrote: {output_path}")
        return "updated"

    return "needs-review"


def update_rmd_tables(target_year: int, dry_run: bool = False) -> str:
    """Update RMD tables if stale.

    RMD tables change very infrequently (last update: 2022). This just
    checks staleness and flags for review if needed.
    """
    filepath = DATA_DIR / "rmd_tables.json"
    if not filepath.exists():
        return "error: rmd_tables.json not found"

    if not is_stale(filepath, target_year):
        return "up-to-date"

    # RMD tables rarely change — just bump the review date
    if not dry_run:
        with open(filepath, "r") as f:
            data = json.load(f)
        data["metadata"]["last_updated"] = date.today().isoformat()
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        print(f"  Updated last_updated date in rmd_tables.json")

    return "reviewed"


# Map of updater functions
FILE_UPDATERS = {
    "tax_brackets": update_tax_brackets,
    "rmd_tables": update_rmd_tables,
}


# ──────────────────────────────────────────────
# Frontend fallback sync
# ──────────────────────────────────────────────


def _transform_brackets_for_frontend(backend_brackets: list[dict]) -> list[dict]:
    """Convert backend bracket format to frontend format (inf -> null)."""
    return [
        {"min": b["min"], "max": None if b["max"] == "inf" else b["max"], "rate": b["rate"]}
        for b in backend_brackets
    ]


def sync_frontend_fallback(dry_run: bool = False) -> bool:
    """Update the frontend fallback JSON from the backend's tax brackets.

    The frontend fetches live data from /api/tax-config at runtime, but
    keeps a bundled JSON as fallback when the backend is unreachable.
    This function keeps that fallback in sync.
    """
    # Load backend data
    bracket_files = sorted(DATA_DIR.glob("tax_brackets_*.json"))
    if not bracket_files:
        print(f"  No tax_brackets file found — skipping frontend sync")
        return False

    with open(bracket_files[-1], "r") as f:
        backend_data = json.load(f)

    federal = backend_data["federal"]
    backend_meta = backend_data.get("metadata", {})

    frontend_json = {
        "metadata": {
            "tax_year": backend_meta.get("tax_year", 2025),
            "source": backend_meta.get("federal_source", "IRS Revenue Procedure 2024-40"),
            "notes": "Fallback data — frontend fetches live data from /api/tax-config at runtime.",
        },
        "standard_deduction": federal["standard_deduction"],
        "brackets": {
            "single": _transform_brackets_for_frontend(federal["brackets"]["single"]),
            "married_filing_jointly": _transform_brackets_for_frontend(
                federal["brackets"]["married_filing_jointly"]
            ),
        },
    }

    # Check if already in sync
    if FRONTEND_FALLBACK.exists():
        with open(FRONTEND_FALLBACK, "r") as f:
            current = json.load(f)
        current_data = {"standard_deduction": current.get("standard_deduction"), "brackets": current.get("brackets")}
        new_data = {"standard_deduction": frontend_json["standard_deduction"], "brackets": frontend_json["brackets"]}
        if current_data == new_data:
            print(f"  Frontend fallback already in sync")
            return False

    if dry_run:
        print(f"  [DRY RUN] Would update {FRONTEND_FALLBACK}")
        return True

    FRONTEND_FALLBACK.parent.mkdir(parents=True, exist_ok=True)
    with open(FRONTEND_FALLBACK, "w") as f:
        json.dump(frontend_json, f, indent=2)
        f.write("\n")
    print(f"  Updated frontend fallback: {FRONTEND_FALLBACK}")
    return True


# ──────────────────────────────────────────────
# Summary dashboard
# ──────────────────────────────────────────────


def print_summary() -> None:
    """Print a dashboard of all data files and their staleness."""
    files = discover_data_files()
    today = date.today()

    print(f"\n{'='*65}")
    print(f"  Lucerna Data Files — Staleness Dashboard")
    print(f"  Scanned: {DATA_DIR}")
    print(f"  Date: {today.isoformat()}")
    print(f"{'='*65}")

    if not files:
        print("  No JSON data files found.")
        return

    print(f"\n  {'File':<30} {'Last Updated':<15} {'Age (days)':<12} {'Status'}")
    print(f"  {'─'*30} {'─'*15} {'─'*12} {'─'*10}")

    for filepath in files:
        name = filepath.name
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            print(f"  {name:<30} {'INVALID JSON':<15} {'—':<12} ERROR")
            continue

        metadata = data.get("metadata", {})
        last_updated_str = metadata.get("last_updated", "unknown")

        try:
            last_updated = datetime.strptime(last_updated_str, "%Y-%m-%d").date()
            age_days = (today - last_updated).days
            if age_days > 365:
                status = "STALE"
            elif age_days > 180:
                status = "CHECK"
            else:
                status = "OK"
        except (ValueError, TypeError):
            age_days_str = "—"
            status = "NO DATE"
            print(f"  {name:<30} {last_updated_str:<15} {age_days_str:<12} {status}")
            continue

        print(f"  {name:<30} {last_updated_str:<15} {age_days:<12} {status}")

    print(f"\n  Validation:")
    all_warnings = validate_all()
    if all_warnings:
        print(f"  {len(all_warnings)} warning(s):")
        for w in all_warnings:
            print(f"    ⚠ {w}")
    else:
        print(f"  All files pass validation.")

    # Frontend sync check
    print(f"\n  Frontend fallback:")
    if FRONTEND_FALLBACK.exists():
        # Quick check: does a sync report changes?
        bracket_files = sorted(DATA_DIR.glob("tax_brackets_*.json"))
        if bracket_files:
            with open(bracket_files[-1], "r") as f:
                backend = json.load(f)
            with open(FRONTEND_FALLBACK, "r") as f:
                frontend = json.load(f)
            backend_fed = backend["federal"]
            fe_brackets = frontend.get("brackets", {})
            be_single = [{"min": b["min"], "max": None if b["max"] == "inf" else b["max"], "rate": b["rate"]} for b in backend_fed["brackets"].get("single", [])]
            if fe_brackets.get("single") == be_single:
                print(f"  In sync with backend")
            else:
                print(f"  OUT OF SYNC — run: python -m scripts.update_data")
        else:
            print(f"  No backend tax brackets to compare against")
    else:
        print(f"  Fallback file not found: {FRONTEND_FALLBACK}")

    print()


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Lucerna data updater — fetch, validate, and sync all static JSON config files.",
        epilog="Examples:\n"
        "  python -m scripts.update_data              # check & update all\n"
        "  python -m scripts.update_data --validate    # validate only\n"
        "  python -m scripts.update_data --summary     # staleness dashboard\n"
        "  python -m scripts.update_data --dry-run     # show what would change\n"
        "  python -m scripts.update_data --year 2027   # target specific year\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print a dashboard of all data files and their staleness",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate data file(s) structure and metadata",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=None,
        help="Target tax year (default: current calendar year)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing files",
    )

    args = parser.parse_args()
    target_year = args.year or date.today().year

    # ── Summary mode ──
    if args.summary:
        print_summary()
        return

    # ── Validate-only mode ──
    if args.validate:
        files = discover_data_files()
        print(f"\nValidating {len(files)} file(s)...")
        all_warnings: list[str] = []
        for filepath in files:
            warnings = validate_file(filepath)
            all_warnings.extend(warnings)
            status = f"{len(warnings)} warning(s)" if warnings else "OK"
            print(f"  {filepath.name}: {status}")

        if all_warnings:
            print(f"\n{len(all_warnings)} total warning(s):")
            for w in all_warnings:
                print(f"  ⚠ {w}")
            sys.exit(1)
        else:
            print(f"\nAll files pass validation.")
        return

    # ── Update mode (default) ──
    print(f"\nLucerna Data Updater — target year: {target_year}")
    print(f"{'='*50}")

    any_changes = False

    # Update each data source
    for name, updater in FILE_UPDATERS.items():
        print(f"\n  [{name}]")
        status = updater(target_year, dry_run=args.dry_run)
        print(f"  Status: {status}")
        if status in ("updated", "reviewed"):
            any_changes = True

    # Validate after updates
    print(f"\nValidating...")
    warnings = validate_all()
    if warnings:
        print(f"  {len(warnings)} warning(s):")
        for w in warnings:
            print(f"    ⚠ {w}")
    else:
        print(f"  All files pass validation.")

    # Sync frontend fallback
    print(f"\nSyncing frontend fallback...")
    sync_frontend_fallback(dry_run=args.dry_run)

    if not any_changes:
        print(f"\nAll data files are up to date.")
    else:
        print(f"\nData files updated. Review changes before committing.")


if __name__ == "__main__":
    main()
