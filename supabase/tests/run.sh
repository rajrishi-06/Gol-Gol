#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and run the pooling suite.
#
# The pooling logic is plain trigonometry and plpgsql — no PostGIS — precisely
# so it can be exercised on a stock Postgres before it ever reaches Supabase.
#
#   sudo ./supabase/tests/run.sh
#
# Each test file gets its own freshly migrated database. They are not written to
# tolerate each other's leftovers, and they should not have to be: sharing one
# database made 03's counts depend on how many rides 02 happened to leave behind.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp "$MIG"/*.sql "$HERE"/*.sql "$STAGE"/
chmod -R a+rX "$STAGE"

TESTS=(01_geometry.sql 02_pooling_flow.sql 03_seat_holds.sql)
MIGRATIONS=(00_shim.sql $(cd "$MIG" && ls -1 [0-9]*.sql | sort))

psql_run() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $1 -f $STAGE/$2" 2>&1 | grep -v '^psql.*NOTICE:  \(relation\|constraint\|trigger\|column\|extension\|table\|database\)'; }

migrate() {
  su postgres -c "psql -q -c 'drop database if exists $1' -c 'create database $1'" >/dev/null 2>&1
  for f in "${MIGRATIONS[@]}"; do
    out=$(psql_run "$1" "$f")
    if echo "$out" | grep -q ERROR; then
      echo "✗ $f"; echo "$out" | grep -B1 -A3 ERROR; return 1
    fi
    [ "$1" = "golgol_t0" ] && echo "✓ $f"
  done
  return 0
}

echo "── migrations"
migrate golgol_t0 || exit 1

fail=0
for t in "${TESTS[@]}"; do
  db="golgol_$(basename "$t" .sql)"
  migrate "$db" >/dev/null || { echo "✗ could not prepare $db"; exit 1; }
  echo
  echo "── $t"
  out=$(psql_run "$db" "$t")
  echo "$out" | grep -E 'PASS|FAIL|ERROR|══|^ +[0-9]+ \|' || echo "$out"
  fail=$(( fail + $(echo "$out" | grep -c 'FAIL\|ERROR') ))
done

echo
if [ "$fail" -gt 0 ]; then echo "$fail failure(s)"; exit 1; fi
echo "all assertions passed"
