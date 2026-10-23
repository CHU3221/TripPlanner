import { koKR as koKRLocale } from './locales/ko-KR'

export type LocaleId='ko-KR'
// Compatibility export: existing components/tests can keep importing `koKR` while
// locale payloads live in dedicated files.
export const koKR=koKRLocale
export const catalogs={ 'ko-KR':koKR } as const
export const DEFAULT_LOCALE:LocaleId='ko-KR'

// UI copy entry point. Components import only `text`; locale selection can be added later
// without moving product wording back into JSX/TSX files.
export const text=catalogs[DEFAULT_LOCALE]
