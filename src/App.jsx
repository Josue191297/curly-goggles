import { useEffect, useId, useRef, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore'
import { auth, db, provider, PEOPLE } from './firebase.js'
import { move, applySubset, between, dueInfo, isoDay } from './logic.js'

const LOCAL_KEY = 'tasks-project-v1' // pre-Firebase data, offered for one-time import
const readLocal = () => {
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL_KEY))
    return d?.todos?.length || d?.projects?.length ? d : null
  } catch { return null }
}
const EMAILS = Object.keys(PEOPLE)
const PRIORITIES = ['No priority', 'Low', 'Medium', 'High']
const SORTS = {
  manual: null,
  due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
  priority: (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
}

const ICONS = {
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  calendar: 'M8 3v4M16 3v4M4 10h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  flag: 'M5 21V4M5 4h12l-2.5 4.5L17 13H5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  check: 'M4 12l5 5L20 6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
}
const Icon = ({ name, size = 16 }) => (
  <svg className={`ic ic-${name}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
)

function PriorityChip({ value = 0, onChange }) {
  return (
    <label className={`chip prio p${value} ${value ? '' : 'unset'}`}>
      <Icon name="flag" size={13} />
      <select value={value} onChange={e => onChange(+e.target.value)} aria-label="Priority">
        {PRIORITIES.map((p, i) => <option key={i} value={i}>{p}</option>)}
      </select>
    </label>
  )
}

const Avatar = ({ email }) => <span className={`avatar a${EMAILS.indexOf(email)}`}>{PEOPLE[email]?.[0]}</span>

function AssigneeChip({ value = '', onChange }) {
  return (
    <label className={`chip person ${value ? '' : 'unset'}`}>
      {value ? <Avatar email={value} /> : <Icon name="user" size={13} />}
      <select value={value} onChange={e => onChange(e.target.value)} aria-label="Assigned to">
        <option value="">Unassigned</option>
        {EMAILS.map(e => <option key={e} value={e}>{PEOPLE[e]}</option>)}
      </select>
    </label>
  )
}

function DueChip({ due, done, onChange }) {
  const ref = useRef()
  const { label, cls } = dueInfo(due, done)
  return (
    <span className={`chip due ${cls}`}>
      <button type="button" aria-label={due ? `Due ${label}, change date` : 'Set due date'}
        onClick={() => { try { ref.current.showPicker() } catch { ref.current.focus() } }}>
        <Icon name="calendar" size={13} /> {label}
      </button>
      {due && <button type="button" className="clear" aria-label="Clear due date" onClick={() => onChange('')}><Icon name="x" size={11} /></button>}
      <input ref={ref} type="date" className="picker" tabIndex={-1} aria-hidden="true"
        value={due || ''} onChange={e => onChange(e.target.value)} />
    </span>
  )
}

function AddForm({ placeholder, onAdd, withMeta }) {
  const [text, setText] = useState('')
  const blank = { priority: 0, due: '', assignee: '' }
  const [meta, setMeta] = useState(blank)
  return (
    <form className="add" onSubmit={e => {
      e.preventDefault()
      if (!text.trim()) return
      onAdd(text.trim(), meta)
      setText('')
      setMeta(blank)
    }}>
      <Icon name="plus" />
      <input value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {withMeta && <>
        <PriorityChip value={meta.priority} onChange={priority => setMeta(m => ({ ...m, priority }))} />
        <DueChip due={meta.due} onChange={due => setMeta(m => ({ ...m, due }))} />
        <AssigneeChip value={meta.assignee} onChange={assignee => setMeta(m => ({ ...m, assignee }))} />
      </>}
      <button className="primary">Add</button>
    </form>
  )
}

function EditForm({ item, onSave, onCancel }) {
  const [text, setText] = useState(item.text)
  const [desc, setDesc] = useState(item.desc ?? '')
  const save = () => text.trim() && onSave({ text: text.trim(), desc: desc.trim() })
  return (
    <form className="edit" onSubmit={e => { e.preventDefault(); save() }}
      onKeyDown={e => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() }
      }}>
      <input autoFocus value={text} onChange={e => setText(e.target.value)} aria-label="Title" placeholder="Title" />
      <textarea value={desc} onChange={e => setDesc(e.target.value)} aria-label="Description" placeholder="Add a description…" rows={3} />
      <div className="edit-actions">
        <span className="muted">Ctrl+Enter to save · Esc to cancel</span>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!text.trim()}>Save</button>
      </div>
    </form>
  )
}

function Item({ item, tag, onEdit, onDelete, drag = {}, children }) {
  const cid = useId()
  const [editing, setEditing] = useState(false)
  const { onMoveKey, className = '', ...dragProps } = drag
  const { text, desc, done, due, priority = 0 } = item
  if (editing) return (
    <li className={`item p${priority} editing`}>
      <EditForm item={item} onCancel={() => setEditing(false)} onSave={patch => { onEdit(patch); setEditing(false) }} />
    </li>
  )
  return (
    <li className={`item p${priority} ${done ? 'done' : ''} ${className}`} {...dragProps}>
      {onMoveKey && (
        <button className="grip" data-grip={item.id} aria-label={`Reorder "${text}" with arrow keys`}
          onKeyDown={e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            e.preventDefault()
            onMoveKey(e.key === 'ArrowUp' ? -1 : 1)
          }}><Icon name="grip" /></button>
      )}
      <input id={cid} type="checkbox" checked={done} onChange={() => onEdit({ done: !done })} />
      <div className="body">
        <label htmlFor={cid} className="text">{text}</label>
        {desc && <p className="desc">{desc}</p>}
        <div className="meta">
          {tag && <span className="tag"><Icon name="folder" size={12} /> {tag}</span>}
          <PriorityChip value={priority} onChange={p => onEdit({ priority: p })} />
          <DueChip due={due} done={done} onChange={d => onEdit({ due: d })} />
          <AssigneeChip value={item.assignee} onChange={a => onEdit({ assignee: a })} />
          {children}
        </div>
      </div>
      <div className="actions">
        <button className="icon" onClick={() => setEditing(true)} aria-label={`Edit "${text}"`}><Icon name="pencil" /></button>
        <button className="icon danger" onClick={onDelete} aria-label={`Remove "${text}"`}><Icon name="x" /></button>
      </div>
    </li>
  )
}

function useCollection(name, onError) {
  const [docs, setDocs] = useState(null)
  useEffect(() => onSnapshot(collection(db, name),
    snap => setDocs(snap.docs.map(d => ({ id: d.id, col: name, ...d.data() }))),
    onError,
  ), [name]) // eslint-disable-line react-hooks/exhaustive-deps
  return docs
}

function SignIn({ user }) {
  const [error, setError] = useState('')
  return (
    <div className="signin">
      <span className="logo big"><Icon name="check" size={28} /></span>
      <h1>Tasks &amp; Projects</h1>
      {user ? <>
        <p className="error">{user.email} doesn&apos;t have access.</p>
        <button className="ghost" onClick={() => signOut(auth)}>Use another account</button>
      </> : <>
        <p className="muted">Sign in to see your shared tasks.</p>
        <button className="primary" onClick={() => signInWithPopup(auth, provider).catch(e => {
          if (e.code !== 'auth/popup-closed-by-user') setError(e.message)
        })}>Sign in with Google</button>
        {error && <p className="error">{error}</p>}
      </>}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  if (user === undefined) return <p className="loading">Loading…</p>
  if (!user || !PEOPLE[user.email] || !user.emailVerified) return <SignIn user={user} />
  return <Board user={user} />
}

function Board({ user }) {
  const [view, setView] = useState(() => location.hash === '#projects' ? 'projects' : 'todos')
  const [status, setStatus] = useState('all')
  const [who, setWho] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('manual')
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [error, setError] = useState('')
  const [local, setLocal] = useState(readLocal)

  const fail = e => setError(e.message)
  const todosRaw = useCollection('todos', fail)
  const projectsRaw = useCollection('projects', fail)
  const stepsRaw = useCollection('steps', fail)
  useEffect(() => { location.hash = view }, [view])

  const me = user.email
  const other = EMAILS.find(e => e !== me)
  const byField = f => (a, b) => (a[f] ?? 0) - (b[f] ?? 0)
  const projects = [...(projectsRaw ?? [])].sort(byField('order'))
  const steps = (stepsRaw ?? []).map(s => ({ ...s, project: projects.find(p => p.id === s.projectId) })).sort(byField('order'))

  // Each edit writes one document, so the two of you never overwrite each other's changes.
  const patch = (item, data) => updateDoc(doc(db, item.col, item.id), data).catch(fail)
  const add = (col, data) => addDoc(collection(db, col), { ...data, createdBy: me }).catch(fail)
  const remove = item => deleteDoc(doc(db, item.col, item.id)).catch(fail)
  const commit = (fill, then) => { const b = writeBatch(db); fill(b); b.commit().then(then, fail) }
  const removeTodo = t => t.col === 'steps' ? patch(t, { todo: false }) : remove(t) // a step only gets unlinked

  // Reorders by giving the moved item a sort key between its new neighbours in the full list.
  const reorder = (full, visible, field) => (id, overId) => {
    const ids = applySubset(full.map(x => x.id), move(visible.map(x => x.id), id, overId))
    const i = ids.indexOf(id)
    const key = k => full.find(x => x.id === ids[k])?.[field]
    patch(full.find(x => x.id === id), { [field]: between(key(i - 1), key(i + 1)) })
  }

  // Builds drag-and-drop + keyboard reorder props for one list of ids.
  const dnd = (ids, onMove) => itemId => ({
    draggable: true,
    onDragStart: e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', itemId); setDragId(itemId) },
    onDragEnd: () => { setDragId(null); setOverId(null) },
    onDragOver: e => { if (ids.includes(dragId) && dragId !== itemId) { e.preventDefault(); setOverId(itemId) } },
    onDrop: e => {
      e.preventDefault()
      if (ids.includes(dragId) && dragId !== itemId) onMove(dragId, itemId)
      setDragId(null); setOverId(null)
    },
    onMoveKey: dir => {
      const target = ids[ids.indexOf(itemId) + dir]
      if (!target) return
      onMove(itemId, target)
      requestAnimationFrame(() => document.querySelector(`[data-grip="${itemId}"]`)?.focus())
    },
    className: dragId === itemId ? 'dragging' : overId === itemId ? 'drop-target' : '',
  })

  // Reuses the local ids, so importing twice overwrites instead of duplicating.
  // shortcut: one batch caps at 500 writes, split it if a local list is ever that big.
  const importLocal = () => commit(b => {
    const rank = new Map((local.order ?? []).map((x, i) => [x, i]))
    const base = t => ({ text: t.text, desc: t.desc ?? '', done: !!t.done, due: t.due ?? '', priority: t.priority ?? 0, assignee: '', createdBy: me })
    local.todos.forEach(t => b.set(doc(db, 'todos', t.id), { ...base(t), listOrder: rank.get(t.id) ?? 1e6 }))
    local.projects.forEach((p, pi) => {
      b.set(doc(db, 'projects', p.id), { name: p.name, order: pi, createdBy: me })
      p.steps.forEach((s, si) => b.set(doc(db, 'steps', s.id),
        { ...base(s), projectId: p.id, todo: !!s.todo, order: si, listOrder: rank.get(s.id) ?? 1e6 + si }))
    })
  }, () => { localStorage.removeItem(LOCAL_KEY); setLocal(null) }) // cleared only once Firestore accepted it

  const allTodos = [...(todosRaw ?? []), ...steps.filter(s => s.todo && s.project)].sort(byField('listOrder'))
  const openCount = allTodos.filter(t => !t.done).length
  const doneCount = allTodos.length - openCount
  const today = isoDay()
  const overdueCount = allTodos.filter(t => !t.done && t.due && t.due < today).length
  const todayCount = allTodos.filter(t => !t.done && t.due === today).length
  const mineCount = allTodos.filter(t => !t.done && t.assignee === me).length

  const q = query.trim().toLowerCase()
  const shown = allTodos
    .filter(t => who === 'all' || t.assignee === who)
    .filter(t => !q || [t.text, t.desc, t.project?.name].some(s => s?.toLowerCase().includes(q)))
  if (SORTS[sort]) shown.sort(SORTS[sort])
  const active = status === 'done' ? [] : shown.filter(t => !t.done)
  const completed = status === 'active' ? [] : shown.filter(t => t.done)
  const filtering = q || status !== 'all' || who !== 'all'
  const loading = !todosRaw || !projectsRaw || !stepsRaw

  const renderTodos = (items, cls = '') => {
    const props = sort === 'manual' ? dnd(items.map(t => t.id), reorder(allTodos, items, 'listOrder')) : () => ({})
    return (
      <ul className={`list ${cls}`}>
        {items.map(t => <Item key={t.id} item={t} tag={t.project?.name} drag={props(t.id)}
          onEdit={data => patch(t, data)} onDelete={() => removeTodo(t)} />)}
      </ul>
    )
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo"><Icon name="check" size={18} /></span>
          <h1>Tasks &amp; Projects</h1>
        </div>
        <nav>
          <button className={view === 'todos' ? 'active' : ''} onClick={() => setView('todos')}>
            <Icon name="check" /> To-do <span className="count">{openCount}</span>
          </button>
          <button className={view === 'projects' ? 'active' : ''} onClick={() => setView('projects')}>
            <Icon name="folder" /> Projects <span className="count">{projects.length}</span>
          </button>
        </nav>
        <div className="me" title={me}>
          <Avatar email={me} />
          <button className="icon" onClick={() => signOut(auth)} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="icon" onClick={() => setError('')} aria-label="Dismiss"><Icon name="x" /></button>
        </div>
      )}
      {local && !loading && (
        <div className="banner">
          <span>This browser has tasks saved from before sync was added.</span>
          <button className="primary" onClick={importLocal}>Import them</button>
          <button className="ghost" onClick={() => setLocal(null)}>Not now</button>
        </div>
      )}

      <main>
        {loading ? <p className="empty">Loading…</p> : view === 'todos' ? (
          <section>
            <div className="stats">
              <div className="stat"><b>{openCount}</b><span>Active</span></div>
              <div className="stat"><b>{mineCount}</b><span>Assigned to me</span></div>
              <div className={`stat ${todayCount ? 'warn' : ''}`}><b>{todayCount}</b><span>Due today</span></div>
              <div className={`stat ${overdueCount ? 'danger' : ''}`}><b>{overdueCount}</b><span>Overdue</span></div>
            </div>

            <AddForm withMeta placeholder="What needs doing?" onAdd={(text, meta) =>
              add('todos', { text, desc: '', done: false, ...meta, listOrder: Date.now() })} />

            <div className="toolbar">
              <label className="search">
                <Icon name="search" />
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks…" aria-label="Search tasks" />
              </label>
              <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                <option value="manual">Sort: Manual</option>
                <option value="due">Sort: Due date</option>
                <option value="priority">Sort: Priority</option>
              </select>
            </div>
            <div className="toolbar">
              <div className="segmented" role="group" aria-label="Filter by status">
                {[['all', 'All', allTodos.length], ['active', 'Active', openCount], ['done', 'Completed', doneCount]].map(([v, label, n]) => (
                  <button key={v} className={status === v ? 'active' : ''} aria-pressed={status === v} onClick={() => setStatus(v)}>
                    {label} <span className="count">{n}</span>
                  </button>
                ))}
              </div>
              <div className="segmented" role="group" aria-label="Filter by person">
                {[['all', 'Everyone'], [me, 'Mine'], [other, PEOPLE[other]]].map(([v, label]) => (
                  <button key={v} className={who === v ? 'active' : ''} aria-pressed={who === v} onClick={() => setWho(v)}>{label}</button>
                ))}
              </div>
            </div>
            {sort !== 'manual' && active.length > 1 && <p className="hint">Switch to manual sort to drag tasks.</p>}

            {active.length > 0 && renderTodos(active)}
            {completed.length > 0 && (
              <>
                <div className="section-head">
                  <h3>Completed · {completed.length}</h3>
                  <button className="link" onClick={() => commit(b => allTodos.filter(t => t.done).forEach(t => t.col === 'steps'
                    ? b.update(doc(db, 'steps', t.id), { todo: false })
                    : b.delete(doc(db, 'todos', t.id))))}>Clear completed</button>
                </div>
                {renderTodos(completed, 'completed')}
              </>
            )}
            {!active.length && !completed.length && (
              <p className="empty">{filtering && allTodos.length ? 'No tasks match these filters.' : 'Nothing to do. Enjoy the calm.'}</p>
            )}
          </section>
        ) : (
          <section>
            <AddForm placeholder="New project…" onAdd={name => add('projects', { name, order: Date.now() })} />
            {!projects.length && <p className="empty">No projects yet. Create one above.</p>}
            <div className="grid">
              {projects.map(p => {
                const own = steps.filter(s => s.projectId === p.id)
                const done = own.filter(s => s.done).length
                const pct = own.length ? Math.round(done / own.length * 100) : 0
                const props = dnd(own.map(s => s.id), reorder(own, own, 'order'))
                return (
                  <article key={p.id} className="card">
                    <div className="card-head">
                      <span className="ring" style={{ '--pct': pct }}><span>{pct}%</span></span>
                      <div>
                        <h2>{p.name}</h2>
                        <span className="muted">{done} of {own.length} steps</span>
                      </div>
                      <button className="icon" aria-label={`Delete project ${p.name}`}
                        onClick={() => confirm(`Delete "${p.name}" and its steps?`) && commit(b => {
                          b.delete(doc(db, 'projects', p.id))
                          own.forEach(s => b.delete(doc(db, 'steps', s.id)))
                        })}><Icon name="x" /></button>
                    </div>
                    <ul className="list">
                      {own.map(s => (
                        <Item key={s.id} item={s} drag={props(s.id)} onEdit={data => patch(s, data)} onDelete={() => remove(s)}>
                          <button className={`chip pill ${s.todo ? 'on' : ''}`} aria-pressed={!!s.todo}
                            onClick={() => patch(s, s.todo ? { todo: false } : { todo: true, listOrder: Date.now() })}>
                            <Icon name={s.todo ? 'check' : 'plus'} size={12} /> {s.todo ? 'In to-do' : 'To-do'}
                          </button>
                        </Item>
                      ))}
                    </ul>
                    <AddForm withMeta placeholder="Add step…" onAdd={(text, meta) =>
                      add('steps', { projectId: p.id, text, desc: '', done: false, todo: false, ...meta, order: Date.now(), listOrder: 0 })} />
                  </article>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

