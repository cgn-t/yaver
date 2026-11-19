import { createContext, useContext } from 'react'
import type { NewWorkItem } from '../data/store'

export const UiContext = createContext<{ openNew: (initial?: Partial<NewWorkItem>) => void; openPalette: () => void }>({
  openNew: () => {}, openPalette: () => {},
})
export const useUi = () => useContext(UiContext)
