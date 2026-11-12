// Simple line icons for the main tabs (stroke = currentColor)
const P = {
  passport: <><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="10" r="3.2" /><path d="M8.5 17h7" /></>,
  race: <><path d="M12 21s-6-5.6-6-10.5A6 6 0 0 1 18 10.5C18 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></>,
  results: <><circle cx="12" cy="14" r="5" /><path d="M9.5 9.6 7 3h4l1 3 1-3h4l-2.5 6.6" /><path d="m10.4 14 1.1 1.1 2.2-2.2" /></>,
  review: <><path d="M12 3 5 6v5c0 4.4 3 8.2 7 10 4-1.8 7-5.6 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
}
export default function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  )
}
