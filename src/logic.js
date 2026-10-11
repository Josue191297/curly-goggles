// Moves `id` into the slot currently held by `overId`.
export const move = (ids, id, overId) => {
  const out = ids.filter(x => x !== id)
  out.splice(out.indexOf(overId) + (ids.indexOf(id) < ids.indexOf(overId) ? 1 : 0), 0, id)
  return out
}

// Writes a reordered subset back into the full order, keeping hidden (filtered-out) items in place.
export const applySubset = (full, subset) => {
  const set = new Set(subset)
  let k = 0
  return full.map(id => set.has(id) ? subset[k++] : id)
}

// Sort key that lands between two neighbours (either may be missing at the ends).
// shortcut: repeated drops into the same gap halve it each time (~50 drops before floats collide), renumber the list if that ever matters.
export const between = (a, b) =>
  a == null && b == null ? Date.now() : a == null ? b - 1 : b == null ? a + 1 : (a + b) / 2

const pad = n => String(n).padStart(2, '0')
export const isoDay = (offset = 0, now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const fmt = due => new Date(due + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export const dueInfo = (due, done, now = new Date()) => {
  if (!due) return { label: 'Due date', cls: 'unset' }
  if (done) return { label: fmt(due), cls: '' }
  if (due < isoDay(0, now)) return { label: `Overdue · ${fmt(due)}`, cls: 'overdue' }
  if (due === isoDay(0, now)) return { label: 'Today', cls: 'today' }
  if (due === isoDay(1, now)) return { label: 'Tomorrow', cls: 'soon' }
  return { label: fmt(due), cls: '' }
}
