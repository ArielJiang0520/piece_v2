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

const labelBaseClass = 'mb-1 block text-sm uppercase tracking-wide text-ink-3'
const inputBaseClass =
  'w-full rounded-sm border border-paper-3 bg-paper-2 px-3 py-2 text-base sm:text-sm text-ink placeholder-ink-3 focus:border-rose focus:outline-none disabled:opacity-50'
const searchInputBaseClass =
  'w-full rounded-md border border-paper-3 bg-paper py-2.5 pl-9 pr-9 text-base sm:text-sm text-ink placeholder:text-ink-4 focus:border-ink-4/40 focus:outline-none focus:ring-2 focus:ring-rose/20 disabled:opacity-50'
const textareaBaseClass = `${inputBaseClass} resize-y`

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
  const fontClass = mono ? 'font-mono' : ''
  const className = [
    multiline ? textareaBaseClass : variant === 'search' ? searchInputBaseClass : inputBaseClass,
    fontClass,
    fieldClassName,
  ].filter(Boolean).join(' ')
  const hasAdornment = !multiline && (leadingAdornment || trailingAdornment)

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={fieldId} className={labelClassName ?? labelBaseClass}>
          {label}
        </label>
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
