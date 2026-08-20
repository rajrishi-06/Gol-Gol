\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

create or replace function chk(label text, got anyelement, want anyelement) returns void
language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS  % (%)', label, got;
  else raise notice 'FAIL  % — got %, wanted %', label, got, want; end if;
end $$;

create or replace function near(a double precision, b double precision, tol double precision default 0.05)
returns boolean language sql immutable as $$ select abs(a - b) <= tol $$;

\set QUIET off
\echo ''
\echo '══════ the geometry the corridor test rests on ══════'
-- A west→east corridor along latitude 12.97. 0.01° of longitude ≈ 1.084 km.

select chk('a point on the line has zero offset',
           near((select offset_km from path_locate(array[12.97,12.97], array[77.50,77.60], 12.97, 77.55)), 0.0),
           true);

select chk('and sits halfway along it',
           near((select along_km from path_locate(array[12.97,12.97], array[77.50,77.60], 12.97, 77.55)), 5.418),
           true);

select chk('a point 1.1 km north measures as 1.1 km off',
           near((select offset_km from path_locate(array[12.97,12.97], array[77.50,77.60], 12.98, 77.55)), 1.112),
           true);

-- path_locate clamps to the path, so everything past the end ties at total_km;
-- stop_progress adds the overshoot, which is what orders a second rider's drop
-- after the first's.
select chk('progress past the end exceeds progress at the end',
           (select stop_progress(array[12.97,12.97], array[77.50,77.60], 12.97, 77.62)
                 > stop_progress(array[12.97,12.97], array[77.50,77.60], 12.97, 77.60)),
           true);

select chk('a pickup and drop both on the corridor cost nothing',
           near(path_added_km(array[12.97,12.97], array[77.50,77.60], 12.97, 77.52, 12.97, 77.58), 0.0),
           true);

select chk('a drop 3 km past the end costs about 3 km',
           near(path_added_km(array[12.97,12.97], array[77.50,77.60], 12.97, 77.55, 12.97, 77.6277), 3.0, 0.1),
           true);

-- Diverting 2 km north mid-route is two diagonals, not a there-and-back spur,
-- so it costs well under the 4 km a naive reading would predict.
select chk('a 2 km off-corridor pickup costs 0.92 km of diagonal',
           near(path_added_km(array[12.97,12.97], array[77.50,77.60], 12.988, 77.55, 12.97, 77.58), 0.92, 0.05),
           true);

select chk('a degenerate path yields nothing rather than an error',
           (select along_km from path_locate(array[12.97], array[77.50], 12.97, 77.55)),
           null::double precision);
