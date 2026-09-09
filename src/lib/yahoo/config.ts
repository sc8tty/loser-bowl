export class MissingYahooConfigError extends Error {
  readonly code = "MISSING_YAHOO_CONFIG";

  constructor() {
    super(
      "YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, and YAHOO_REDIRECT_URI are required before using Yahoo OAuth.",
    );
    this.name = "MissingYahooConfigError";
  }
}

export type YahooConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getYahooConfig(): YahooConfig {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new MissingYahooConfigError();
  }

  return { clientId, clientSecret, redirectUri };
}
