// The brand block. The logo is a wordmark that already spells "PreBilt", so the picture
// carries the name as its alt text (and is the page's <h1> on the start screen) instead of a
// second, typed copy of the name next to it.
//
//   renderLogo()                        large, centred hero (login screen)
//   renderLogo({ compact: true })       smaller logo with the tagline under it (leaderboard header)
const LOGO = { src: '/prebilt-logo.png', width: 486, height: 105 };

export function renderLogo({ compact = false, subtitle = true } = {}) {
  const image = `<img src="${LOGO.src}" alt="PreBilt" class="prebilt-logo" width="${LOGO.width}" height="${LOGO.height}">`;
  const tagline = subtitle ? '<p class="logo-subtitle">SAP Supply Chain Mobility</p>' : '';

  if (compact) {
    return `<div class="logo-container logo-container--compact">${image}${tagline}</div>`;
  }

  return `<div class="logo-container"><h1 class="logo-heading">${image}</h1>${tagline}</div>`;
}
