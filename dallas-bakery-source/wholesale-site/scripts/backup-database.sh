#!/usr/bin/env bash
#
# Takes a full copy of the live wholesale database and checks that the copy is
# actually usable.
#
# Why the check matters: an export that runs every night and is never restored
# is not a backup, it is a file. This script exports, then restores into a
# throwaway local database and counts the rows, and fails loudly if the
# numbers do not match. A green run means you have a backup you could actually
# put back.
#
#   ./scripts/backup-database.sh                 # backup + verify
#   ./scripts/backup-database.sh --no-verify     # export only (faster)
#   ./scripts/backup-database.sh --local         # rehearse against the local
#                                                # database, touching nothing live
#
# Backups land in ./backups/dallas-bakery-YYYY-MM-DD-HHMM.sql and are plain
# text: readable, greppable, and restorable with nothing but wrangler.
#
# Keep them somewhere that is not this machine. A backup that lives only on
# the laptop it was taken from is one spilled coffee from being no backup.

set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="wrangler.deploy.jsonc"
STAMP="$(date +%Y-%m-%d-%H%M)"
OUT_DIR="backups"
OUT="${OUT_DIR}/dallas-bakery-${STAMP}.sql"
VERIFY=1
# Which database to read. --local exists so the whole run can be rehearsed
# before it is ever pointed at the real one.
SOURCE="--remote"
WHICH="live"

for arg in "$@"; do
  case "$arg" in
    --no-verify) VERIFY=0 ;;
    --local) SOURCE="--local"; WHICH="local" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT_DIR"

echo "==> Exporting the ${WHICH} database"
npx wrangler d1 export DB "$SOURCE" --config "$CONFIG" --output "$OUT"

if [ ! -s "$OUT" ]; then
  echo "FAILED: the export is empty. Nothing was backed up." >&2
  exit 1
fi

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
echo "==> Wrote $OUT (${SIZE} bytes)"

# The tables whose loss would actually end the business, in the order someone
# would check them: who your customers are, what they bought, what they owe.
TABLES="wholesale_applications orders order_events support_cases products customer_prices"

# Asks the database itself, rather than counting INSERT lines in the dump:
# the dump's exact formatting is wrangler's business and could change, but
# COUNT(*) means the same thing forever.
count_rows() {
  npx wrangler d1 execute DB "$1" \
    --config "$CONFIG" \
    ${2:+--persist-to "$2"} \
    --command "SELECT COUNT(*) AS n FROM ${3};" \
    --json 2>/dev/null | grep -o '"n": *[0-9]*' | head -1 | grep -o '[0-9]*' || echo "?"
}

echo "==> What the ${WHICH} database holds"
for table in $TABLES; do
  printf '    %-24s %s rows\n' "$table" "$(count_rows "$SOURCE" "" "$table")"
done

if [ "$VERIFY" -eq 0 ]; then
  echo "==> Skipped the restore check (--no-verify). This is an export, not a tested backup."
  exit 0
fi

echo "==> Restore check: putting the backup into a throwaway local database"
DRILL_DIR=".wrangler/restore-drill"
rm -rf "$DRILL_DIR"
mkdir -p "$DRILL_DIR"

# --local with a persist path of its own, so the drill can never touch the
# development database, let alone the live one.
npx wrangler d1 execute DB \
  --local \
  --config "$CONFIG" \
  --persist-to "$DRILL_DIR" \
  --file "$OUT" \
  --yes > /dev/null

FAILED=0
for table in $TABLES; do
  expected="$(count_rows "$SOURCE" "" "$table")"
  actual="$(count_rows --local "$DRILL_DIR" "$table")"
  if [ "$expected" != "$actual" ]; then
    printf '    MISMATCH %-20s database has %s, restore has %s\n' "$table" "$expected" "$actual"
    FAILED=1
  else
    printf '    ok       %-20s %s rows restored\n' "$table" "$actual"
  fi
done

rm -rf "$DRILL_DIR"

if [ "$FAILED" -ne 0 ]; then
  echo "FAILED: the backup did not restore cleanly. Do not rely on it." >&2
  exit 1
fi

echo "==> Backup verified. $OUT can be restored."
echo
echo "To actually restore it onto the live database — which REPLACES what is"
echo "there now, so read twice:"
echo
echo "    npx wrangler d1 execute DB --remote --config $CONFIG --file $OUT"
