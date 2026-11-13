import { Link } from 'react-router-dom'
import { NATIVE } from '../lib/platform.js'
import { webAppUrl } from '../lib/routes.js'

// Entry is sold on the website only (build spec §1). On the web this is the in-app /enter route;
// in the store app it is an ordinary link out to the website, labelled as such.
export default function EnterLink({ className = 'btn block', children }) {
  if (!NATIVE) return <Link className={className} to="/enter">{children}</Link>
  return (
    <a className={className} href={webAppUrl('/enter')} target="_blank" rel="noopener noreferrer" data-enter-on-web>
      {children} on the website
    </a>
  )
}
