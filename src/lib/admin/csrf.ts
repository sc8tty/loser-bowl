function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function originFor(protocol: string | null, host: string | null): string | null {
  if (!protocol || !host) {
    return null;
  }

  return normalizeOrigin(`${protocol.replace(/:$/, "")}://${host}`);
}

export function isAllowedAdminOrigin({
  origin,
  requestUrl,
  host,
  forwardedHost,
  forwardedProto,
}: {
  origin: string | null;
  requestUrl: string;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
}): boolean {
  const requestOrigin = normalizeOrigin(requestUrl);
  const submittedOrigin = origin === null ? null : normalizeOrigin(origin);

  if (requestOrigin === null || submittedOrigin === null) {
    return false;
  }

  const candidates = new Set<string>([requestOrigin]);
  const requestProtocol = new URL(requestOrigin).protocol;
  const forwardedOrigin = originFor(
    firstHeaderValue(forwardedProto),
    firstHeaderValue(forwardedHost),
  );
  const hostOrigin = originFor(requestProtocol, firstHeaderValue(host));

  if (forwardedOrigin !== null) {
    candidates.add(forwardedOrigin);
  }

  if (hostOrigin !== null) {
    candidates.add(hostOrigin);
  }

  return candidates.has(submittedOrigin);
}

export function isAllowedAdminRequestOrigin(request: Request): boolean {
  return isAllowedAdminOrigin({
    origin: request.headers.get("origin"),
    requestUrl: request.url,
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });
}
