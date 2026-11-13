// npm run check:native — builds both bundles and proves the store app leaves out what the build
// spec says it must (§1: the app never sells anything and never creates accounts; §2: the YNM
// offer is not linked or mentioned). Each "must have" anchor proves the search ran on the right
// files: a check that finds nothing because it looked in the wrong place would pass silently.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WEB_ORIGIN } from '../src/lib/routes.js'

const run = (cmd) => execSync(cmd, { stdio: 'pipe' })
run('npm run build')
run('npm run build:native')

const read = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
const web = read('dist/app/assets')
const native = read('dist-native/assets')

const ABSENT_IN_NATIVE = [
  ['YNM offer link', 'yournextmove.run'],
  ['YNM 50% offer', '50% off'],
  ['account creation', 'Create account'],
  ['magic link', 'Email me a sign-in link'],
  ['entry checkout', 'rtbc-entry'],
  ['review queue', 'Open certificate again'],
]
const PRESENT_IN_NATIVE = [
  ['email code sign-in', '-digit code'],
  ['enter on the website', 'on the website'],
  ['web callback for auth emails', WEB_ORIGIN],
]

let failed = 0
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failed++ }
const count = (hay, needle) => hay.split(needle).length - 1

for (const [what, s] of ABSENT_IN_NATIVE) {
  // The anchor for an absence: the same string IS in the web bundle, so the search is real.
  check(count(web, s.replace(/[<>]/g, '')) > 0, `web bundle has ${what} (anchor)`)
  check(count(native, s) === 0, `native bundle has no ${what}: ${count(native, s)} found`)
}
for (const [what, s] of PRESENT_IN_NATIVE) check(count(native, s) > 0, `native bundle has ${what}`)

console.log(failed ? `\n${failed} check(s) failed` : '\nAll native bundle checks passed')
process.exit(failed ? 1 : 0)
