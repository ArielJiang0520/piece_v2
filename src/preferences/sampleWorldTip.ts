import { createPreference } from './createPreference'

const sampleWorldTipDismissedPreference = createPreference<boolean>({
  key: 'piece:sample-world-tip-dismissed',
  defaultValue: false,
  parse: raw => raw === 'true',
})

export const dismissSampleWorldTip = () => sampleWorldTipDismissedPreference.set(true)
export const useSampleWorldTipDismissed = sampleWorldTipDismissedPreference.use
