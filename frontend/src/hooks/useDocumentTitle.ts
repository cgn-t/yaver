import { useEffect } from 'react'

/** Tarayıcı sekmesi başlığını "YAVER · <sayfa>" yapar. */
export function useDocumentTitle(page: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `YAVER · ${page}`
    return () => { document.title = previous }
  }, [page])
}
