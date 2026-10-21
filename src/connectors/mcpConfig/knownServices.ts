/**
 * Maps MCP server packages, container images, and remote hosts to the external service they
 * reach. A match says where requests go, not what the server can do there.
 */
export interface KnownService {
  readonly id: string;
  readonly label: string;
  /** Matched against npm/PyPI package names and container images. */
  readonly packages: readonly RegExp[];
  /** Matched against the hostname of remote (HTTP/SSE) servers. */
  readonly hosts: readonly RegExp[];
  /** Weak hint: matched against the user-chosen server name only when nothing else matched. */
  readonly names: readonly RegExp[];
  /** True when the service fetches or posts to arbitrary destinations (browsers, fetchers). */
  readonly arbitraryEgress?: boolean;
}

const host = (domain: string) => new RegExp(`(^|\\.)${domain.replaceAll(".", "\\.")}$`, "i");

export const KNOWN_SERVICES: readonly KnownService[] = [
  {
    id: "github",
    label: "GitHub",
    packages: [/server-github/i, /github-mcp-server/i, /^@github\//i],
    hosts: [host("githubcopilot.com"), host("github.com")],
    names: [/^github/i],
  },
  {
    id: "gitlab",
    label: "GitLab",
    packages: [/gitlab/i],
    hosts: [host("gitlab.com")],
    names: [/gitlab/i],
  },
  {
    id: "atlassian",
    label: "Atlassian (Jira / Confluence)",
    packages: [/atlassian/i, /\bjira\b/i, /confluence/i],
    hosts: [host("atlassian.com"), host("atlassian.net")],
    names: [/atlassian|jira|confluence/i],
  },
  {
    id: "slack",
    label: "Slack",
    packages: [/slack/i],
    hosts: [host("slack.com")],
    names: [/slack/i],
  },
  {
    id: "notion",
    label: "Notion",
    packages: [/notion/i],
    hosts: [host("notion.com")],
    names: [/notion/i],
  },
  {
    id: "linear",
    label: "Linear",
    packages: [/linear/i],
    hosts: [host("linear.app")],
    names: [/linear/i],
  },
  {
    id: "sentry",
    label: "Sentry",
    packages: [/sentry/i],
    hosts: [host("sentry.dev"), host("sentry.io")],
    names: [/sentry/i],
  },
  {
    id: "stripe",
    label: "Stripe",
    packages: [/^@stripe\//i, /stripe-mcp/i],
    hosts: [host("stripe.com")],
    names: [/stripe/i],
  },
  {
    id: "google-workspace",
    label: "Google Workspace (Drive / Gmail / Calendar)",
    packages: [/gdrive|google-drive|gmail|google-calendar|google-workspace/i],
    hosts: [host("googleapis.com")],
    names: [/gdrive|google|gmail/i],
  },
  {
    id: "aws",
    label: "AWS",
    packages: [/^awslabs[./]/i, /aws-.*mcp|mcp-.*aws/i],
    hosts: [host("amazonaws.com")],
    names: [/^aws/i],
  },
  {
    id: "azure",
    label: "Microsoft Azure",
    packages: [/^@azure\//i, /azure.*mcp/i],
    hosts: [host("azure.com")],
    names: [/azure/i],
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    packages: [/cloudflare/i],
    hosts: [host("cloudflare.com")],
    names: [/cloudflare/i],
  },
  {
    id: "vercel",
    label: "Vercel",
    packages: [/vercel/i],
    hosts: [host("vercel.com")],
    names: [/vercel/i],
  },
  {
    id: "supabase",
    label: "Supabase",
    packages: [/supabase/i],
    hosts: [host("supabase.com")],
    names: [/supabase/i],
  },
  {
    id: "figma",
    label: "Figma",
    packages: [/figma/i],
    hosts: [host("figma.com")],
    names: [/figma/i],
  },
  {
    id: "datadog",
    label: "Datadog",
    packages: [/datadog/i],
    hosts: [host("datadoghq.com")],
    names: [/datadog/i],
  },
  {
    id: "kubernetes",
    label: "Kubernetes cluster",
    packages: [/kubernetes|k8s/i],
    hosts: [],
    names: [/kubernetes|k8s/i],
  },
  {
    id: "postgres",
    label: "PostgreSQL database",
    packages: [/postgres/i],
    hosts: [],
    names: [/postgres/i],
  },
  {
    id: "mongodb",
    label: "MongoDB",
    packages: [/mongo/i],
    hosts: [host("mongodb.com")],
    names: [/mongo/i],
  },
  {
    id: "web",
    label: "Arbitrary websites (browser / fetch)",
    packages: [/playwright/i, /puppeteer/i, /server-fetch|mcp-server-fetch/i, /browser/i],
    hosts: [],
    names: [/playwright|puppeteer|browser|fetch/i],
    arbitraryEgress: true,
  },
];

export type ServiceMatchKind = "host" | "package" | "name";

export interface ServiceMatch {
  readonly service: KnownService;
  readonly kind: ServiceMatchKind;
}

export function matchService(input: {
  readonly packageName?: string;
  readonly remoteHost?: string;
  readonly serverName: string;
}): ServiceMatch | undefined {
  const { packageName, remoteHost, serverName } = input;
  if (remoteHost !== undefined) {
    const service = KNOWN_SERVICES.find((s) => s.hosts.some((r) => r.test(remoteHost)));
    if (service !== undefined) return { service, kind: "host" };
  }
  if (packageName !== undefined) {
    const service = KNOWN_SERVICES.find((s) => s.packages.some((r) => r.test(packageName)));
    if (service !== undefined) return { service, kind: "package" };
  }
  const service = KNOWN_SERVICES.find((s) => s.names.some((r) => r.test(serverName)));
  return service === undefined ? undefined : { service, kind: "name" };
}
