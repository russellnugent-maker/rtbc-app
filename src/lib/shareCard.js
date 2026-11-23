// Share pictures for a verified stamp or the finisher stamp (to-do #97).
// Drawn on a canvas on the phone, so nothing is uploaded: Story 1080 × 1920, Square 1080 × 1080.
// No runner name or passport number on the picture (Russell, 23 Nov).
import { WEB_HOST, WEB_ORIGIN } from './routes.js'

export const FORMATS = {
  story: { w: 1080, h: 1920, label: 'Story' },
  square: { w: 1080, h: 1080, label: 'Square post' },
}

const C = {
  forest: '#123A2C', forestDeep: '#0B261C', forestLight: '#1D5440',
  gold: '#D2B270', on: '#E3D9BF', white: '#FFFFFF', ring: 'rgba(210,178,112,0.35)',
}
const SERIF = 'Georgia, "Times New Roman", serif'
const SANS = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif'

/** Link that goes with every share; ?ref=share lets entries from shares be counted (captureRef). */
export const SHARE_URL = `${WEB_ORIGIN}/?ref=share`

export function shareText(card) {
  if (card.kind === 'finisher') {
    return `I ran the beloved country: a half marathon or longer in all nine provinces of South Africa. #RunTheBelovedCountry ${SHARE_URL}`
  }
  return `${card.province} stamp earned: ${card.count} of 9 provinces in Run the Beloved Country. #RunTheBelovedCountry ${SHARE_URL}`
}

const distanceLabel = (m) => (m >= 43000 ? 'ULTRA' : m >= 30000 ? '42.2 KM' : '21.1 KM')

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the stamp artwork'))
    img.src = src
  })
}

function text(ctx, str, x, y, { font, color, spacing = 0, align = 'center' }) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
  ctx.fillText(str, x, y)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
}

/** Shrinks the font until the line fits the width. */
function fitText(ctx, str, x, y, maxW, { size, family, weight = '', ...rest }) {
  let s = size
  ctx.font = `${weight} ${s}px ${family}`
  while (s > 18 && ctx.measureText(str).width > maxW) { s -= 2; ctx.font = `${weight} ${s}px ${family}` }
  text(ctx, str, x, y, { font: `${weight} ${s}px ${family}`, ...rest })
}

function background(ctx, w, h, cx, cy) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75)
  g.addColorStop(0, C.forestLight)
  g.addColorStop(0.45, C.forest)
  g.addColorStop(1, C.forestDeep)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function stamp(ctx, img, cx, cy, size, deg) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 16
  const ratio = img.naturalHeight / img.naturalWidth || 1
  ctx.drawImage(img, -size / 2, (-size * ratio) / 2, size, size * ratio)
  ctx.restore()
}

function dots(ctx, cx, y, filled, r, gap) {
  const total = 9
  const width = total * r * 2 + (total - 1) * gap
  let x = cx - width / 2 + r
  ctx.lineWidth = Math.max(3, r / 4)
  for (let i = 0; i < total; i++) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.strokeStyle = C.gold
    if (i < filled) { ctx.fillStyle = C.gold; ctx.fill() }
    ctx.stroke()
    x += r * 2 + gap
  }
}

function footer(ctx, w, y) {
  ctx.strokeStyle = C.ring
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(w * 0.12, y - 52); ctx.lineTo(w * 0.88, y - 52); ctx.stroke()
  text(ctx, WEB_HOST.toUpperCase(), w / 2, y, { font: `600 30px ${SANS}`, color: C.gold, spacing: 4 })
}

/**
 * card: { kind: 'stamp', province, stampSrc, raceName, raceDate, distanceM, finishTime, count }
 *    or { kind: 'finisher', stampSrc, races, totalKm, months }
 * Returns a PNG Blob.
 */
export async function drawShareCard(card, format = 'story') {
  const { w, h } = FORMATS[format]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const img = await loadImage(card.stampSrc)
  const story = format === 'story'
  const cx = w / 2

  if (card.kind === 'finisher') {
    background(ctx, w, h, cx, h * 0.42)
    const top = story ? 230 : 120
    text(ctx, 'ALL NINE PROVINCES', cx, top, { font: `700 34px ${SANS}`, color: C.gold, spacing: 8 })
    const size = story ? 720 : 470
    const sy = story ? 760 : 455
    stamp(ctx, img, cx, sy, size, -5)
    const ty = story ? 1300 : 800
    fitText(ctx, 'I RAN THE BELOVED COUNTRY', cx, ty, w * 0.86, { size: story ? 70 : 60, family: SERIF, color: C.white, spacing: 3 })
    const km = Math.round(card.totalKm)
    const line = `${card.races} races · ${km} km${card.months ? ` · ${card.months} month${card.months === 1 ? '' : 's'}` : ''}`
    text(ctx, line, cx, ty + (story ? 90 : 70), { font: `400 ${story ? 40 : 34}px ${SANS}`, color: C.on })
    footer(ctx, w, h - (story ? 120 : 60))
  } else if (story) {
    background(ctx, w, h, cx, h * 0.36)
    text(ctx, 'STAMP EARNED', cx, 200, { font: `700 34px ${SANS}`, color: C.gold, spacing: 9 })
    fitText(ctx, 'RUN THE BELOVED COUNTRY', cx, 290, w * 0.86, { size: 70, family: SERIF, color: C.white, spacing: 3 })
    stamp(ctx, img, cx, 700, 700, -7)
    fitText(ctx, `${card.province} ✓`, cx, 1170, w * 0.86, { size: 92, family: SERIF, color: C.gold })
    fitText(ctx, `${card.raceName} · ${card.raceDate}`, cx, 1250, w * 0.86, { size: 40, family: SANS, color: C.on })
    text(ctx, `FINISH TIME · ${distanceLabel(card.distanceM)}`, cx, 1370, { font: `700 30px ${SANS}`, color: C.gold, spacing: 6 })
    text(ctx, card.finishTime, cx, 1480, { font: `400 112px ${SERIF}`, color: C.white, spacing: 2 })
    dots(ctx, cx, 1590, card.count, 24, 20)
    text(ctx, `${card.count} OF 9 PROVINCES`, cx, 1680, { font: `700 36px ${SANS}`, color: C.on, spacing: 5 })
    footer(ctx, w, h - 110)
  } else {
    background(ctx, w, h, w * 0.3, h * 0.5)
    stamp(ctx, img, 280, 540, 430, -8)
    const x = 540, maxW = w - x - 60
    text(ctx, `STAMP EARNED · ${card.count} OF 9`, x, 250, { font: `700 28px ${SANS}`, color: C.gold, spacing: 5, align: 'left' })
    fitText(ctx, 'RUN THE BELOVED COUNTRY', x, 310, maxW, { size: 44, family: SERIF, color: C.white, spacing: 1, align: 'left' })
    fitText(ctx, `${card.province} ✓`, x, 430, maxW, { size: 72, family: SERIF, color: C.gold, align: 'left' })
    fitText(ctx, card.raceName, x, 500, maxW, { size: 36, family: SANS, color: C.on, align: 'left' })
    text(ctx, card.raceDate, x, 548, { font: `400 36px ${SANS}`, color: C.on, align: 'left' })
    text(ctx, `FINISH TIME · ${distanceLabel(card.distanceM)}`, x, 640, { font: `700 26px ${SANS}`, color: C.gold, spacing: 4, align: 'left' })
    text(ctx, card.finishTime, x, 730, { font: `400 88px ${SERIF}`, color: C.white, align: 'left' })
    const r = 15, gap = 12
    dots(ctx, x + (9 * r * 2 + 8 * gap) / 2, 800, card.count, r, gap)
    text(ctx, WEB_HOST.toUpperCase(), x, 900, { font: `600 26px ${SANS}`, color: C.gold, spacing: 3, align: 'left' })
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png'))
}
