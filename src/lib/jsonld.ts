// schema.org Person and SoftwareSourceCode, from the data module (ADR-0001, REQ-5).
import { products, profile } from "../data/index.ts";

/** Person fields that must never be published (EDGE-1). */
export const FORBIDDEN_PERSON_FIELDS = ["worksFor", "address", "homeLocation", "birthDate", "email"] as const;

const LICENSES: Record<string, string> = { MIT: "https://opensource.org/licenses/MIT" };

export function jsonLd(site: string) {
  const person = `${site}/#person`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": person,
        name: profile.name,
        alternateName: profile.handle,
        jobTitle: profile.jobTitle,
        description: profile.label.en.join(" · "),
        url: `${site}/`,
        sameAs: profile.profiles.map((p) => p.url),
      },
      ...products.map((p) => ({
        "@type": "SoftwareSourceCode",
        name: p.name,
        description: p.summary.en,
        url: p.url,
        codeRepository: p.codeRepository,
        programmingLanguage: p.programmingLanguage,
        license: LICENSES[p.license] ?? p.license,
        author: { "@id": person },
      })),
    ],
  };
}

/** Forbidden Person fields present in a JSON-LD document; empty when it is clean. */
export function forbiddenFields(doc: ReturnType<typeof jsonLd>): string[] {
  return doc["@graph"].flatMap((node) =>
    node["@type"] === "Person" ? FORBIDDEN_PERSON_FIELDS.filter((f) => f in node).map((f) => `jsonld: forbidden field ${f}`) : [],
  );
}

/** Throw the build error `jsonld: forbidden field <field>` when a Person carries a forbidden field (EDGE-1). */
export function assertPublishable<T extends ReturnType<typeof jsonLd>>(doc: T): T {
  const problems = forbiddenFields(doc);
  if (problems.length) throw new Error(problems.join("\n"));
  return doc;
}

/** Serialize for a <script type="application/ld+json">, escaping "<" so no tag can close the script. */
export const serializeJsonLd = (doc: object) => JSON.stringify(doc).replace(/</g, "\\u003c");
