export function resolveAllowedAuthOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  try {
    const { hostname, protocol } = new URL(origin);
    const isPsb = hostname === 'psbuniverse.com' || hostname.endsWith('.psbuniverse.com');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if ((isPsb || isLocal) && (protocol === 'https:' || protocol === 'http:')) return origin;
  } catch {
    return '';
  }
  return '';
}

export function getAuthCorsHeaders(request, methods = 'GET, OPTIONS') {
  const allowOrigin = resolveAllowedAuthOrigin(request);
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = methods;
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-PSB-Module';
  }
  return headers;
}