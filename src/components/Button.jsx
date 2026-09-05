const base =
  'inline-flex items-center justify-center gap-2.5 rounded-lg border font-semibold whitespace-nowrap ' +
  'cursor-pointer transition-[background-color,border-color,color,transform] duration-150 ' +
  'ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.975] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:opacity-55 disabled:pointer-events-none aria-disabled:opacity-55'

// The prototype's primary action is ink-on-paper, not the green accent — the
// accent is reserved for progress, badges and correctness marks.
const variants = {
  primary: 'border-ink bg-ink text-paper hover:bg-ink-2 hover:border-ink-2',
  outline: 'border-line bg-transparent text-ink hover:border-ink-3 hover:bg-raised',
  ghost: 'border-transparent bg-transparent text-ink-2 hover:text-ink hover:bg-raised',
  danger: 'border-err bg-err text-paper hover:opacity-90',
  quiet: 'border-line bg-transparent text-ink-2 hover:border-ink-3 hover:text-ink',
}

const sizes = {
  sm: 'px-4 py-2.5 text-[13px] leading-none',
  md: 'px-[18px] py-3 text-[14px] leading-none',
}

export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  const typeProp = Component === 'button' ? { type: props.type ?? 'button' } : {}
  return (
    <Component
      {...typeProp}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}
