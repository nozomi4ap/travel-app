import React, { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import {
  Menu, Sparkles, Calendar, MapPin, CheckSquare, ShoppingCart, ChevronRight,
  Plus, X, ArrowLeft, Archive, RotateCcw, User, Package, Ticket, ExternalLink,
} from 'lucide-react'

/* ---------- Firestoreの参照先 ---------- */
const TRIPS_DOC = doc(db, 'appData', 'trips')

/* ---------- ユーティリティ ---------- */
const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const pad2 = n => String(n).padStart(2, '0')
const toKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const fmtMD = k => { const d = parseKey(k); return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})` }
const fmtRange = (s, e) => `${fmtMD(s)} 〜 ${fmtMD(e)}`
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const genId = () => Math.random().toString(36).slice(2, 9)
const rangeDates = (start, end) => {
  const out = []; let cur = parseKey(start); const last = parseKey(end)
  while (cur <= last) { out.push(toKey(cur)); cur = addDays(cur, 1) }
  return out
}

const CATEGORY_STYLES = {
  '移動': { bg: '#FFE3DC', text: '#C25B3E', dot: '#FFB4A2' },
  '食事': { bg: '#FFF3D6', text: '#B8862E', dot: '#FFD97D' },
  '宿泊': { bg: '#EDE6F9', text: '#6A4FA0', dot: '#B8A6E0' },
  '観光': { bg: '#E1F5EC', text: '#3F8F6C', dot: '#7FC8A9' },
  'その他': { bg: '#EEF0F2', text: '#6B7280', dot: '#C9CED6' },
}
const CATEGORIES = Object.keys(CATEGORY_STYLES)
const EMOJI_OPTIONS = ['✈️', '🏖️', '⛰️', '🗼', '🚗', '🚄', '🏯', '🎡', '🍜', '🏕️', '🛳️', '🌸']
const RSV_CATEGORIES = ['フライト', 'ホテル', 'レンタカー', 'その他']

const mapsUrl = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`

/* ---------- 共通パーツ ---------- */
function Chip({ label, onRemove }) {
  return (
    <span className="chip">
      {label}
      {onRemove && <button onClick={onRemove}><X size={12} /></button>}
    </span>
  )
}

function EmptyNote({ icon, text }) {
  return (
    <div className="empty-note">
      {icon}
      <div>{text}</div>
    </div>
  )
}

function ScheduleMiniRow({ item }) {
  const st = CATEGORY_STYLES[item.category]
  const place = item.location || item.arrivalLocation
  return (
    <div className="card">
      <div className="schedule-row" onClick={() => place && window.open(mapsUrl(place), '_blank')}>
        <span className="cat-dot" style={{ background: st.dot }} />
        <span className="sched-time">{item.time}</span>
        {item.endTime && <span className="sched-arrow">→ {item.endTime}</span>}
        <div className="sched-body">
          <div className="sched-title">{item.title}</div>
          {place && <div className="sched-loc"><MapPin size={11} />{place}</div>}
        </div>
      </div>
    </div>
  )
}

/* ---------- ホーム画面 ---------- */
function Home({ trips, onOpenDrawer, onOpenTrip, onQuickAddTrip }) {
  const today = startOfToday()
  const upcoming = trips
    .filter(t => !t.archived && parseKey(t.endDate) >= today)
    .sort((a, b) => parseKey(a.startDate) - parseKey(b.startDate))
  const trip = upcoming[0]

  let dayLabel = '初日の予定'
  let scheduleItems = []
  let daysLeft = null

  if (trip) {
    const start = parseKey(trip.startDate)
    const end = parseKey(trip.endDate)
    const isDuring = today >= start && today <= end
    dayLabel = isDuring ? '今日の予定' : '初日の予定'
    const key = isDuring ? toKey(today) : trip.startDate
    scheduleItems = ((trip.days && trip.days[key]) || []).slice().sort((a, b) => a.time.localeCompare(b.time))
    daysLeft = Math.round((start - today) / 86400000)
  }

  const todoPhase = trip ? (today >= parseKey(trip.startDate) && today <= parseKey(trip.endDate) ? 'during' : 'pre') : 'pre'
  const todoList = trip ? ((trip.todos && trip.todos[todoPhase]) || []).filter(t => !t.checked) : []
  const shoppingList = trip ? (trip.shoppingList || []).filter(t => !t.checked) : []

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={onOpenDrawer}><Menu /></button>
        <div className="title">🌴 旅のしおり</div>
        <div style={{ width: 34 }} />
      </div>

      {!trip && (
        <div className="empty-hero">
          <Sparkles size={30} />
          <h2>次の旅行を計画しよう</h2>
          <p>まだ予定中の旅行がありません</p>
          <button className="white-btn" onClick={onQuickAddTrip}>旅行を追加する</button>
        </div>
      )}

      {trip && (
        <div className="countdown-card">
          <div className="countdown-emoji">{trip.emoji}</div>
          <div className="countdown-days">
            {daysLeft > 0 ? `あと${daysLeft}日` : daysLeft === 0 ? '今日から出発!' : '旅行中!'}
          </div>
          <div className="countdown-name">{trip.name}</div>
          <div className="countdown-dest"><MapPin size={12} />{trip.destination}</div>
          <div className="countdown-range">{fmtRange(trip.startDate, trip.endDate)}</div>
        </div>
      )}

      {trip && (
        <React.Fragment>
          <div className="section-title"><Calendar size={16} color="#FFB6B9" />{dayLabel}</div>
          {scheduleItems.length === 0
            ? <EmptyNote icon={<Calendar size={26} color="#D8E3EA" />} text="予定はまだありません" />
            : scheduleItems.map(item => <ScheduleMiniRow key={item.id} item={item} />)}

          <div className="section-title">
            <CheckSquare size={16} color="#FFB6B9" />
            {`やることリスト(${todoPhase === 'during' ? '旅行中' : '旅行前'})`}
          </div>
          {todoList.length === 0
            ? <div className="empty-note-plain" style={{ margin: '0 16px 4px' }}>未完了のタスクはありません</div>
            : todoList.map(t => (
              <div className="list-card" key={t.id}>
                <span className="check-circle" />
                <span>{t.text}</span>
              </div>
            ))}

          <div className="section-title"><ShoppingCart size={16} color="#FFB6B9" />買うものリスト</div>
          {shoppingList.length === 0
            ? <div className="empty-note-plain" style={{ margin: '0 16px 4px' }}>買い忘れはなさそうです</div>
            : shoppingList.map(t => (
              <div className="list-card" key={t.id}>
                <span className="check-circle" />
                <span>{t.text}</span>
              </div>
            ))}

          <div className="open-btn-wrap">
            <button className="open-btn" onClick={() => onOpenTrip(trip.id)}>このしおりを開く</button>
          </div>
        </React.Fragment>
      )}
    </div>
  )
}

/* ---------- 旅行追加フォーム(ボトムシート) ---------- */
function AddTripSheet({ onClose, onCreate }) {
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0])
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [members, setMembers] = useState([])
  const [memberInput, setMemberInput] = useState('')

  const canCreate = name && destination && startDate && endDate && endDate >= startDate

  const addMember = () => {
    if (memberInput.trim()) {
      setMembers([...members, memberInput.trim()])
      setMemberInput('')
    }
  }

  const create = () => {
    if (!canCreate) return
    onCreate({
      id: genId(), emoji, name, destination, startDate, endDate, members, archived: false,
      days: {}, packingList: [], shoppingList: [],
      todos: { pre: [], during: [], post: [] }, reservations: [],
    })
  }

  return (
    <React.Fragment>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h3>旅行を追加</h3>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="field-label">絵文字</div>
        <div className="emoji-grid">
          {EMOJI_OPTIONS.map(e => (
            <button key={e} className={'emoji-opt' + (emoji === e ? ' selected' : '')} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>

        <div className="field-label">旅行名</div>
        <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="例:家族で北海道旅行" />

        <div className="field-label">行き先</div>
        <input className="field-input" value={destination} onChange={e => setDestination(e.target.value)} placeholder="例:北海道" />

        <div className="field-label">日程</div>
        <div className="grid-2">
          <input type="date" className="field-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" className="field-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>

        <div className="field-label">参加メンバー</div>
        <div className="member-row">
          <input className="field-input" value={memberInput} onChange={e => setMemberInput(e.target.value)}
            placeholder="名前を入力" onKeyDown={e => e.key === 'Enter' && addMember()} />
          <button className="small-add-btn" onClick={addMember}>追加</button>
        </div>
        <div className="chip-row">
          {members.map((m, i) => <Chip key={i} label={m} onRemove={() => setMembers(members.filter((_, idx) => idx !== i))} />)}
        </div>

        <button className="primary-btn" disabled={!canCreate} onClick={create}>この内容で作成</button>
      </div>
    </React.Fragment>
  )
}

/* ---------- 旅行一覧(ドロワー) ---------- */
function TripDrawer({ trips, onClose, onOpenTrip, onCreate, onToggleArchive }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const today = startOfToday()

  const active = trips.filter(t => !t.archived)
  const upcoming = active.filter(t => parseKey(t.endDate) >= today).sort((a, b) => parseKey(a.startDate) - parseKey(b.startDate))
  const finished = active.filter(t => parseKey(t.endDate) < today).sort((a, b) => parseKey(b.endDate) - parseKey(a.endDate))
  const archived = trips.filter(t => t.archived)

  const renderCard = (t) => (
    <div className="trip-card" key={t.id}>
      <span className="emoji">{t.emoji}</span>
      <div className="info" onClick={() => onOpenTrip(t.id)}>
        <div className="name">{t.name}</div>
        <div className="dest"><MapPin size={11} />{t.destination}</div>
        <div className="range">{fmtRange(t.startDate, t.endDate)}</div>
      </div>
      <button className="mini-icon-btn" onClick={() => onToggleArchive(t.id)}>
        {t.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
      </button>
      <button className="icon-btn" style={{ padding: 2 }} onClick={() => onOpenTrip(t.id)}>
        <ChevronRight size={17} color="rgba(51,86,110,0.3)" />
      </button>
    </div>
  )

  return (
    <React.Fragment>
      <div className="overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <h2>旅行一覧</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <button className="add-trip-btn" onClick={() => setShowAdd(true)}>＋ 旅行を追加</button>

        <div className="section-title" style={{ margin: '0 0 8px' }}>予定中</div>
        {upcoming.length === 0
          ? <div className="empty-note-plain">予定中の旅行はありません</div>
          : upcoming.map(renderCard)}

        <div className="section-title" style={{ margin: '18px 0 8px' }}>終わった旅行</div>
        {finished.length === 0
          ? <div className="empty-note-plain">終わった旅行はありません</div>
          : finished.map(renderCard)}

        <div style={{ marginTop: 16 }}>
          <button className="link-text" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'アーカイブ済みを隠す' : `アーカイブ済みを見る(${archived.length})`}
          </button>
        </div>
        {showArchived && (
          <div style={{ marginTop: 10 }}>
            {archived.length === 0
              ? <div className="empty-note-plain">アーカイブ済みの旅行はありません</div>
              : archived.map(renderCard)}
          </div>
        )}
      </div>

      {showAdd && (
        <AddTripSheet
          onClose={() => setShowAdd(false)}
          onCreate={(t) => { onCreate(t); setShowAdd(false) }}
        />
      )}
    </React.Fragment>
  )
}

/* ---------- 日程タブ ---------- */
function AddScheduleSheet({ onClose, onAdd }) {
  const [time, setTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('移動')
  const [location, setLocation] = useState('')
  const [arrivalLocation, setArrivalLocation] = useState('')
  const [arrivalIsLocalTime, setArrivalIsLocalTime] = useState(false)
  const [memo, setMemo] = useState('')
  const [reservationNumber, setReservationNumber] = useState('')

  const canAdd = time && title

  return (
    <React.Fragment>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h3>予定を追加</h3>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="field-label">時刻</div>
        <div className="grid-2">
          <input type="time" className="field-input" value={time} onChange={e => setTime(e.target.value)} />
          <input type="time" className="field-input" value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="到着時刻(任意)" />
        </div>

        <div className="field-label">予定名</div>
        <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例:新幹線で移動" />

        <div className="field-label">カテゴリ</div>
        <select className="field-input" value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="field-label">場所</div>
        <div className="grid-2">
          <input className="field-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="出発地(任意)" />
          <input className="field-input" value={arrivalLocation} onChange={e => setArrivalLocation(e.target.value)} placeholder="到着地(任意)" />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 10, color: '#7F93A3' }}>
          <input type="checkbox" checked={arrivalIsLocalTime} onChange={e => setArrivalIsLocalTime(e.target.checked)} />
          到着時刻は現地時間
        </label>

        <div className="field-label">予約番号(任意)</div>
        <input className="field-input" value={reservationNumber} onChange={e => setReservationNumber(e.target.value)} />

        <div className="field-label">メモ(任意)</div>
        <textarea className="field-input" value={memo} onChange={e => setMemo(e.target.value)} />

        <button className="primary-btn" disabled={!canAdd} onClick={() => canAdd && onAdd({
          id: genId(), time, endTime, title, category, location, arrivalLocation, arrivalIsLocalTime, memo, reservationNumber
        })}>この内容で追加</button>
      </div>
    </React.Fragment>
  )
}

function ScheduleTab({ trip, onUpdateTrip }) {
  const dateKeys = rangeDates(trip.startDate, trip.endDate)
  const [selectedDay, setSelectedDay] = useState(dateKeys[0])
  const [showAdd, setShowAdd] = useState(false)
  const items = ((trip.days && trip.days[selectedDay]) || []).slice().sort((a, b) => a.time.localeCompare(b.time))

  const addItem = (item) => {
    const newDays = { ...trip.days, [selectedDay]: [...((trip.days && trip.days[selectedDay]) || []), item] }
    onUpdateTrip({ ...trip, days: newDays })
    setShowAdd(false)
  }
  const removeItem = (id) => {
    const newDays = { ...trip.days, [selectedDay]: ((trip.days && trip.days[selectedDay]) || []).filter(i => i.id !== id) }
    onUpdateTrip({ ...trip, days: newDays })
  }

  return (
    <div>
      <div className="day-tabbar">
        {dateKeys.map((k, i) => (
          <button key={k} className={'day-tab' + (k === selectedDay ? ' active' : '')} onClick={() => setSelectedDay(k)}>
            <div>Day{i + 1}</div>
            <div className="day-tab-date">{fmtMD(k)}</div>
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <EmptyNote icon={<Calendar size={30} color="#D8E3EA" />} text="この日の予定はまだありません" />
      )}

      {items.map(item => {
        const st = CATEGORY_STYLES[item.category]
        return (
          <div className="sched-card" key={item.id}>
            <div className="sched-card-top">
              <div className="sched-time-col">
                <div className="start">{item.time}</div>
                {item.endTime && <div className="end">↓ {item.endTime}{item.arrivalIsLocalTime ? '(現地)' : ''}</div>}
              </div>
              <div className="sched-main">
                <span className="cat-badge" style={{ background: st.bg, color: st.text }}>{item.category}</span>
                <div className="sched-name">{item.title}</div>
                {(item.location || item.arrivalLocation) && (
                  <div className="route-row">
                    {item.location && (
                      <a className="route-link" href={mapsUrl(item.location)} target="_blank" rel="noreferrer">
                        {item.location}<ExternalLink size={11} />
                      </a>
                    )}
                    {item.location && item.arrivalLocation && <span>→</span>}
                    {item.arrivalLocation && (
                      <a className="route-link" href={mapsUrl(item.arrivalLocation)} target="_blank" rel="noreferrer">
                        {item.arrivalLocation}<ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                )}
                {item.reservationNumber && (
                  <div className="rsv-row"><Ticket size={12} />{item.reservationNumber}</div>
                )}
                {item.memo && <div className="memo-row">{item.memo}</div>}
              </div>
              <button className="del-x" onClick={() => removeItem(item.id)}><X size={15} /></button>
            </div>
          </div>
        )
      })}

      <button className="add-schedule-btn" onClick={() => setShowAdd(true)}>＋ 予定を追加</button>
      {showAdd && <AddScheduleSheet onClose={() => setShowAdd(false)} onAdd={addItem} />}
    </div>
  )
}

/* ---------- チェックリスト共通(持ち物・買うもの) ---------- */
function CheckListTab({ items, onChange, placeholder }) {
  const [text, setText] = useState('')
  const add = () => {
    if (!text.trim()) return
    onChange([...items, { id: genId(), text: text.trim(), checked: false }])
    setText('')
  }
  const toggle = (id) => onChange(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  const remove = (id) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      <div className="add-inline-row">
        <input className="field-input" value={text} onChange={e => setText(e.target.value)} placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="small-add-btn" onClick={add}><Plus size={16} /></button>
      </div>
      {items.length === 0 && <div className="empty-note-plain" style={{ textAlign: 'center', margin: '10px auto' }}>まだ何も登録されていません</div>}
      {items.map(i => (
        <div className="list-card" key={i.id}>
          <button className={'check-circle' + (i.checked ? ' checked' : '')} onClick={() => toggle(i.id)}>
            {i.checked && <CheckSquare size={12} color="white" strokeWidth={3} />}
          </button>
          <span className={'list-text' + (i.checked ? ' checked' : '')} style={{ flex: 1 }}>{i.text}</span>
          <button className="del-x" onClick={() => remove(i.id)}><X size={15} /></button>
        </div>
      ))}
    </div>
  )
}

/* ---------- やることリスト(前・中・後) ---------- */
function TodoTab({ todos, onChange }) {
  const [phase, setPhase] = useState('pre')
  const labels = { pre: '旅行前', during: '旅行中', post: '旅行後' }
  const update = (newList) => onChange({ ...todos, [phase]: newList })

  return (
    <div>
      <div className="sub-tabbar">
        {Object.keys(labels).map(p => (
          <button key={p} className={'sub-tab' + (p === phase ? ' active' : '')} onClick={() => setPhase(p)}>{labels[p]}</button>
        ))}
      </div>
      <CheckListTab items={(todos && todos[phase]) || []} onChange={update} placeholder="やることを入力" />
    </div>
  )
}

/* ---------- 予約情報タブ ---------- */
function ReservationTab({ reservations, onChange }) {
  const [category, setCategory] = useState('フライト')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [link, setLink] = useState('')

  const add = () => {
    if (!name.trim()) return
    onChange([...reservations, { id: genId(), category, name: name.trim(), number, link }])
    setName(''); setNumber(''); setLink('')
  }
  const remove = (id) => onChange(reservations.filter(r => r.id !== id))

  return (
    <div>
      <div style={{ padding: '4px 16px 14px' }}>
        <div className="field-label">カテゴリ</div>
        <select className="field-input" value={category} onChange={e => setCategory(e.target.value)}>
          {RSV_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="field-label">名前</div>
        <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="例:ANA123便" />
        <div className="field-label">予約番号(任意)</div>
        <input className="field-input" value={number} onChange={e => setNumber(e.target.value)} />
        <div className="field-label">リンク(任意)</div>
        <input className="field-input" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
        <button className="small-add-btn" style={{ marginTop: 10, width: '100%', padding: '10px 0' }} onClick={add}>この内容で追加</button>
      </div>

      {reservations.length === 0 && <div className="empty-note-plain" style={{ textAlign: 'center' }}>まだ予約情報はありません</div>}
      {reservations.map(r => (
        <div className="rsv-card" key={r.id}>
          <span className="rsv-cat-tag">{r.category}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="sched-name">{r.name}</div>
              {r.number && <div className="rsv-row"><Ticket size={12} />{r.number}</div>}
              {r.link && (
                <a className="route-link" href={r.link} target="_blank" rel="noreferrer" style={{ marginTop: 5, display: 'inline-flex' }}>
                  リンクを開く<ExternalLink size={11} />
                </a>
              )}
            </div>
            <button className="del-x" onClick={() => remove(r.id)}><X size={15} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- 旅行詳細ページ ---------- */
function TripDetail({ trip, onBack, onUpdateTrip, onDeleteTrip, onToggleArchive, onOpenDrawer }) {
  const [tab, setTab] = useState('schedule')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tabs = [
    { key: 'schedule', label: '日程', icon: Calendar },
    { key: 'packing', label: '持ち物', icon: Package },
    { key: 'shopping', label: '買うもの', icon: ShoppingCart },
    { key: 'todo', label: 'やること', icon: CheckSquare },
    { key: 'reservation', label: '予約', icon: Ticket },
  ]

  return (
    <div className="app-shell">
      <div className="detail-header">
        <div className="detail-top-row">
          <button className="icon-btn" onClick={onBack}><ArrowLeft /></button>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => onToggleArchive(trip.id)}>
              {trip.archived ? <RotateCcw size={19} /> : <Archive size={19} />}
            </button>
            <button className="icon-btn" onClick={onOpenDrawer}><Menu size={19} /></button>
          </div>
        </div>
        <div className="detail-title-row">
          <span style={{ fontSize: 24 }}>{trip.emoji}</span>
          <span className="detail-title">{trip.name}</span>
        </div>
        <div className="detail-sub">
          <span><MapPin size={11} style={{ verticalAlign: '-1px' }} /> {trip.destination}</span>
          <span>{fmtRange(trip.startDate, trip.endDate)}</span>
        </div>
      </div>

      {trip.members && trip.members.length > 0 && (
        <div className="member-chips">
          {trip.members.map((m, i) => (
            <span className="chip" key={i}><User size={12} />{m}</span>
          ))}
        </div>
      )}

      <div className="tabbar">
        {tabs.map(t => {
          const Ico = t.icon
          return (
            <button key={t.key} className={'tab-btn' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
              <Ico size={17} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'schedule' && <ScheduleTab trip={trip} onUpdateTrip={onUpdateTrip} />}
      {tab === 'packing' && <CheckListTab items={trip.packingList || []} onChange={(l) => onUpdateTrip({ ...trip, packingList: l })} placeholder="持ち物を入力" />}
      {tab === 'shopping' && <CheckListTab items={trip.shoppingList || []} onChange={(l) => onUpdateTrip({ ...trip, shoppingList: l })} placeholder="買うものを入力" />}
      {tab === 'todo' && <TodoTab todos={trip.todos || { pre: [], during: [], post: [] }} onChange={(t) => onUpdateTrip({ ...trip, todos: t })} />}
      {tab === 'reservation' && <ReservationTab reservations={trip.reservations || []} onChange={(r) => onUpdateTrip({ ...trip, reservations: r })} />}

      <div className="delete-trip-wrap">
        {!confirmDelete
          ? <button className="danger-link" onClick={() => setConfirmDelete(true)}>この旅行を削除する</button>
          : (
            <div className="confirm-box">
              <div className="confirm-text">本当に削除しますか?元に戻せません</div>
              <div className="confirm-btns">
                <button className="confirm-delete" onClick={() => onDeleteTrip(trip.id)}>削除する</button>
                <button className="confirm-cancel" onClick={() => setConfirmDelete(false)}>やめる</button>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

/* ---------- アプリ本体 ---------- */
export default function App() {
  const [trips, setTrips] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [view, setView] = useState('home')
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      TRIPS_DOC,
      (snap) => {
        setTrips(snap.exists() ? (snap.data().value || []) : [])
        setLoaded(true)
      },
      () => {
        setSaveError(true)
        setLoaded(true)
      }
    )
    return () => unsubscribe()
  }, [])

  const persist = async (newTrips) => {
    setTrips(newTrips)
    try {
      await setDoc(TRIPS_DOC, { value: newTrips })
      setSaveError(false)
    } catch (e) {
      setSaveError(true)
    }
  }

  const selectedTrip = trips.find(t => t.id === selectedTripId)

  const updateTrip = (updated) => persist(trips.map(t => t.id === updated.id ? updated : t))
  const createTrip = (t) => persist([...trips, t])
  const deleteTrip = (id) => { persist(trips.filter(t => t.id !== id)); setView('home'); setSelectedTripId(null) }
  const toggleArchive = (id) => persist(trips.map(t => t.id === id ? { ...t, archived: !t.archived } : t))

  const openTrip = (id) => { setSelectedTripId(id); setView('detail'); setDrawerOpen(false) }

  if (!loaded) {
    return <div className="center-loading">読み込み中です…</div>
  }

  return (
    <React.Fragment>
      {saveError && (
        <div className="save-error-banner">保存できませんでした。通信環境をご確認ください</div>
      )}
      {view === 'home' && (
        <Home
          trips={trips}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenTrip={openTrip}
          onQuickAddTrip={() => setDrawerOpen(true)}
        />
      )}
      {view === 'detail' && selectedTrip && (
        <TripDetail
          trip={selectedTrip}
          onBack={() => { setView('home'); setSelectedTripId(null) }}
          onUpdateTrip={updateTrip}
          onDeleteTrip={deleteTrip}
          onToggleArchive={toggleArchive}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      )}
      {drawerOpen && (
        <TripDrawer
          trips={trips}
          onClose={() => setDrawerOpen(false)}
          onOpenTrip={openTrip}
          onCreate={createTrip}
          onToggleArchive={toggleArchive}
        />
      )}
    </React.Fragment>
  )
}
