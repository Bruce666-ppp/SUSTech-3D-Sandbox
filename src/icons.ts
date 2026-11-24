const paths: Record<string, string> = {
  logo: '<path d="M12 2 22 7.5 12 13 2 7.5 12 2Z" fill="currentColor" fill-opacity=".24"/><path d="m2 12 10 5.5 10-5.5M2 16.5 12 22l10-5.5"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5m-9 5v10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18m0-18a15 15 0 0 0 0 18"/>',
  volume: '<path d="M11 5 5 9H2v6h3l6 4V5Zm4 4a4.2 4.2 0 0 1 0 6m3-9a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M11 5 5 9H2v6h3l6 4V5Zm5 5 5 5m0-5-5 5"/>',
  sliders: '<path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h11m4 0h1"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  fullscreen: '<path d="M8 4H4v4m12-4h4v4m0 8v4h-4M4 16v4h4"/>',
  minimize: '<path d="M4 8h4V4m12 4h-4V4m4 12h-4v4m-12-4h4v4"/>',
  pin: '<path d="M19 10c0 4-7 9.5-7 9.5S5 14 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.1"/>',
  book: '<path d="M4 5h5a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4V5Zm16 0h-5a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h5V5Z"/>',
  building: '<path d="M4 20h16M6 20V5h8v15m0-10h4v10M9 8h2m-2 4h2m-2 4h2"/>',
  track: '<rect x="3" y="6" width="18" height="12" rx="6"/><rect x="6" y="9" width="12" height="6" rx="3"/>',
  trees: '<path d="m9 3-5 7h3l-4 6h12l-4-6h3L9 3Zm0 13v5m6-15 5 7h-3l3 5h-5m2 0v3"/>',
  home: '<path d="m3 11 9-7 9 7m-16-1v10h14V10m-9 10v-5h4v5"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2.4 7.3M3 5v6h6"/>',
  rebuild: '<path d="m13 4 7 4-7 4-7-4 7-4Zm-7 8 7 4 7-4m-14 4 7 4 7-4M3 4v4m-2-2h4"/>',
  top: '<circle cx="12" cy="12" r="6.3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 6v4"/>',
  touch: '<path d="M8 12V6a2 2 0 0 1 4 0v5-2a2 2 0 1 1 4 0v3a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-4-5a2 2 0 0 1 3-2l1 1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  spark: '<path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4"/><circle cx="12" cy="12" r="2"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  orbit: '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(45 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-45 12 12)"/>',
  contour: '<path d="m3 19 5-9 4 5 4-9 5 13H3Z"/>',
}

export function icon(name: string, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.pin}</svg>`
}
