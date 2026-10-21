export function createProjectIdentity(name: string) {
  const id = crypto.randomUUID();
  const readable = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  return {
    id,
    slug: `${readable || "app"}-${id.replace(/-/g, "").slice(0, 8)}`,
  };
}

export function getPublishedAppsDomain() {
  return process.env.PUBLISHED_APPS_DOMAIN || "apps.xiongerer.xyz";
}

export function getPublishedHostname(slug: string) {
  return `${slug}.${getPublishedAppsDomain()}`;
}
