#!/usr/bin/env python3
"""General-purpose data update and validation tool for Lucerna's static JSON config files.

Discovers all JSON data files in backend/data/, validates their structure and
metadata, scaffolds new versions, and prints a staleness dashboard.

Usage:
    # Summary dashboard of all data files
    python -m scripts.update_data --summary

    # Validate all data files
    python -m scripts.update_data --validate

    # Scaffold all data files for a new tax year
    python -m scripts.update_data --year 2027

    # Scaffold just the RMD tables
    python -m scripts.update_data --file rmd_tables --scaffold

    # Validate a specific file
    python -m scripts.update_data --file tax_brackets_2025 --validate

Sources:
    tax_brackets_2025.json — IRS Revenue Procedure + Tax Foundation (annual)
    rmd_tables.json        — IRS Publication 590-B + SECURE 2.0 (infrequent)
"""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

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
# At least one of these should be present to describe the file's purpose
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

    # Check that last_updated is a valid date
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

    # Check standard deductions exist
    std_ded = federal.get("standard_deduction", {})
    for fs in ("single", "married_filing_jointly"):
        if fs not in std_ded:
            warnings.append(f"[{name}] federal.standard_deduction missing '{fs}'")

    # Check bracket structure
    brackets = federal.get("brackets", {})
    for fs in ("single", "married_filing_jointly"):
        fs_brackets = brackets.get(fs, [])
        if not fs_brackets:
            warnings.append(f"[{name}] federal.brackets.{fs} is empty")
            continue

        # Rates should be ascending
        rates = [b["rate"] for b in fs_brackets]
        if rates != sorted(rates):
            warnings.append(f"[{name}] federal.brackets.{fs}: rates not ascending")

        # Brackets should be contiguous
        for i in range(1, len(fs_brackets)):
            prev_max = fs_brackets[i - 1]["max"]
            curr_min = fs_brackets[i]["min"]
            if prev_max != "inf" and prev_max != curr_min:
                warnings.append(
                    f"[{name}] federal.brackets.{fs}: gap between bracket {i-1} "
                    f"(max={prev_max}) and bracket {i} (min={curr_min})"
                )

        # Last bracket should be unbounded
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

    # ── Uniform Lifetime Table ──
    ult = data.get("uniform_lifetime_table")
    if ult is None:
        warnings.append(f"[{name}] missing 'uniform_lifetime_table' section")
    else:
        entries = ult.get("entries", {})
        if not entries:
            warnings.append(f"[{name}] uniform_lifetime_table.entries is empty")
        else:
            # Entries should be monotonically decreasing
            ages = sorted(int(k) for k in entries.keys())
            values = [entries[str(a)] for a in ages]
            for i in range(1, len(values)):
                if values[i] >= values[i - 1]:
                    warnings.append(
                        f"[{name}] uniform_lifetime_table NOT monotonically decreasing: "
                        f"age {ages[i-1]}={values[i-1]} -> age {ages[i]}={values[i]}"
                    )
                    break

            # min_age in table should match earliest age in entries
            min_age = ult.get("min_age")
            earliest_entry = min(ages)
            if min_age is not None and min_age != earliest_entry:
                warnings.append(
                    f"[{name}] uniform_lifetime_table.min_age ({min_age}) does not "
                    f"match earliest entry age ({earliest_entry})"
                )

    # ── Start age rules ──
    sar = data.get("start_age_rules")
    if sar is None:
        warnings.append(f"[{name}] missing 'start_age_rules' section")
    else:
        rules = sar.get("rules", [])
        if not rules:
            warnings.append(f"[{name}] start_age_rules.rules is empty")
        else:
            # Last rule should be catch-all (born_on_or_before = null)
            last_rule = rules[-1]
            if last_rule.get("born_on_or_before") is not None:
                warnings.append(
                    f"[{name}] start_age_rules: last rule should be catch-all "
                    f"(born_on_or_before: null), got {last_rule.get('born_on_or_before')}"
                )

            # Rules with non-null thresholds should have ascending birth years
            thresholds = [
                r["born_on_or_before"]
                for r in rules
                if r.get("born_on_or_before") is not None
            ]
            if thresholds != sorted(thresholds):
                warnings.append(
                    f"[{name}] start_age_rules: born_on_or_before not ascending"
                )

    # ── Cross-check: min_age vs start age rules ──
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


# Map filename stems to their specific validators
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

    # Metadata validation (applies to all files)
    warnings.extend(validate_metadata(data, filepath))

    # File-specific validation
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
# Scaffold
# ──────────────────────────────────────────────


def scaffold_tax_brackets(data: dict, year: int) -> dict:
    """Scaffold tax brackets for a new year, bumping metadata."""
    scaffolded = json.loads(json.dumps(data))  # deep copy
    metadata = scaffolded.get("metadata", {})
    old_year = metadata.get("tax_year", "?")
    metadata["tax_year"] = year
    metadata["last_updated"] = date.today().isoformat()
    metadata["notes"] = (
        f"Scaffolded from {old_year} data. "
        f"Review and update all bracket thresholds and rates for {year}."
    )
    scaffolded["metadata"] = metadata
    return scaffolded


def scaffold_rmd_tables(data: dict, year: int) -> dict:
    """Scaffold RMD tables — bump date, flag for review."""
    scaffolded = json.loads(json.dumps(data))  # deep copy
    metadata = scaffolded.get("metadata", {})
    metadata["last_updated"] = date.today().isoformat()
    metadata["notes"] = (
        f"{metadata.get('notes', '')} "
        f"[REVIEW {year}] Check for IRS Publication 590-B updates and SECURE Act amendments."
    ).strip()
    scaffolded["metadata"] = metadata
    return scaffolded


FILE_SCAFFOLDERS = {
    "tax_brackets_2025": scaffold_tax_brackets,
    "rmd_tables": scaffold_rmd_tables,
}


def scaffold_file(filepath: Path, year: int, dry_run: bool = False) -> Path | None:
    """Scaffold a single file for a new year/review cycle."""
    name = filepath.stem

    with open(filepath, "r") as f:
        data = json.load(f)

    scaffolder = FILE_SCAFFOLDERS.get(name)
    if scaffolder is None:
        print(f"  [{name}] No scaffolder registered — skipping")
        return None

    scaffolded = scaffolder(data, year)

    # For tax brackets, the output filename includes the year
    if "tax_brackets" in name:
        output_path = DATA_DIR / f"tax_brackets_{year}.json"
    else:
        output_path = filepath

    if dry_run:
        print(f"  [{name}] DRY RUN — would write to {output_path}")
        return output_path

    with open(output_path, "w") as f:
        json.dump(scaffolded, f, indent=2)
        f.write("\n")

    print(f"  [{name}] Wrote: {output_path}")
    return output_path


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

    # Validation summary
    print(f"\n  Validation:")
    all_warnings = validate_all()
    if all_warnings:
        print(f"  {len(all_warnings)} warning(s):")
        for w in all_warnings:
            print(f"    ⚠ {w}")
    else:
        print(f"  All files pass validation.")

    print()


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────


def resolve_file(name: str) -> Path | None:
    """Resolve a --file argument to a Path."""
    # Try exact match first
    candidate = DATA_DIR / f"{name}.json"
    if candidate.exists():
        return candidate
    # Try with .json appended
    candidate = DATA_DIR / name
    if candidate.exists():
        return candidate
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Lucerna data file manager — validate, scaffold, and audit static JSON config files.",
        epilog="Examples:\n"
        "  python -m scripts.update_data --summary\n"
        "  python -m scripts.update_data --validate\n"
        "  python -m scripts.update_data --year 2027\n"
        "  python -m scripts.update_data --file rmd_tables --scaffold\n"
        "  python -m scripts.update_data --file rmd_tables --validate\n",
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
        "--scaffold",
        action="store_true",
        help="Scaffold data file(s) for a new year/review cycle",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=None,
        help="Target tax year for scaffolding (e.g., 2027). Implies --scaffold for all files.",
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Target a specific file by stem name (e.g., 'rmd_tables', 'tax_brackets_2025')",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing files",
    )

    args = parser.parse_args()

    # Default to --summary if no action specified
    if not any([args.summary, args.validate, args.scaffold, args.year]):
        args.summary = True

    # ── Summary mode ──
    if args.summary:
        print_summary()
        return

    # ── Resolve target files ──
    if args.file:
        filepath = resolve_file(args.file)
        if filepath is None:
            print(f"ERROR: File not found: {args.file}")
            print(f"Available files: {', '.join(f.stem for f in discover_data_files())}")
            sys.exit(1)
        target_files = [filepath]
    else:
        target_files = discover_data_files()

    # ── Validate mode ──
    if args.validate:
        print(f"\nValidating {len(target_files)} file(s)...")
        all_warnings: list[str] = []
        for filepath in target_files:
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

    # ── Scaffold mode ──
    if args.scaffold or args.year:
        year = args.year or date.today().year + 1
        print(f"\nScaffolding {len(target_files)} file(s) for year {year}...")
        for filepath in target_files:
            scaffold_file(filepath, year, dry_run=args.dry_run)

        if not args.dry_run:
            print(f"\nNext steps:")
            print(f"  1. Review scaffolded files for accuracy")
            print(f"  2. Update bracket thresholds / table entries as needed")
            print(f"  3. Run: python -m scripts.update_data --validate")
            print(f"  4. Run: python -m pytest tests/ -v")
        return


if __name__ == "__main__":
    main()
