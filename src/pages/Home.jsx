import { useAuth } from '../data/useAuth.js'
import Dashboard from './Dashboard.jsx'
import Landing from './Landing.jsx'

/**
 * What `/` is, which depends on who is asking.
 *
 * The dashboard is somebody's own library — their streak, their decks, what is
 * due — and showing it to a visitor who has not signed in says nothing about
 * what this is. So a signed-out visitor gets the landing page and a signed-in
 * one gets exactly the dashboard they had before. Nothing else about either is
 * touched, and no other route changes.
 *
 * Two cases that are not simply "signed in or not":
 *
 * A copy with no Supabase project has no accounts to offer, so the landing
 * page would be two buttons leading to "this copy of Gunit is local only".
 * That copy keeps the dashboard, which is what it has always shown and what
 * the README promises a clone with no `.env` will do.
 *
 * And a configured project restores its session from storage before it can say
 * who this is. Answering during that moment means showing one page and then
 * replacing it — every returning reader would watch the landing page flash
 * past on the way to their decks. A blank beat is the better of the two.
 */
export default function Home(props) {
  const { available, status, user } = useAuth()
  if (!available) return <Dashboard {...props} />
  if (status === 'loading') return null
  return user ? <Dashboard {...props} /> : <Landing />
}
