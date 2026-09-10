import { Link, NavLink } from 'react-router-dom'
import { useApp } from '../data/useApp.js'
import { streak } from '../data/activity.js'
import { NAV } from './navItems.js'

/** Empty when there is no name, which is the ordinary state of a new reader. */
const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Desktop and tablet: sticky glass bar with a pill nav group. */
export function TopNav() {
  const { settings, sessions } = useApp()
  const days = streak(sessions)

  return (
    <nav
      className="sticky top-0 z-20 hidden h-[70px] items-center justify-between gap-5 border-b border-line-soft px-6 backdrop-blur-[14px] backdrop-saturate-150 sm:flex"
      style={{ background: 'var(--glass)' }}
    >
      {/*
        The two sides share the leftover space equally so the pill between them
        lands on the middle of the bar.

        `justify-between` alone does not do that. It puts the gaps between the
        three, so the middle one is centred only when the outer two happen to
        be the same width — and they never are here: a logo on one side, a
        streak that reads "No streak yet" or "12 day streak" on the other. The
        pill sat 55px left of centre, which is half the difference between
        them, and moved every time the streak's wording changed.
      */}
      <Link to="/" className="flex flex-1 shrink-0 items-center gap-[11px]">
        <img src="/assets/gunit-logo.png" alt="Gunit" className="block h-10 w-auto" />
      </Link>

      <div className="flex shrink-0 gap-[3px] overflow-auto rounded-full border border-line-soft bg-raised p-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `cursor-pointer rounded-full px-4 py-[9px] whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-surface text-ink shadow-sh1 font-semibold text-[13.5px]'
                  : 'text-ink-3 hover:text-ink text-[13.5px] font-medium'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {/*
        No theme toggle here.

        It was a second control for a setting that already has one, on
        Settings under Appearance, where the rest of the preferences are. Two
        places to change the same thing is two places to look for it, and the
        nav is the wrong one — it is for going somewhere, and everything else
        in this bar says where you are or what you have done.
      */}
      <div className="flex flex-1 shrink-0 items-center justify-end gap-2.5">
        <div className="flex items-center gap-[9px] rounded-full border border-line bg-surface py-1 pr-3 pl-1">
          {/* Dropped rather than drawn empty: a blank disc reads as a missing
              avatar, and there is nothing missing. */}
          {initialsOf(settings.name) && (
            <span className="grid h-7 w-7 place-items-center rounded-full border border-accent-line bg-accent-soft text-[11px] leading-none font-semibold text-accent">
              {initialsOf(settings.name)}
            </span>
          )}
          <span className="kicker !tracking-[0.1em] whitespace-nowrap">
            {days ? `${days} day streak` : 'No streak yet'}
          </span>
        </div>
      </div>
    </nav>
  )
}

/** Phone: sticky bottom tab bar, active tab marked by a top rule. */
export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-20 flex border-t border-line bg-paper sm:hidden">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 cursor-pointer flex-col items-center gap-1.5 border-t-2 px-1 pt-3 pb-3.5 ${
              isActive ? 'border-ink text-ink' : 'border-transparent text-ink-3'
            }`
          }
        >
          <span className="font-mono text-[10px] leading-none font-medium tracking-[0.06em] uppercase">
            {item.short}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
