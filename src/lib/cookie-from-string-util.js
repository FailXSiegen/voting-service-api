export function extractCookieValueByHeader (header, cookieName) {
  const cookies = decodeURIComponent(header).split(';')
  for (const cookie of cookies) {
    const parts = cookie.split('=')
    if (parts[0] === cookieName) {
      return parts[1].split('.')[0].replace('s:', '')
    }
  }
  return null
}
