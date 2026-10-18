// The one cell-merge implementation: day-set union, then visits = baseline + distinct days (design Decision 3).
// Used by walk ingest (humans) AND by the neighbour generator (bots, generated = true), so both go through the
// SAME merge code and bots can never diverge from the rules the real Range follows.
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';

/** `painted`: [ix, iy, territoryId | null] triples. */
export async function paintCells(
  dbx: Db,
  householdId: string,
  painted: Array<[number, number, string | null]>,
  day: string,
  walkEnd: number,
  generated = false
): Promise<void> {
  if (painted.length === 0) return;
  const cellsJson = JSON.stringify(painted);
  await dbx.execute(sql`
    insert into cell_days (household_id, ix, iy, day)
    select ${householdId}::uuid, (e->>0)::int, (e->>1)::int, ${day}::text
    from jsonb_array_elements(${cellsJson}::jsonb) e
    on conflict do nothing`);
  await dbx.execute(sql`
    insert into cells (household_id, ix, iy, last_refreshed, last_tracked, baseline_visits, visits, territory_id, generated)
    select ${householdId}::uuid, (e->>0)::int, (e->>1)::int, ${walkEnd}::bigint, ${walkEnd}::bigint, 0, 0, e->>2, ${generated}::boolean
    from jsonb_array_elements(${cellsJson}::jsonb) e
    on conflict (household_id, ix, iy) do update set
      last_refreshed = greatest(cells.last_refreshed, excluded.last_refreshed),
      last_tracked = greatest(cells.last_tracked, excluded.last_tracked)`);
  await dbx.execute(sql`
    update cells c set visits = c.baseline_visits + (
      select count(*) from cell_days d where d.household_id = c.household_id and d.ix = c.ix and d.iy = c.iy)
    from jsonb_array_elements(${cellsJson}::jsonb) e
    where c.household_id = ${householdId}::uuid and c.ix = (e->>0)::int and c.iy = (e->>1)::int`);
}
