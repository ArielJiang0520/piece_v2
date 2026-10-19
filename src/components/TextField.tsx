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

const labelBaseClass = 't-label'
const inputBaseClass = 'input'
const searchInputBaseClass =
  'block h-10 w-full rounded-full border-0 bg-paper-2 pl-10 pr-10 text-[16px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-rose/30 disabled:opacity-50'
const textareaBaseClass = 'textarea'

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
        <div className="mb-1.5">
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
              className={leadingAdornmentClassName ?? 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2'}
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
