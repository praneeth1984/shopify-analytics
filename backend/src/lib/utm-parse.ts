const SOCIAL_DOMAINS = new Set([
  // utm_source values (no TLD)
  "facebook","instagram","twitter","x","pinterest","tiktok","linkedin","youtube","snapchat",
  // referrer hostnames (with TLD)
  "facebook.com","instagram.com","twitter.com","x.com",
  "pinterest.com","tiktok.com","linkedin.com","youtube.com","snapchat.com",
]);
const PAID_MEDIUMS = new Set(["cpc","ppc","paid","paidsearch","paidsocial","banner","display"]);
const EMAIL_MEDIUMS = new Set(["email","newsletter","em"]);

export type UTMChannel = "direct" | "organic" | "paid" | "email" | "social" | "referral";

export type UTMData = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  channel: UTMChannel;
};

export function parseUTM(landingPage: string | null, referringSite: string | null): UTMData {
  const url = landingPage ? tryParseUrl(landingPage) : null;
  const params = url?.searchParams;
  const utmSource = params?.get("utm_source") ?? null;
  const utmMedium = params?.get("utm_medium")?.toLowerCase() ?? null;
  const utmCampaign = params?.get("utm_campaign") ?? null;

  let referrerDomain: string | null = null;
  if (referringSite) {
    try { referrerDomain = new URL(referringSite).hostname.replace(/^www\./, ""); } catch {}
  }

  let channel: UTMChannel = "direct";
  if (utmMedium && PAID_MEDIUMS.has(utmMedium)) channel = "paid";
  else if (utmMedium && EMAIL_MEDIUMS.has(utmMedium)) channel = "email";
  else if (utmSource && SOCIAL_DOMAINS.has(utmSource)) channel = "social";
  else if (referrerDomain && SOCIAL_DOMAINS.has(referrerDomain)) channel = "social";
  else if (utmSource || utmMedium) channel = "organic";
  else if (referrerDomain) channel = "referral";

  return { utmSource, utmMedium, utmCampaign, referrer: referrerDomain, channel };
}

function tryParseUrl(raw: string): URL | null {
  try { return new URL(raw.startsWith("http") ? raw : `https://example.com${raw}`); }
  catch { return null; }
}
