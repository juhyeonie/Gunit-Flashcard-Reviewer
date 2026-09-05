export default function Toast({ message }) {
  if (!message) return null
  return (
    <div className="toast-in fixed bottom-7 left-1/2 z-60 flex -translate-x-1/2 items-center gap-3 rounded-[7px] bg-ink px-[18px] py-[13px] text-paper shadow-sh3">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="text-[13px] font-medium leading-none">{message}</span>
    </div>
  )
}
