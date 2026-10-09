// SAMPLE DATA for the Insights screen. Instagram does not let this app read reach and impressions, so every number here is
// generated, not measured. It is seeded, so it looks the same on every visit, and the screen labels each chart "Sample data".
// What is live is only what the Connections screen fetches from a linked Instagram account (profile, recent posts, likes, comments).

const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const DAYS = 30;
const dayLabels = () => {
  const out = [];
  const end = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
  }
  return out;
};

export const buildInsights = () => {
  const r = rng(2026);
  // Reach per day: a launch bump on the first weekend, a quieter middle, a reminder bump, with weekend lift.
  const wave = (base, bumps) =>
    Array.from({ length: DAYS }, (_, i) => {
      const weekend = [5, 6].includes((i + 3) % 7) ? 1.35 : 1;
      const bump = bumps.reduce((acc, [at, size, width]) => acc + size * Math.exp(-(((i - at) / width) ** 2)), 0);
      return Math.max(20, Math.round((base + bump) * weekend * (0.85 + r() * 0.3)));
    });
  const reach = [
    { name: 'Instagram', values: wave(260, [[6, 520, 2.2], [20, 360, 2.6]]) },
    { name: 'WhatsApp', values: wave(150, [[6, 380, 1.6], [21, 300, 1.8]]) },
    { name: 'Poster scans', values: wave(40, [[8, 70, 3]]) },
  ];

  // 36 posts, each with a reach drawn from a skewed spread (a few do very well, most are middling).
  const posts = Array.from({ length: 36 }, (_, i) => {
    const reachV = Math.round(180 + (r() ** 2.2) * 2600);
    const likes = Math.round(reachV * (0.03 + r() * 0.07));
    return { id: i + 1, reach: reachV, likes, comments: Math.round(likes * (0.05 + r() * 0.12)), saves: Math.round(likes * (0.08 + r() * 0.2)) };
  });

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, h) => `${h}:00`);
  const grid = weekdays.map((_, d) =>
    hours.map((_, h) => {
      const evening = Math.exp(-(((h - 19.5) / 2.2) ** 2)) * 5.5;
      const lunch = Math.exp(-(((h - 12.5) / 1.6) ** 2)) * 3;
      const lift = d >= 5 ? 1.25 : 1;
      return Math.max(0.2, (evening + lunch + 0.3) * lift * (0.8 + r() * 0.4));
    })
  );

  const funnel = [
    { label: 'Planned', value: 18 },
    { label: 'Written', value: 18 },
    { label: 'Passed checks', value: 16 },
    { label: 'Approved', value: 14 },
    { label: 'Shared', value: 12 },
    { label: 'Led to a redemption', value: 9 },
  ];

  const channels = [
    { label: 'WhatsApp', value: 16.2 },
    { label: 'Poster', value: 7.4 },
    { label: 'IG post', value: 3.9 },
    { label: 'IG story', value: 5.1 },
  ];
  const forecast = [15.9, 7.1, 3.6, 4.9];

  const languages = [
    { label: 'English', value: 46 },
    { label: 'Kannada', value: 38 },
    { label: 'Hindi', value: 16 },
  ];

  const stepMinutes = [
    { label: 'Read idea', value: 0.4 },
    { label: 'Fill gaps', value: 2.1 },
    { label: 'You lock plan', value: 6.5 },
    { label: 'Write copy', value: 3.2 },
    { label: 'Checks', value: 1.4 },
    { label: 'You approve', value: 9.8 },
  ];

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const totalReach = sum(reach.map((s) => sum(s.values)));
  const engaged = sum(posts.map((p) => p.likes + p.comments + p.saves));
  const postReach = sum(posts.map((p) => p.reach));
  return {
    labels: dayLabels(), reach, posts, weekdays, hours, grid, funnel, channels, forecast, languages, stepMinutes,
    kpis: {
      totalReach,
      engagementRate: (engaged / postReach) * 100,
      redemptions: 214,
      approvedShare: (14 / 18) * 100,
      blocked: 3,
      repaired: 2,
    },
  };
};
