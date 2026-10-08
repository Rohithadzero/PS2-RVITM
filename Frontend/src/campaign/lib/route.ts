export type Route =
  | { name: "home" }
  | { name: "talk"; sid: string }
  | { name: "plan"; id: string }
  | { name: "campaign"; id: string }
  | { name: "dashboard"; id: string };

// Hash links for the app router (#/voice/<session>, #/plan/<campaign>, ...).
export function href(r: Route): string {
  switch (r.name) {
    case "home": return "#/home";
    case "talk": return `#/voice/${encodeURIComponent(r.sid)}`;
    case "plan": return `#/plan/${encodeURIComponent(r.id)}`;
    case "campaign": return `#/campaign/${encodeURIComponent(r.id)}`;
    case "dashboard": return `#/dashboard/${encodeURIComponent(r.id)}`;
  }
}

export const SLUG = { talk: "voice", plan: "plan", campaign: "campaign", dashboard: "dashboard" } as const;
