#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and run the pooling suite.
#
# The pooling logic is plain trigonometry and plpgsql — no PostGIS — precisely
# so it can be exercised on a stock Postgres before it ever reaches Supabase.
#
#   sudo ./supabase/tests/run.sh
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"
DB="${GOLGOL_TEST_DB:-golgol_test}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp "$MIG"/*.sql "$HERE"/*.sql "$STAGE"/
chmod -R a+rX "$STAGE"

run() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f $STAGE/$1" 2>&1 | grep -v '^psql.*NOTICE:  \(relation\|constraint\|trigger\|column\|extension\|table\)'; }

su postgres -c "psql -q -c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null 2>&1

fail=0
for f in 00_shim.sql $(cd "$MIG" && ls -1 [0-9]*.sql | sort); do
  out=$(run "$f")
  if echo "$out" | grep -q ERROR; then
    echo "✗ $f"; echo "$out" | grep -B1 -A3 ERROR; exit 1
  fi
  echo "✓ $f"
done

echo
for t in 01_geometry.sql 02_pooling_flow.sql; do
  echo "── $t"
  out=$(run "$t")
  echo "$out" | grep -E 'PASS|FAIL|ERROR|══|^ +[0-9]+ \|' || echo "$out"
  fail=$(( fail + $(echo "$out" | grep -c 'FAIL\|ERROR') ))
done

echo
if [ "$fail" -gt 0 ]; then echo "$fail failure(s)"; exit 1; fi
echo "all assertions passed"
