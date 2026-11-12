import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../App.jsx'
import ResultForm from '../components/ResultForm.jsx'

export default function Submit() {
  const { passport, session } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  return (
    <>
      <h1>Add a race result</h1>
      <p className="muted small">Submit within 30 days of the race. We check it against the official results, usually within 7 days, and the stamp is pressed into your passport once it’s verified.</p>
      <div className="card">
        <ResultForm passport={passport} session={session} province={params.get('province') || undefined}
          onDone={(id) => { try { sessionStorage.setItem('rtbc_goto_sub', id) } catch { /* ignore */ } nav('/') }} />
      </div>
    </>
  )
}
