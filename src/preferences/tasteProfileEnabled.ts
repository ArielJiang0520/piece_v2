import { createPreference } from './createPreference'

// Whether the reader's distilled taste profile is fed into generation. A localStorage
// preference (like model/theme) read at generation time and sent as `useTaste`, so the
// reader can turn the whole thing off without deleting anything. Default on.
const tasteProfileEnabledPreference = createPreference<boolean>({
  key: 'piece:taste-enabled',
  defaultValue: true,
  parse: raw => raw === null ? true : raw === 'true',
  serialize: value => (value ? 'true' : 'false'),
})

export const setTasteProfileEnabled = tasteProfileEnabledPreference.set
export const useTasteProfileEnabled = tasteProfileEnabledPreference.use
export const getTasteProfileEnabled = tasteProfileEnabledPreference.get
