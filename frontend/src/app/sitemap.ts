import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/utils/constants";

// Public pages worth indexing. /my-scenarios (signed-in only) and /feedback are left out.
const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/calculator", priority: 0.9 },
  { path: "/demo", priority: 0.8 },
  { path: "/connect", priority: 0.8 },
  { path: "/methodology", priority: 0.7 },
  { path: "/about", priority: 0.5 },
  { path: "/support", priority: 0.3 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority }) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority,
  }));
}
