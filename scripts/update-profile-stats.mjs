import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_REPOSITORY_OWNER || "superwhys";
const token = process.env.GITHUB_TOKEN;
const outputDir = new URL("../assets/", import.meta.url);

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${username}-profile-readme`,
  "X-GitHub-Api-Version": "2022-11-28",
};

if (token) headers.Authorization = `Bearer ${token}`;

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function getRepositories() {
  const repositories = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(
      `/users/${username}/repos?type=owner&sort=updated&per_page=100&page=${page}`,
    );
    repositories.push(...batch);
    if (batch.length < 100) return repositories;
  }
}

const escapeXml = (value) =>
  String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);

const compactNumber = (value) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function cardFrame(content, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="170" viewBox="0 0 420 170" role="img" aria-label="${escapeXml(label)}">
  <defs>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#70a5fd" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="418" height="168" rx="10" fill="#1a1b27" stroke="url(#border)" stroke-opacity=".45" />
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .title { fill: #70a5fd; font-size: 18px; font-weight: 700; }
    .label { fill: #a9b1d6; font-size: 13px; }
    .value { fill: #f8fafc; font-size: 20px; font-weight: 700; }
  </style>
  ${content}
</svg>`;
}

function statsCard(user, repositories) {
  const originalRepositories = repositories.filter((repository) => !repository.fork);
  const totalStars = originalRepositories.reduce((sum, repository) => sum + repository.stargazers_count, 0);
  const totalForks = originalRepositories.reduce((sum, repository) => sum + repository.forks_count, 0);
  const stats = [
    ["Public repositories", user.public_repos],
    ["Total stars", totalStars],
    ["Followers", user.followers],
    ["Total forks", totalForks],
  ];

  const items = stats.map(([label, value], index) => {
    const x = index % 2 === 0 ? 28 : 224;
    const y = index < 2 ? 82 : 137;
    return `<text x="${x}" y="${y - 18}" class="label">${escapeXml(label)}</text>
  <text x="${x}" y="${y + 5}" class="value">${escapeXml(compactNumber(value))}</text>`;
  }).join("\n  ");

  return cardFrame(
    `<text x="24" y="36" class="title">${escapeXml(username)}'s GitHub stats</text>
  ${items}`,
    `${username}'s GitHub statistics`,
  );
}

const languageColors = {
  Go: "#00ADD8",
  Python: "#3572A5",
  JavaScript: "#F1E05A",
  TypeScript: "#3178C6",
  Java: "#B07219",
  Shell: "#89E051",
  HTML: "#E34C26",
  CSS: "#563D7C",
  Vue: "#41B883",
  C: "#555555",
  "C++": "#F34B7D",
};

async function getLanguages(repositories) {
  const totals = new Map();
  const originals = repositories.filter(
    (repository) => !repository.fork && repository.name !== username,
  );

  await Promise.all(originals.map(async (repository) => {
    const languages = await github(`/repos/${username}/${repository.name}/languages`);
    for (const [language, bytes] of Object.entries(languages)) {
      totals.set(language, (totals.get(language) || 0) + bytes);
    }
  }));

  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function languagesCard(languages) {
  const total = languages.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
  let offset = 0;
  const segments = languages.map(([language, bytes]) => {
    const width = (bytes / total) * 372;
    const segment = `<rect x="${24 + offset}" y="54" width="${Math.max(width, 2)}" height="8" fill="${languageColors[language] || "#94a3b8"}" />`;
    offset += width;
    return segment;
  }).join("\n  ");

  const labels = languages.map(([language, bytes], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 28 : 224;
    const y = 91 + row * 30;
    const percentage = ((bytes / total) * 100).toFixed(1);
    return `<circle cx="${x}" cy="${y - 4}" r="5" fill="${languageColors[language] || "#94a3b8"}" />
  <text x="${x + 12}" y="${y}" class="label">${escapeXml(language)}  ${percentage}%</text>`;
  }).join("\n  ");

  return cardFrame(
    `<text x="24" y="36" class="title">Most used languages</text>
  <clipPath id="bar"><rect x="24" y="54" width="372" height="8" rx="4" /></clipPath>
  <g clip-path="url(#bar)">${segments}</g>
  ${labels}`,
    `${username}'s most used languages`,
  );
}

const user = await github(`/users/${username}`);
const repositories = await getRepositories();
const languages = await getLanguages(repositories);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(new URL("github-stats.svg", outputDir), statsCard(user, repositories)),
  writeFile(new URL("top-languages.svg", outputDir), languagesCard(languages)),
]);

console.log(`Updated profile cards for ${username}.`);
