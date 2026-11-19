declare const __APP_VERSION__: string

/** Uygulama sürümü (derleme anında frontend/package.json'dan gömülür). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
