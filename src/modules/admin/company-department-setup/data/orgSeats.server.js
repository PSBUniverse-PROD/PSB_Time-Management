// Seats = rows in psb_m_userposition (who sits in which position).
// Shared by Organization Setup and User Master Setup. This is NOT a
// "use server" file: it is only imported by server action files, so the
// browser can't call it directly.

function idKey(value) {
  return String(value ?? "").trim();
}

// Order inside a rank: empty sorts last, same as the screens.
function orderValue(row) {
  const n = Number(row?.display_order);
  return row?.display_order == null || !Number.isFinite(n) ? Number.MAX_SAFE_INTEGER : n;
}

function rowsOrThrow(result) {
  if (result?.error) throw new Error(result.error.message);
  return result?.data || [];
}

/**
 * For each user: keep their main seat on a usable position (the position,
 * its company and its department, if any, are active). If the main seat is
 * gone or unusable, their highest usable seat (rank order, then order inside
 * the rank) takes over. Then copy that seat's company, department and position
 * name onto psb_s_user (comp_id, dept_id, position). A user with no usable
 * seat gets those three fields cleared.
 * Reads everything for all users in a few queries; only rows that change are written.
 */
export async function refreshUserSeats(supabase, userIds) {
  const ids = [...new Set((userIds || []).map(idKey).filter(Boolean))];
  if (!ids.length) return;

  const [seatsRes, usersRes] = await Promise.all([
    supabase.from("psb_m_userposition").select("user_id, position_id, is_primary").in("user_id", ids).eq("is_active", true),
    supabase.from("psb_s_user").select("user_id, comp_id, dept_id, position").in("user_id", ids),
  ]);
  const seats = rowsOrThrow(seatsRes);
  const userById = new Map(rowsOrThrow(usersRes).map((u) => [idKey(u.user_id), u]));

  const positionIds = [...new Set(seats.map((s) => s.position_id))];
  const positions = positionIds.length
    ? rowsOrThrow(await supabase.from("psb_s_position")
      .select("position_id, comp_id, dept_id, position_name, is_active, chart_level, display_order")
      .in("position_id", positionIds))
    : [];
  const positionById = new Map(positions.map((p) => [idKey(p.position_id), p]));

  const compIds = [...new Set(positions.map((p) => p.comp_id).filter((v) => v != null))];
  const deptIds = [...new Set(positions.map((p) => p.dept_id).filter((v) => v != null))];
  const rankIds = [...new Set(positions.map((p) => p.chart_level).filter((v) => v != null))];
  const empty = { data: [], error: null };
  const [compRes, deptRes, rankRes] = await Promise.all([
    compIds.length ? supabase.from("psb_s_company").select("comp_id, is_active").in("comp_id", compIds) : empty,
    deptIds.length ? supabase.from("psb_s_department").select("dept_id, is_active").in("dept_id", deptIds) : empty,
    rankIds.length ? supabase.from("psb_s_rank").select("rank_id, rank_order").in("rank_id", rankIds) : empty,
  ]);
  const activeCompIds = new Set(rowsOrThrow(compRes).filter((c) => c.is_active !== false).map((c) => idKey(c.comp_id)));
  const activeDeptIds = new Set(rowsOrThrow(deptRes).filter((d) => d.is_active !== false).map((d) => idKey(d.dept_id)));
  const rankOrderOf = new Map(rowsOrThrow(rankRes).map((r) => [idKey(r.rank_id), Number(r.rank_order) || 0]));

  const isOpen = (p) => Boolean(p?.is_active)
    && activeCompIds.has(idKey(p.comp_id))
    && (p.dept_id == null || activeDeptIds.has(idKey(p.dept_id)));
  const rankOf = (p) => rankOrderOf.get(idKey(p?.chart_level)) ?? Number.MAX_SAFE_INTEGER;

  const seatsByUser = new Map();
  seats.forEach((s) => {
    const key = idKey(s.user_id);
    seatsByUser.set(key, [...(seatsByUser.get(key) || []), s]);
  });

  for (const userId of ids) {
    const usable = (seatsByUser.get(userId) || [])
      .filter((s) => isOpen(positionById.get(idKey(s.position_id))))
      .sort((a, b) => {
        const pa = positionById.get(idKey(a.position_id));
        const pb = positionById.get(idKey(b.position_id));
        return rankOf(pa) - rankOf(pb) || orderValue(pa) - orderValue(pb);
      });

    let main = usable.find((s) => s.is_primary) || null;
    if (!main && usable.length) {
      main = usable[0];
      // Only one main seat per user: clear the old one first, then set the new one.
      const { error: clearError } = await supabase.from("psb_m_userposition")
        .update({ is_primary: false }).eq("user_id", userId).eq("is_primary", true);
      if (clearError) throw new Error(clearError.message);
      const { error: setError } = await supabase.from("psb_m_userposition")
        .update({ is_primary: true }).eq("user_id", userId).eq("position_id", main.position_id);
      if (setError) throw new Error(setError.message);
    }

    const mainPosition = main ? positionById.get(idKey(main.position_id)) : null;
    const next = {
      comp_id: mainPosition?.comp_id ?? null,
      dept_id: mainPosition?.dept_id ?? null,
      position: mainPosition?.position_name ?? null,
    };
    const current = userById.get(userId);
    const unchanged = current
      && idKey(current.comp_id) === idKey(next.comp_id)
      && idKey(current.dept_id) === idKey(next.dept_id)
      && String(current.position ?? "") === String(next.position ?? "");
    if (unchanged) continue;

    const { error: userError } = await supabase.from("psb_s_user").update(next).eq("user_id", userId);
    if (userError) throw new Error(userError.message);
  }
}
