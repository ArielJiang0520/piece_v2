import { useCallback, useState } from 'react'

export interface WorldFormValues {
  name: string
  origin: string
  summary: string
  body: string
  register_id: number | null
}

export const emptyWorldForm: WorldFormValues = {
  name: '',
  origin: 'original',
  summary: '',
  body: '',
  register_id: 1,
}

export function useWorldForm(initialValues: WorldFormValues = emptyWorldForm) {
  const [values, setValues] = useState<WorldFormValues>(initialValues)

  const setField = useCallback(<K extends keyof WorldFormValues>(field: K, value: WorldFormValues[K]) => {
    setValues(current => ({ ...current, [field]: value }))
  }, [])

  const reset = useCallback((nextValues: WorldFormValues) => {
    setValues(nextValues)
  }, [])

  return { values, setField, reset }
}
