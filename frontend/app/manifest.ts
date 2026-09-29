import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CivicMind",
    short_name: "CivicMind",
    description: "Civic complaint intelligence for Mumbai",
    start_url: "/",
    display: "standalone",
    background_color: "#FDE5D4",
    theme_color: "#445D48",
  };
}
