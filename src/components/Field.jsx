import useT from '../i18n/useT.js'

const inputStyles =
  'rounded-lg border border-line bg-paper px-3 py-[11px] fs-15 text-ink outline-none ' +
  'placeholder:text-ink-3/70 transition-colors focus:border-accent'

/**
 * Label + control, with the prototype's mono uppercase label treatment.
 * `optional` renders the lowercase "optional" tag; `required` the accent asterisk.
 */
export default function Field({
  id,
  label,
  as = 'input',
  required = false,
  optional = false,
  className = '',
  serif = false,
  ...props
}) {
  const Control = as
  const { t } = useT()
  return (
    <label htmlFor={id} className="flex flex-col gap-[7px]">
      <span className="kicker !tracking-[0.12em]">
        {label}
        {required && <span className="text-accent"> *</span>}
        {optional && <span className="normal-case tracking-normal opacity-70"> {t('field.optional')}</span>}
      </span>
      <Control
        id={id}
        className={`${inputStyles} ${serif ? 'font-serif fs-17 leading-[1.4]' : ''} ${
          as === 'textarea' ? 'resize-y' : ''
        } ${className}`}
        {...props}
      />
    </label>
  )
}
