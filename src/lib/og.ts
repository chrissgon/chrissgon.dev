import { profile, type Lang } from "../data/index.ts";

/** The share images (og:image, twitter:image), drawn by scripts/og-image.ts into public/og/. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_LOCALE: Record<Lang, string> = { en: "en_US", pt: "pt_BR" };

export const ogImagePath = (lang: Lang) => `/og/og-${lang}.png`;

/** The image's text, as it reads in it: the wordmark, then the label of that language. */
export const ogImageAlt = (lang: Lang) => [profile.handle, ...profile.label[lang]].join(" · ");
