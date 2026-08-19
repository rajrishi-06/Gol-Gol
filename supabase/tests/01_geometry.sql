\set ON_ERROR_STOP on
\pset pager off
-- A west→east corridor along latitude 12.97 in Bengaluru. 0.01° lng ≈ 1.084 km.
\echo '--- path_locate: a point ON the line ---'
select round(along_km::numeric,3) along, round(offset_km::numeric,3) off, round(total_km::numeric,3) total
  from path_locate(array[12.97,12.97], array[77.50,77.60], 12.97, 77.55);

\echo '--- path_locate: a point 1.1 km NORTH of the midpoint (offset should be ~1.1) ---'
select round(along_km::numeric,3) along, round(offset_km::numeric,3) off
  from path_locate(array[12.97,12.97], array[77.50,77.60], 12.98, 77.55);

\echo '--- stop_progress: past the end orders further than the end itself ---'
select round(stop_progress(array[12.97,12.97], array[77.50,77.60], 12.97, 77.60)::numeric,3) at_end,
       round(stop_progress(array[12.97,12.97], array[77.50,77.60], 12.97, 77.62)::numeric,3) past_end,
       round(stop_progress(array[12.97,12.97], array[77.50,77.60], 12.97, 77.55)::numeric,3) middle;

\echo '--- path_added_km: a pickup+drop both ON the corridor costs ~nothing ---'
select round(path_added_km(array[12.97,12.97], array[77.50,77.60],
                           12.97, 77.52, 12.97, 77.58)::numeric, 3) as on_route_detour;

\echo '--- path_added_km: a drop 3 km past the end costs ~3 km ---'
select round(path_added_km(array[12.97,12.97], array[77.50,77.60],
                           12.97, 77.55, 12.97, 77.6277)::numeric, 3) as past_end_detour;

\echo '--- path_added_km: a pickup 2 km off-corridor costs a real detour ---'
select round(path_added_km(array[12.97,12.97], array[77.50,77.60],
                           12.988, 77.55, 12.97, 77.58)::numeric, 3) as off_route_detour;
