import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

type SharedTextFieldProps = {
  label?: ReactNode
  containerClassName?: string
  fieldClassName?: string
  labelClassName?: string
  mono?: boolean
  variant?: 'default' | 'search'
  leadingAdornment?: ReactNode
  trailingAdornment?: ReactNode
  leadingAdornmentClassName?: string
  trailingAdornmentClassName?: string
}

type InputTextFieldProps = SharedTextFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    multiline?: false
  }

type TextareaTextFieldProps = SharedTextFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    multiline: true
  }

type TextFieldProps = InputTextFieldProps | TextareaTextFieldProps

const labelBaseClass = 't-eyebrow eyebrow-rule'
const inputBaseClass =
  'w-full border-b border-rose-line bg-transparent px-0 py-2.5 text-xl leading-snug text-ink placeholder:text-ink-4 focus:border-rose focus:outline-none disabled:opacity-50'
const searchInputBaseClass =
  'w-full rounded-full border border-rose-line bg-paper py-2.5 pl-9 pr-9 italic text-[15px] text-ink placeholder:text-ink-4 placeholder:italic focus:border-rose/40 focus:outline-none focus:ring-2 focus:ring-rose/15 disabled:opacity-50'
const textareaBaseClass =
  'w-full resize-y border-y border-rose-line bg-transparent px-0 py-4 text-[16px] leading-8 text-ink placeholder:text-ink-4 focus:border-rose focus:outline-none disabled:opacity-50'

export default function TextField({
  id,
  label,
  containerClassName,
  fieldClassName,
  labelClassName,
  mono = false,
  variant = 'default',
  leadingAdornment,
  trailingAdornment,
  leadingAdornmentClassName,
  trailingAdornmentClassName,
  multiline = false,
  ...fieldProps
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const fontClass = mono ? 'font-mono' : 'font-serif-zh'
  const className = [
    multiline ? textareaBaseClass : variant === 'search' ? searchInputBaseClass : inputBaseClass,
    fontClass,
    fieldClassName,
  ].filter(Boolean).join(' ')
  const hasAdornment = !multiline && (leadingAdornment || trailingAdornment)

  return (
    <div className={containerClassName}>
      {label && (
        <div className="mb-3">
          <label htmlFor={fieldId} className={labelClassName ?? labelBaseClass}>
            {label}
          </label>
        </div>
      )}
      {multiline ? (
        <textarea
          id={fieldId}
          className={className}
          {...(fieldProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : hasAdornment ? (
        <div className="relative">
          {leadingAdornment && (
            <span
              className={leadingAdornmentClassName ?? 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2'}
            >
              {leadingAdornment}
            </span>
          )}
          <input
            id={fieldId}
            className={className}
            {...(fieldProps as InputHTMLAttributes<HTMLInputElement>)}
          />
          {trailingAdornment && (
            <span
              className={trailingAdornmentClassName ?? 'absolute right-2 top-1/2 -translate-y-1/2'}
            >
              {trailingAdornment}
            </span>
          )}
        </div>
      ) : (
        <input
          id={fieldId}
          className={className}
          {...(fieldProps as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </div>
  )
}
