import React, { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import {
  Menu, Sparkles, Calendar, MapPin, CheckSquare, ShoppingCart, ChevronRight,
  Plus, X, ArrowLeft, Archive, RotateCcw, User, Package, Ticket, ExternalLink,
  Camera, Printer, Image as ImageIcon, Pencil,
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

/* 持ち物リストを「バッグごとのグループ」形式に揃える。
   以前のバージョン(グループなしの単純なリスト)のデータも自動で1つのグループにまとめる */
function normalizePacking(packingList) {
  if (!packingList || packingList.length === 0) return []
  if (packingList[0] && packingList[0].items) return packingList
  return [{ id: genId(), name: '持ち物', items: packingList }]
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

/* 画像を小さく圧縮してFirestoreに保存できるサイズ(base64文字列)にする */
function compressImage(file, maxWidth = 900, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* 写真を選ぶ小さな共通パーツ(表紙写真・予定の写真どちらにも使う) */
function PhotoPicker({ value, onChange, label }) {
  const inputId = 'photo-' + genId()
  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      onChange(dataUrl)
    } catch (err) {
      // 圧縮に失敗した場合は何もしない
    }
  }
  return (
    <div>
      <div className="field-label">{label}</div>
      {value ? (
        <div className="photo-preview-wrap">
          <img src={value} alt="" className="photo-preview" />
          <button className="photo-remove-btn" onClick={() => onChange(null)}><X size={14} /></button>
        </div>
      ) : (
        <label className="photo-add-btn" htmlFor={inputId}>
          <Camera size={16} /> 写真を選ぶ
        </label>
      )}
      <input id={inputId} type="file" accept="image/*" className="photo-input-hidden" onChange={handleFile} />
    </div>
  )
}

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
        <div
          className={'countdown-card' + (trip.coverPhoto ? ' has-photo' : '')}
          style={trip.coverPhoto ? { backgroundImage: `linear-gradient(180deg, rgba(20,40,55,0.15), rgba(20,40,55,0.55)), url(${trip.coverPhoto})` } : undefined}
        >
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
function AddTripSheet({ onClose, onCreate, initial }) {
  const isEdit = !!initial
  const [emoji, setEmoji] = useState(initial ? initial.emoji : EMOJI_OPTIONS[0])
  const [name, setName] = useState(initial ? initial.name : '')
  const [destination, setDestination] = useState(initial ? initial.destination : '')
  const [startDate, setStartDate] = useState(initial ? initial.startDate : '')
  const [endDate, setEndDate] = useState(initial ? initial.endDate : '')
  const [members, setMembers] = useState(initial ? initial.members || [] : [])
  const [memberInput, setMemberInput] = useState('')
  const [coverPhoto, setCoverPhoto] = useState(initial ? initial.coverPhoto || null : null)

  const canCreate = name && destination && startDate && endDate && endDate >= startDate

  const addMember = () => {
    if (memberInput.trim()) {
      setMembers([...members, memberInput.trim()])
      setMemberInput('')
    }
  }

  const submit = () => {
    if (!canCreate) return
    if (isEdit) {
      onCreate({
        ...initial, emoji, name, destination, startDate, endDate, members,
        coverPhoto: coverPhoto || null,
      })
    } else {
      onCreate({
        id: genId(), emoji, name, destination, startDate, endDate, members, archived: false,
        coverPhoto: coverPhoto || null,
        days: {}, packingList: [], shoppingList: [],
        todos: { pre: [], during: [], post: [] }, reservations: [],
      })
    }
  }

  return (
    <React.Fragment>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h3>{isEdit ? '旅行を編集' : '旅行を追加'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="field-label">絵文字</div>
        <div className="emoji-grid">
          {EMOJI_OPTIONS.map(e => (
            <button key={e} className={'emoji-opt' + (emoji === e ? ' selected' : '')} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>

        <PhotoPicker value={coverPhoto} onChange={setCoverPhoto} label="表紙写真(任意)" />

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

        <button className="primary-btn" disabled={!canCreate} onClick={submit}>{isEdit ? 'この内容で保存' : 'この内容で作成'}</button>
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
function AddScheduleSheet({ onClose, onAdd, initial }) {
  const isEdit = !!initial
  const [time, setTime] = useState(initial ? initial.time : '')
  const [endTime, setEndTime] = useState(initial ? initial.endTime || '' : '')
  const [title, setTitle] = useState(initial ? initial.title : '')
  const [category, setCategory] = useState(initial ? initial.category : '移動')
  const [location, setLocation] = useState(initial ? initial.location || '' : '')
  const [arrivalLocation, setArrivalLocation] = useState(initial ? initial.arrivalLocation || '' : '')
  const [arrivalIsLocalTime, setArrivalIsLocalTime] = useState(initial ? !!initial.arrivalIsLocalTime : false)
  const [memo, setMemo] = useState(initial ? initial.memo || '' : '')
  const [reservationNumber, setReservationNumber] = useState(initial ? initial.reservationNumber || '' : '')
  const [photo, setPhoto] = useState(initial ? initial.photo || null : null)

  const canAdd = time && title

  const submit = () => {
    if (!canAdd) return
    onAdd({
      id: isEdit ? initial.id : genId(),
      time, endTime, title, category, location, arrivalLocation, arrivalIsLocalTime, memo, reservationNumber, photo
    })
  }

  return (
    <React.Fragment>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h3>{isEdit ? '予定を編集' : '予定を追加'}</h3>
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

        <PhotoPicker value={photo} onChange={setPhoto} label="写真(任意)" />

        <button className="primary-btn" disabled={!canAdd} onClick={submit}>{isEdit ? 'この内容で保存' : 'この内容で追加'}</button>
      </div>
    </React.Fragment>
  )
}

function ScheduleTab({ trip, onUpdateTrip }) {
  const dateKeys = rangeDates(trip.startDate, trip.endDate)
  const [selectedDay, setSelectedDay] = useState(dateKeys[0])
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const items = ((trip.days && trip.days[selectedDay]) || []).slice().sort((a, b) => a.time.localeCompare(b.time))

  const saveItem = (item) => {
    const dayItems = (trip.days && trip.days[selectedDay]) || []
    const exists = dayItems.some(i => i.id === item.id)
    const newDayItems = exists ? dayItems.map(i => i.id === item.id ? item : i) : [...dayItems, item]
    const newDays = { ...trip.days, [selectedDay]: newDayItems }
    onUpdateTrip({ ...trip, days: newDays })
    setShowAdd(false)
    setEditingItem(null)
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
            <div className="sched-card-top" onClick={() => setEditingItem(item)}>
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
                      <a className="route-link" href={mapsUrl(item.location)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                        {item.location}<ExternalLink size={11} />
                      </a>
                    )}
                    {item.location && item.arrivalLocation && <span>→</span>}
                    {item.arrivalLocation && (
                      <a className="route-link" href={mapsUrl(item.arrivalLocation)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                        {item.arrivalLocation}<ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                )}
                {item.reservationNumber && (
                  <div className="rsv-row"><Ticket size={12} />{item.reservationNumber}</div>
                )}
                {item.memo && <div className="memo-row">{item.memo}</div>}
                {item.photo && <img src={item.photo} alt="" className="sched-photo" />}
              </div>
              <button className="del-x" onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}><X size={15} /></button>
            </div>
          </div>
        )
      })}

      <button className="add-schedule-btn" onClick={() => setShowAdd(true)}>＋ 予定を追加</button>
      {showAdd && <AddScheduleSheet onClose={() => setShowAdd(false)} onAdd={saveItem} />}
      {editingItem && <AddScheduleSheet onClose={() => setEditingItem(null)} onAdd={saveItem} initial={editingItem} />}
    </div>
  )
}

/* ---------- チェックリスト共通(持ち物・買うもの) ---------- */
function CheckListTab({ items, onChange, placeholder }) {
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')

  const add = () => {
    if (!text.trim()) return
    onChange([...items, { id: genId(), text: text.trim(), checked: false }])
    setText('')
  }
  const toggle = (id) => onChange(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  const remove = (id) => onChange(items.filter(i => i.id !== id))

  const startEdit = (item) => { setEditingId(item.id); setEditingText(item.text) }
  const saveEdit = () => {
    if (editingText.trim()) {
      onChange(items.map(i => i.id === editingId ? { ...i, text: editingText.trim() } : i))
    }
    setEditingId(null)
  }

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
          {editingId === i.id ? (
            <input
              className="field-input inline-edit-input"
              value={editingText}
              autoFocus
              onChange={e => setEditingText(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
            />
          ) : (
            <span className={'list-text' + (i.checked ? ' checked' : '')} style={{ flex: 1 }} onClick={() => startEdit(i)}>{i.text}</span>
          )}
          <button className="del-x" onClick={() => remove(i.id)}><X size={15} /></button>
        </div>
      ))}
    </div>
  )
}

/* ---------- 持ち物リスト(バッグごとのグループ分け) ---------- */
function PackingGroup({ group, onUpdateGroup, onDeleteGroup }) {
  const [editingName, setEditingName] = useState(false)
  const [nameText, setNameText] = useState(group.name)
  const [itemText, setItemText] = useState('')
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItemText, setEditingItemText] = useState('')

  const saveName = () => {
    if (nameText.trim()) onUpdateGroup({ ...group, name: nameText.trim() })
    else setNameText(group.name)
    setEditingName(false)
  }
  const addItem = () => {
    if (!itemText.trim()) return
    onUpdateGroup({ ...group, items: [...group.items, { id: genId(), text: itemText.trim(), checked: false }] })
    setItemText('')
  }
  const toggleItem = (id) => onUpdateGroup({ ...group, items: group.items.map(i => i.id === id ? { ...i, checked: !i.checked } : i) })
  const removeItem = (id) => onUpdateGroup({ ...group, items: group.items.filter(i => i.id !== id) })
  const startEditItem = (item) => { setEditingItemId(item.id); setEditingItemText(item.text) }
  const saveEditItem = () => {
    if (editingItemText.trim()) {
      onUpdateGroup({ ...group, items: group.items.map(i => i.id === editingItemId ? { ...i, text: editingItemText.trim() } : i) })
    }
    setEditingItemId(null)
  }

  return (
    <div className="packing-group">
      <div className="packing-group-head">
        {editingName ? (
          <input className="field-input inline-edit-input" autoFocus value={nameText}
            onChange={e => setNameText(e.target.value)} onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} />
        ) : (
          <span className="packing-group-name" onClick={() => setEditingName(true)}>{group.name}</span>
        )}
        <button className="del-x" onClick={onDeleteGroup}><X size={16} /></button>
      </div>

      <div className="add-inline-row">
        <input className="field-input" value={itemText} onChange={e => setItemText(e.target.value)} placeholder="持ち物を入力"
          onKeyDown={e => e.key === 'Enter' && addItem()} />
        <button className="small-add-btn" onClick={addItem}><Plus size={16} /></button>
      </div>

      {group.items.length === 0 && <div className="empty-note-plain" style={{ textAlign: 'center', margin: '4px auto 10px' }}>まだ何も登録されていません</div>}
      {group.items.map(i => (
        <div className="list-card" key={i.id}>
          <button className={'check-circle' + (i.checked ? ' checked' : '')} onClick={() => toggleItem(i.id)}>
            {i.checked && <CheckSquare size={12} color="white" strokeWidth={3} />}
          </button>
          {editingItemId === i.id ? (
            <input className="field-input inline-edit-input" autoFocus value={editingItemText}
              onChange={e => setEditingItemText(e.target.value)} onBlur={saveEditItem} onKeyDown={e => e.key === 'Enter' && saveEditItem()} />
          ) : (
            <span className={'list-text' + (i.checked ? ' checked' : '')} style={{ flex: 1 }} onClick={() => startEditItem(i)}>{i.text}</span>
          )}
          <button className="del-x" onClick={() => removeItem(i.id)}><X size={15} /></button>
        </div>
      ))}
    </div>
  )
}

function PackingTab({ packingList, onChange }) {
  const groups = normalizePacking(packingList)
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const updateGroup = (updated) => onChange(groups.map(g => g.id === updated.id ? updated : g))
  const deleteGroup = (id) => onChange(groups.filter(g => g.id !== id))
  const addGroup = () => {
    if (!newGroupName.trim()) return
    onChange([...groups, { id: genId(), name: newGroupName.trim(), items: [] }])
    setNewGroupName('')
    setShowAddGroup(false)
  }

  return (
    <div>
      {groups.length === 0 && <div className="empty-note-plain" style={{ textAlign: 'center', margin: '10px auto' }}>まだバッグがありません</div>}
      {groups.map(g => (
        <PackingGroup key={g.id} group={g} onUpdateGroup={updateGroup} onDeleteGroup={() => deleteGroup(g.id)} />
      ))}

      {showAddGroup ? (
        <div className="add-inline-row" style={{ padding: '4px 16px 14px' }}>
          <input className="field-input" autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
            placeholder="例:スーツケース(大)" onKeyDown={e => e.key === 'Enter' && addGroup()} />
          <button className="small-add-btn" onClick={addGroup}><Plus size={16} /></button>
        </div>
      ) : (
        <button className="add-schedule-btn" onClick={() => setShowAddGroup(true)}>＋ バッグを追加</button>
      )}
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
function ReservationSheet({ onClose, onSubmit, initial }) {
  const isEdit = !!initial
  const [category, setCategory] = useState(initial ? initial.category : 'フライト')
  const [name, setName] = useState(initial ? initial.name : '')
  const [number, setNumber] = useState(initial ? initial.number || '' : '')
  const [link, setLink] = useState(initial ? initial.link || '' : '')

  const canSubmit = name.trim()

  const submit = () => {
    if (!canSubmit) return
    onSubmit({ id: isEdit ? initial.id : genId(), category, name: name.trim(), number, link })
  }

  return (
    <React.Fragment>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h3>{isEdit ? '予約を編集' : '予約を追加'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
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
        <button className="primary-btn" disabled={!canSubmit} onClick={submit}>{isEdit ? 'この内容で保存' : 'この内容で追加'}</button>
      </div>
    </React.Fragment>
  )
}

function ReservationTab({ reservations, onChange }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const saveItem = (item) => {
    const exists = reservations.some(r => r.id === item.id)
    onChange(exists ? reservations.map(r => r.id === item.id ? item : r) : [...reservations, item])
    setShowAdd(false)
    setEditingItem(null)
  }
  const remove = (id) => onChange(reservations.filter(r => r.id !== id))

  return (
    <div>
      {reservations.length === 0 && <div className="empty-note-plain" style={{ textAlign: 'center', margin: '10px auto' }}>まだ予約情報はありません</div>}
      {reservations.map(r => (
        <div className="rsv-card" key={r.id} onClick={() => setEditingItem(r)}>
          <span className="rsv-cat-tag">{r.category}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="sched-name">{r.name}</div>
              {r.number && <div className="rsv-row"><Ticket size={12} />{r.number}</div>}
              {r.link && (
                <a className="route-link" href={r.link} target="_blank" rel="noreferrer" style={{ marginTop: 5, display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
                  リンクを開く<ExternalLink size={11} />
                </a>
              )}
            </div>
            <button className="del-x" onClick={(e) => { e.stopPropagation(); remove(r.id) }}><X size={15} /></button>
          </div>
        </div>
      ))}

      <button className="add-schedule-btn" onClick={() => setShowAdd(true)}>＋ 予約を追加</button>
      {showAdd && <ReservationSheet onClose={() => setShowAdd(false)} onSubmit={saveItem} />}
      {editingItem && <ReservationSheet onClose={() => setEditingItem(null)} onSubmit={saveItem} initial={editingItem} />}
    </div>
  )
}

/* ---------- 旅行詳細ページ ---------- */
function TripDetail({ trip, onBack, onUpdateTrip, onDeleteTrip, onToggleArchive, onOpenDrawer }) {
  const [tab, setTab] = useState('schedule')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const tabs = [
    { key: 'schedule', label: '日程', icon: Calendar },
    { key: 'packing', label: '持ち物', icon: Package },
    { key: 'shopping', label: '買うもの', icon: ShoppingCart },
    { key: 'todo', label: 'やること', icon: CheckSquare },
    { key: 'reservation', label: '予約', icon: Ticket },
  ]

  return (
    <div className="app-shell">
      {trip.coverPhoto && (
        <div className="cover-banner no-print">
          <img src={trip.coverPhoto} alt="" />
        </div>
      )}
      <div className="detail-header no-print">
        <div className="detail-top-row">
          <button className="icon-btn" onClick={onBack}><ArrowLeft /></button>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => setShowEdit(true)}><Pencil size={19} /></button>
            <button className="icon-btn" onClick={() => window.print()}><Printer size={19} /></button>
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

      {showEdit && (
        <AddTripSheet
          initial={trip}
          onClose={() => setShowEdit(false)}
          onCreate={(updated) => { onUpdateTrip(updated); setShowEdit(false) }}
        />
      )}

      {trip.members && trip.members.length > 0 && (
        <div className="member-chips no-print">
          {trip.members.map((m, i) => (
            <span className="chip" key={i}><User size={12} />{m}</span>
          ))}
        </div>
      )}

      <div className="tabbar no-print">
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

      <div className="no-print">
        {tab === 'schedule' && <ScheduleTab trip={trip} onUpdateTrip={onUpdateTrip} />}
        {tab === 'packing' && <PackingTab packingList={trip.packingList || []} onChange={(l) => onUpdateTrip({ ...trip, packingList: l })} />}
        {tab === 'shopping' && <CheckListTab items={trip.shoppingList || []} onChange={(l) => onUpdateTrip({ ...trip, shoppingList: l })} placeholder="買うものを入力" />}
        {tab === 'todo' && <TodoTab todos={trip.todos || { pre: [], during: [], post: [] }} onChange={(t) => onUpdateTrip({ ...trip, todos: t })} />}
        {tab === 'reservation' && <ReservationTab reservations={trip.reservations || []} onChange={(r) => onUpdateTrip({ ...trip, reservations: r })} />}
      </div>

      <div className="delete-trip-wrap no-print">
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

      <PrintableTrip trip={trip} />
    </div>
  )
}

/* ---------- 印刷・PDF用の、しおり全体をまとめた表示 ---------- */
function PrintableTrip({ trip }) {
  const dateKeys = rangeDates(trip.startDate, trip.endDate)
  const renderCheckList = (items) => (
    <ul className="print-list">
      {(items || []).length === 0
        ? <li className="print-empty">(なし)</li>
        : items.map(i => <li key={i.id}>{i.checked ? '☑' : '☐'} {i.text}</li>)}
    </ul>
  )
  return (
    <div className="print-only print-sheet">
      {trip.coverPhoto && <img src={trip.coverPhoto} alt="" className="print-cover" />}
      <h1>{trip.emoji} {trip.name}</h1>
      <p className="print-sub">
        {trip.destination} ・ {fmtRange(trip.startDate, trip.endDate)}
        {trip.members && trip.members.length > 0 ? ` ・ メンバー: ${trip.members.join('、')}` : ''}
      </p>

      <h2>日程</h2>
      {dateKeys.map((k, i) => {
        const items = ((trip.days && trip.days[k]) || []).slice().sort((a, b) => a.time.localeCompare(b.time))
        return (
          <div key={k} className="print-day">
            <h3>Day{i + 1}({fmtMD(k)})</h3>
            {items.length === 0
              ? <p className="print-empty">予定なし</p>
              : items.map(item => (
                <div key={item.id} className="print-item">
                  <strong>{item.time}{item.endTime ? ` → ${item.endTime}` : ''}</strong>
                  {' '}【{item.category}】{item.title}
                  {(item.location || item.arrivalLocation) && (
                    <div className="print-detail">{item.location}{item.location && item.arrivalLocation ? ' → ' : ''}{item.arrivalLocation}</div>
                  )}
                  {item.reservationNumber && <div className="print-detail">予約番号: {item.reservationNumber}</div>}
                  {item.memo && <div className="print-detail">メモ: {item.memo}</div>}
                </div>
              ))}
          </div>
        )
      })}

      <h2>持ち物リスト</h2>
      {normalizePacking(trip.packingList).length === 0
        ? <p className="print-empty">(なし)</p>
        : normalizePacking(trip.packingList).map(g => (
          <div key={g.id} className="print-day">
            <h3>{g.name}</h3>
            {renderCheckList(g.items)}
          </div>
        ))}

      <h2>買うものリスト</h2>
      {renderCheckList(trip.shoppingList)}

      <h2>やることリスト</h2>
      <h4>旅行前</h4>
      {renderCheckList(trip.todos && trip.todos.pre)}
      <h4>旅行中</h4>
      {renderCheckList(trip.todos && trip.todos.during)}
      <h4>旅行後</h4>
      {renderCheckList(trip.todos && trip.todos.post)}

      <h2>予約情報</h2>
      {(!trip.reservations || trip.reservations.length === 0)
        ? <p className="print-empty">(なし)</p>
        : trip.reservations.map(r => (
          <div key={r.id} className="print-item">【{r.category}】{r.name}{r.number ? `(${r.number})` : ''}</div>
        ))}
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
