import { useRef, useState } from 'react'
import { NATIVE } from '../lib/platform.js'
import { takeOrChoosePhoto } from '../lib/pickPhoto.js'

// A photo (or PDF) field for the result form.
// Web: the plain file input, as before. Store app: "Take or choose a photo" (camera or photo
// library, see src/lib/pickPhoto.js) and, where a PDF is allowed, "Choose a PDF".
export default function FileField({ id, accept, allowPdf = false, file, onChange, header }) {
  const pdf = useRef(null)
  const [err, setErr] = useState('')

  if (!NATIVE) {
    return <input id={id} type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} />
  }

  const photo = async () => {
    setErr('')
    try {
      const f = await takeOrChoosePhoto(header)
      if (f) onChange(f)
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="file-field" id={id} data-file-field>
      {file ? (
        <div className="file-chosen">
          <span>{file.type === 'application/pdf' ? `PDF: ${file.name}` : 'Photo added'}</span>
          <button type="button" className="link-btn" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <div className="file-buttons">
          <button type="button" className="btn secondary" onClick={photo}>Take or choose a photo</button>
          {allowPdf && (
            <>
              <button type="button" className="btn secondary" onClick={() => pdf.current?.click()}>Choose a PDF</button>
              <input ref={pdf} type="file" accept="application/pdf" hidden
                onChange={(e) => { onChange(e.target.files?.[0] || null); e.target.value = '' }} />
            </>
          )}
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
    </div>
  )
}
