import { useCallback, useEffect, useState } from 'react'
import { drawShareCard, shareText, FORMATS } from '../lib/shareCard.js'
import { shareImage } from '../lib/shareImage.js'
import { useBackClose } from '../lib/backStack.js'

/**
 * "Share my stamp" button and its sheet: a preview of the picture, Story or Square, then the
 * phone's share menu. `card` is what drawShareCard needs (src/lib/shareCard.js).
 */
export default function ShareStamp({ card, label = 'Share my stamp', className = '' }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useBackClose(open, close)
  return (
    <>
      <button type="button" className={`share-btn ${className}`} onClick={() => setOpen(true)} data-share-stamp>
        <span aria-hidden="true">↑</span> {label}
      </button>
      {open && <ShareSheet card={card} onClose={close} />}
    </>
  )
}

function ShareSheet({ card, onClose }) {
  const [format, setFormat] = useState('story')
  const [made, setMade] = useState(null) // { format, blob, url }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  // The parent rebuilds `card` on every render (page swipes), so key the drawing on its content.
  const cardKey = JSON.stringify(card)
  useEffect(() => {
    let live = true
    let url = null
    drawShareCard(JSON.parse(cardKey), format).then((blob) => {
      url = URL.createObjectURL(blob)
      if (live) setMade({ format, blob, url })
    }, (e) => { if (live) setError(e.message) })
    return () => { live = false; if (url) URL.revokeObjectURL(url) }
  }, [cardKey, format])

  const preview = made?.format === format ? made : null
  const title = card.kind === 'finisher' ? 'Finisher stamp' : `${card.province} stamp`

  const share = async () => {
    if (!preview) return
    setBusy(true); setError(''); setNote('')
    try {
      const slug = card.kind === 'finisher' ? 'finisher' : card.province.toLowerCase().replace(/[^a-z]+/g, '-')
      const how = await shareImage(preview.blob, {
        filename: `rtbc-${slug}-${format}.png`, text: shareText(card), title,
      })
      if (how === 'shared') onClose()
      if (how === 'downloaded') setNote('Picture saved. Post it from your phone or computer.')
    } catch (e) {
      setError(e.message || 'Sharing didn’t work. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={`Share your ${title}`} onClick={onClose}>
      <div className="sheet share-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div><small>SHARE</small><h2>{title}</h2></div>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="share-seg" role="tablist">
          {Object.entries(FORMATS).map(([k, f]) => (
            <button key={k} type="button" role="tab" aria-selected={format === k} className={format === k ? 'on' : ''}
              onClick={() => setFormat(k)}>{f.label}</button>
          ))}
        </div>
        <div className={`share-preview ${format}`}>
          {preview ? <img src={preview.url} alt={`${title} share picture`} /> : <span className="muted small">Making your picture…</span>}
        </div>
        <p className="hint center">{format === 'story' ? 'For Instagram and Facebook Stories and WhatsApp Status.' : 'For feed posts on Instagram, Facebook and Strava.'}</p>
        {error && <div className="error">{error}</div>}
        {note && <p className="small center">{note}</p>}
        <button type="button" className="btn block" onClick={share} disabled={!preview || busy}>
          {busy ? 'Opening…' : 'Share'}
        </button>
      </div>
    </div>
  )
}
