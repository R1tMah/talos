-- Weekly averages, on the imported history (#25-#28, #30, #31, #157).

-- #25, #26 Spot checks from the spec against the imported data.
select pg_temp.ok('#25 week of 3/23 averages 196.2 with n = 5',
  exists (select 1 from public.weekly_weights where week_start = '2026-03-23' and avg_lb = 196.2 and n = 5),
  (select format('avg %s n %s', avg_lb, n) from public.weekly_weights where week_start = '2026-03-23'));
select pg_temp.ok('#26 week of 3/30 averages 194.5 with n = 4',
  exists (select 1 from public.weekly_weights where week_start = '2026-03-30' and avg_lb = 194.5 and n = 4),
  (select format('avg %s n %s', avg_lb, n) from public.weekly_weights where week_start = '2026-03-30'));

-- #27 Weeks run Monday to Sunday.
select pg_temp.ok('#27 every week starts on a Monday',
  not exists (select 1 from public.weekly_weights where extract(isodow from week_start) <> 1));
select pg_temp.ok('#27 ...and Sunday 3/29 belongs to the week of 3/23',
  (select date_trunc('week', '2026-03-29'::date)::date) = '2026-03-23'
  and exists (select 1 from public.weights where logical_date = '2026-03-29' and deleted_at is null));

-- #28 A week with no entries doesn't appear (not plotted as zero).
select pg_temp.ok('#28 the empty week of 8/17 has no row',
  not exists (select 1 from public.weekly_weights where week_start = '2026-08-17'));
select pg_temp.ok('#28 ...and no week has n = 0', not exists (select 1 from public.weekly_weights where n = 0));

-- #30 Deleted rows are excluded; #31 averages are computed on read.
select public.save_weight('2099-02-02', 150.0);
select public.save_weight('2099-02-03', 160.0);
select pg_temp.ok('#31 a new week appears with its average immediately',
  exists (select 1 from public.weekly_weights where week_start = '2099-02-02' and avg_lb = 155.0 and n = 2));
select public.update_weight((select id from public.weights where logical_date = '2099-02-03' and deleted_at is null), '2099-02-03', 170.0, null);
select pg_temp.ok('#31 editing a weight changes the average immediately',
  exists (select 1 from public.weekly_weights where week_start = '2099-02-02' and avg_lb = 160.0),
  (select format('avg %s', avg_lb) from public.weekly_weights where week_start = '2099-02-02'));
select public.delete_weight((select id from public.weights where logical_date = '2099-02-03' and deleted_at is null));
select pg_temp.ok('#30 a deleted weight is excluded from the average',
  exists (select 1 from public.weekly_weights where week_start = '2099-02-02' and avg_lb = 150.0 and n = 1));

-- #157 Imported gaps stay missing days.
select pg_temp.ok('#157 no weights during the 7/16-7/18 trip',
  not exists (select 1 from public.weights where logical_date between '2026-07-16' and '2026-07-18' and deleted_at is null));
select pg_temp.ok('#157 no weights during the 8/17-8/24 stretch',
  not exists (select 1 from public.weights where logical_date between '2026-08-17' and '2026-08-24' and deleted_at is null));
select pg_temp.ok('#157 no weights during the 10/2-10/5 trip',
  not exists (select 1 from public.weights where logical_date between '2026-10-02' and '2026-10-05' and deleted_at is null));
