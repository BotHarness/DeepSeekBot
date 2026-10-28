import type { Language } from './schemas.js';

export const SITE_ORIGIN = 'https://tobs.app';
export const SHORT_ORIGIN = 'https://go.tobs.app';

const PREVIEWER =
  /twitterbot|facebookexternalhit|facebookcatalog|slackbot|slack-imgproxy|discordbot|telegrambot|whatsapp|linkedinbot|googlebot|bingbot|applebot|embedly|redditbot|bytespider|pinterestbot|skypeuripreview|vkshare|\bbot\b|bot\/|crawler|spider|preview/i;

export function isPreviewer(userAgent: string | undefined): boolean {
  return userAgent !== undefined && PREVIEWER.test(userAgent);
}

export interface TargetLink {
  slug: string;
  campaign: string;
  platform: string;
  media: string;
  path: string;
  language: Language;
}

export function sitePath(path: string, language: Language): string {
  return language === 'en' ? `/en${path}` : path;
}

export function siteRoot(): string {
  return `${SITE_ORIGIN}/`;
}

export function targetUrl(link: TargetLink): string {
  const url = new URL(sitePath(link.path, link.language), SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) return siteRoot();
  url.search = '';
  url.hash = '';
  url.searchParams.set('utm_campaign', link.campaign);
  url.searchParams.set('utm_source', link.platform);
  url.searchParams.set('utm_medium', link.media);
  url.searchParams.set('utm_content', link.slug);
  return url.toString();
}

export interface PostHogConfig {
  host: string | undefined;
  key: string | undefined;
}

export function linkClickedEvent(link: TargetLink, key: string, timestamp: string) {
  return {
    api_key: key,
    event: 'campaign:short_link_click',
    distinct_id: crypto.randomUUID(),
    timestamp,
    properties: {
      source: 'links',
      campaign: link.campaign,
      link: link.slug,
      platform: link.platform,
      media: link.media,
      language: link.language,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  };
}

export async function sendLinkClicked(
  config: PostHogConfig,
  link: TargetLink,
  timestamp: string,
): Promise<void> {
  if (!config.host || !config.key) return;
  try {
    const response = await fetch(new URL('/i/v0/e/', config.host), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(linkClickedEvent(link, config.key, timestamp)),
    });
    if (!response.ok) {
      console.warn(
        JSON.stringify({ module: 'links-worker', phase: 'posthog', status: response.status }),
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({ module: 'links-worker', phase: 'posthog', error: String(error) }),
    );
  }
}
