import { useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import useHideOnScroll from '../hooks/useHideOnScroll.js'
import { useApp } from '../data/useApp.js'
import { streak } from '../data/activity.js'
import { isConfigured } from '../data/supabase.js'
import { NAV } from './navItems.js'
import { BellIcon, DecksIcon, HomeIcon, SettingsIcon, SharedIcon } from './Icons.jsx'
import NotificationBell from './NotificationBell.jsx'
import { useNotifications } from '../data/notificationsContext.js'
import useT from '../i18n/useT.js'
import Avatar from './Avatar.jsx'
import useAvatar from '../data/useAvatar.js'
import useTightBar from '../hooks/useTightBar.js'
import useHomeRefresh from '../hooks/useHomeRefresh.js'

const ITEMS = NAV.filter((item) => !item.accounts || isConfigured)
const TOP_ITEMS = ITEMS.filter((item) => !item.phoneOnly)

/** Desktop and tablet: sticky glass bar with a pill nav group. */
export function TopNav() {
  const { settings, sessions } = useApp()
  const { t } = useT()
  const { src } = useAvatar()
  const days = streak(sessions)
  const bar = useRef(null)
  const tight = useTightBar(bar)

  return (
    <nav
      ref={bar}
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

        When the words get longer — Filipino, or large text — something has to
        give on a narrow screen, and it gives in order of how little it is
        missed: first the streak label steps out (useTightBar); last, the tabs
        scroll inside their pill rather than push the page sideways. The logo
        and the picture never shrink.
      */}
      <Link to="/" className="flex min-w-fit flex-1 shrink-0 items-center gap-[11px]">
        <img src="/assets/gunit-logo.png" alt="Gunit" className="block h-10 w-auto shrink-0" />
      </Link>

      <div className="flex min-w-0 gap-[3px] overflow-x-auto rounded-full border border-line-soft bg-raised p-1 [scrollbar-width:none]">
        {TOP_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `cursor-pointer rounded-full px-4 py-[9px] whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-surface text-ink shadow-sh1 font-semibold fs-13.5'
                  : 'text-ink-3 hover:text-ink fs-13.5 font-medium'
              }`
            }
          >
            {t(`nav.${item.icon}`)}
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
        {isConfigured && <NotificationBell />}
        <div
          className={`flex items-center gap-[9px] rounded-full border border-line bg-surface py-1 pl-1 ${
            tight ? 'pr-1' : 'pr-3'
          }`}
        >
          {/*
            The reader's picture, or their initials, or a plain figure: always
            something, so the chip reads as theirs. Named for a screen reader
            only when it is a picture — initials say nothing a reader needs.
          */}
          <Avatar src={src} name={settings.name} size={28} alt={src ? t('avatar.yours') : undefined} />
          {!tight && (
            <span data-streak className="kicker !tracking-[0.1em] whitespace-nowrap">
              {days ? t('nav.streak', { count: days }) : t('nav.noStreak')}
            </span>
          )}
        </div>
      </div>
    </nav>
  )
}

/** Phone: sticky bottom tab bar, active tab marked by a top rule. */
const ICONS = { home: HomeIcon, decks: DecksIcon, shared: SharedIcon, alerts: BellIcon, settings: SettingsIcon }

/**
 * Phone: a tab bar along the bottom, where a thumb already is.
 *
 * Three things it did not do before, and the first two are not decoration.
 *
 * The tabs were 38 pixels tall. Apple and Google both publish 44 as the
 * smallest a target should be, and the difference is felt by anyone using this
 * one-handed on a bus. They are 56 now, which also gives the labels room to
 * stop being 10px.
 *
 * And it sat flush against the bottom of the screen, so on any phone with a
 * home indicator the labels were underneath the gesture bar. The safe-area
 * inset is what the browser offers for exactly this; it is zero everywhere
 * else, so it costs nothing on a device that does not need it.
 *
 * The inactive tabs are text-ink-2, not the text-ink-3 this app usually uses
 * for things that recede. At ten pixels that grey measures 3.99:1 against the
 * background, under the 4.5:1 WCAG AA asks for, and a tab bar is not a place
 * to be subtle at the cost of being legible. The active tab is told apart by
 * hue and by the mark above it, not by the other two being faint.
 *
 * Icons only, on screen: the words under them are gone, for a quieter bar.
 * Each tab still has its name — in a span only a screen reader sees — so it
 * is announced as "Home, link" rather than as nothing, and the icons stay
 * aria-hidden so it is not announced twice.
 *
 * It floats: a pill inset from the edges and lifted clear of the home
 * indicator by the safe-area inset, rather than a strip welded to the bottom
 * of the screen. It steps aside while the reader scrolls down and comes back
 * as soon as they scroll up (useHideOnScroll). Hidden, it is moved, not
 * removed — the page keeps the same space for it at the bottom either way, so
 * nothing jumps, and it cannot be tapped while out of sight. With reduced
 * motion it fades rather than slides.
 *
 * The tabs are the same NavLinks as ever, so a quiz with answers in it still
 * asks before one of them takes the reader away.
 *
 * Home, tapped while already home, reloads the app — the way a phone reader
 * reaches for "refresh" — after the icon turns once, so the tap is seen to
 * have landed (useHomeRefresh). From anywhere else it is an ordinary link.
 * The wide screen's top bar has no such thing, and does not change.
 */
export function BottomNav() {
  const { unread } = useNotifications()
  const { t } = useT()
  const { pathname } = useLocation()
  const ref = useRef(null)
  useHideOnScroll(ref, { resetKey: pathname })
  const { refreshing, refresh } = useHomeRefresh()

  return (
    <>
      {/* The room it floats in, kept whether it is showing or not. */}
      <div aria-hidden="true" className="h-[calc(56px+22px+env(safe-area-inset-bottom))] shrink-0 sm:hidden" />
      <nav
        ref={ref}
        data-hidden="false"
        className={
          'fixed right-[max(12px,env(safe-area-inset-right))] bottom-[calc(env(safe-area-inset-bottom)+10px)] left-[max(12px,env(safe-area-inset-left))] z-20 flex overflow-hidden rounded-full border border-line-soft px-1.5 shadow-sh3 backdrop-blur-[14px] backdrop-saturate-150 sm:hidden ' +
          'transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ' +
          'data-[hidden=true]:pointer-events-none data-[hidden=true]:translate-y-[calc(100%+10px+env(safe-area-inset-bottom))] data-[hidden=true]:opacity-0 ' +
          'motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:data-[hidden=true]:translate-y-0'
        }
        style={{ background: 'var(--glass)' }}
      >
        {ITEMS.map((item) => {
          const Icon = ICONS[item.icon]
          const home = item.icon === 'home'
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={home && pathname === '/' ? refresh : undefined}
              aria-busy={home && refreshing ? true : undefined}
              className={({ isActive }) =>
                `relative flex min-h-[56px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 px-1 transition-colors ${
                  isActive ? 'text-accent' : 'text-ink-2'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/*
                    A mark above the active tab as well as the colour. Colour on
                    its own is not a state anyone can see in greyscale, and
                    NavLink's aria-current only speaks to a screen reader.
                  */}
                  <span
                    aria-hidden="true"
                    className={`absolute top-1 h-[2px] rounded-full transition-[background-color,width] duration-300 ${
                      isActive ? 'bg-accent' : 'bg-transparent'
                    } ${home && refreshing ? 'w-9' : 'w-7'}`}
                  />
                  <span className={`relative ${home && refreshing ? 'home-refresh' : ''}`}>
                    <Icon size={22} />
                    {item.icon === 'alerts' && unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-paper bg-accent">
                        <span className="sr-only">{t('nav.unread', { count: unread })}</span>
                      </span>
                    )}
                  </span>
                  <span className="sr-only">{t(`nav.short.${item.icon}`)}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
