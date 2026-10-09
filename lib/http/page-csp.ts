/** Per-request script nonce. Inline styles remain necessary for UI positioning. */
export function pageContentSecurityPolicy(nonce:string,development=false){
  return ["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development?" 'unsafe-eval'":""}`,
    "style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:",
    `connect-src 'self'${development?' ws: wss:':''}`,"frame-src 'self'","form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'","base-uri 'self'","object-src 'none'","report-uri /api/security/csp-report"].join('; ');
}
