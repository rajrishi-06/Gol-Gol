#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and run the pooling suite.
#
# The pooling logic is plain trigonometry and plpgsql — no PostGIS — precisely
# so it can be exercised on a stock Postgres before it ever reaches Supabase.
#
#   sudo ./supabase/tests/run.sh
#
# Each test file runs against its own database, cloned from a template built
# once. They are not written to tolerate each other's leftovers, and they should
# not have to be: sharing one database made 03's counts depend on how many rides
# 02 happened to leave behind. Cloning rather than re-migrating keeps five full
# schemas from sitting on disk at the same time, which took the server down.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"
TMPL="${GOLGOL_TEST_DB:-golgol_tmpl}"
RUN="${TMPL}_run"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"; su postgres -c "psql -q -c \"drop database if exists $RUN\"" >/dev/null 2>&1' EXIT

cp "$MIG"/*.sql "$HERE"/*.sql "$STAGE"/
chmod -R a+rX "$STAGE"

TESTS=(01_geometry.sql 02_pooling_flow.sql 03_seat_holds.sql 04_roles_and_chaining.sql 05_scoring_batch_gaps.sql 06_women_only.sql 07_rls.sql 08_carpool_trips.sql)

sql() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $1 -f $STAGE/$2" 2>&1 \
        | grep -v '^psql.*NOTICE:  \(relation\|constraint\|trigger\|column\|extension\|table\|database\)'; }
admin() { su postgres -c "psql -q -c \"$1\"" 2>&1; }

# ── build the template once ─────────────────────────────────────────────────
echo "── migrations"
admin "drop database if exists $RUN" >/dev/null
admin "drop database if exists $TMPL" >/dev/null
admin "create database $TMPL" >/dev/null
for f in 00_shim.sql $(cd "$MIG" && ls -1 [0-9]*.sql | sort); do
  out=$(sql "$TMPL" "$f")
  if echo "$out" | grep -qiE '^(psql: )?error|ERROR:'; then
    echo "✗ $f"; echo "$out" | grep -iB1 -A3 error | head -20; exit 1
  fi
  echo "✓ $f"
done

# ── run each test against a fresh clone ─────────────────────────────────────
fail=0
for t in "${TESTS[@]}"; do
  admin "drop database if exists $RUN" >/dev/null
  clone=$(admin "create database $RUN template $TMPL")
  if echo "$clone" | grep -qiE 'error'; then
    echo "✗ could not clone $TMPL for $t"; echo "$clone"; exit 1
  fi

  echo
  echo "── $t"
  out=$(sql "$RUN" "$t")
  echo "$out" | grep -E 'PASS|FAIL|ERROR|══|^ +[0-9]+ \|' || echo "$out"

  # A suite that greens because nothing ran is worse than no suite: an earlier
  # version of this script reported success while the server was down and every
  # file had failed to connect.
  ran=$(echo "$out" | grep -c 'PASS\|FAIL')
  if [ "$ran" -eq 0 ]; then
    echo "✗ $t produced no assertions at all"
    echo "$out" | head -6
    fail=$(( fail + 1 ))
    continue
  fi
  fail=$(( fail + $(echo "$out" | grep -c 'FAIL') ))
  if echo "$out" | grep -qiE '^(psql: )?error|ERROR:'; then
    echo "✗ $t reported an error"
    fail=$(( fail + 1 ))
  fi
done

echo
if [ "$fail" -gt 0 ]; then echo "$fail failure(s)"; exit 1; fi
echo "all assertions passed"
