import { mkdir, writeFile } from "node:fs/promises";

const org = "BYPASS-IDC";
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "bypass-idc-profile-analytics",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
};
const C = {
  bg: "#1b0532", deep: "#10021f", panel: "#260b40", mid: "#5b1285",
  bright: "#9227c9", lav: "#d7d1e4", white: "#ffffff", muted: "#a99bbd",
  grid: "#45205f", pale: "#bc82e5", soft: "#7b55a4", glow: "#e5b8ff"
};

async function get(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}
function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[ch]);
}
function shell(width, height, title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${xml(title)}</title><desc id="desc">${xml(subtitle)}</desc>
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.panel}"/><stop offset="1" stop-color="${C.deep}"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${C.mid}"/><stop offset=".55" stop-color="${C.bright}"/><stop offset="1" stop-color="${C.glow}"/></linearGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="${C.bright}" stroke-opacity=".055"/></pattern>
  </defs>
  <rect width="${width}" height="${height}" rx="20" fill="${C.bg}" stroke="${C.mid}" stroke-opacity=".85"/>
  <rect width="${width}" height="${height}" rx="20" fill="url(#grid)"/>
  <path d="M20 91H${width-20}" stroke="${C.mid}" stroke-opacity=".55"/>
  <text x="28" y="47" fill="${C.lav}" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700">${xml(title)}</text>
  <text x="28" y="73" fill="${C.bright}" font-family="Consolas, monospace" font-size="10.5" letter-spacing="1.2">${xml(subtitle)}</text>`;
}
function text(x, y, value, size = 13, color = C.muted, anchor = "start", weight = "normal") {
  return `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-family="Consolas, 'Courier New', monospace" font-size="${size}" font-weight="${weight}">${xml(value)}</text>`;
}
function rect(x, y, width, height, fill = C.panel, stroke = C.mid, radius = 12) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-opacity=".85"/>`;
}
function polar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}
function donutPath(cx, cy, radius, start, end) {
  const [x1, y1] = polar(cx, cy, radius, start);
  const [x2, y2] = polar(cx, cy, radius, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
function shortName(name, max = 24) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

await mkdir("profile/assets", { recursive: true });
const repos = [];
for (let page = 1; ; page++) {
  const batch = await get(`https://api.github.com/orgs/${org}/repos?type=public&per_page=100&page=${page}`);
  if (!Array.isArray(batch)) throw new Error("Unexpected GitHub API response while listing repositories.");
  repos.push(...batch);
  if (batch.length < 100) break;
}
const sum = key => repos.reduce((total, repo) => total + (Number(repo[key]) || 0), 0);
const languageCounts = new Map();
for (const repo of repos) {
  if (repo.language) languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
}
const languageEntries = [...languageCounts.entries()].sort((a, b) => b[1] - a[1]);
const languages = languageEntries.slice(0, 6);
const otherLanguageCount = languageEntries.slice(6).reduce((total, [, count]) => total + count, 0);
if (otherLanguageCount) languages.push(["Other", otherLanguageCount]);
const topRepos = [...repos]
  .sort((a, b) => b.stargazers_count - a.stargazers_count || b.forks_count - a.forks_count || a.name.localeCompare(b.name))
  .slice(0, 6);
const now = Date.now();
const buckets = [["0–7 days", 0], ["8–30 days", 0], ["31–90 days", 0], ["91–180 days", 0], ["> 180 days", 0], ["No push date", 0]];
for (const repo of repos) {
  if (!repo.pushed_at) { buckets[5][1]++; continue; }
  const days = Math.max(0, (now - new Date(repo.pushed_at).getTime()) / 86400000);
  const index = days <= 7 ? 0 : days <= 30 ? 1 : days <= 90 ? 2 : days <= 180 ? 3 : 4;
  buckets[index][1]++;
}
const issueTotal = sum("open_issues_count");
const totalStars = sum("stargazers_count");
const totalForks = sum("forks_count");
const generated = new Date().toISOString().slice(0, 10);

// Snapshot cards.
let out = shell(1200, 250, "ORGANIZATION SNAPSHOT", `PUBLIC REPOSITORIES  /  GENERATED ${generated}  /  ${org}`);
const metrics = [
  ["PUBLIC REPOSITORIES", repos.length, "REPOSITORY COUNT"],
  ["TOTAL STARS", totalStars, "COMMUNITY SIGNAL"],
  ["TOTAL FORKS", totalForks, "PUBLIC FORKS"],
  ["OPEN ISSUES + PRS", issueTotal, "OPEN WORK ITEMS"]
];
metrics.forEach(([label, value, note], index) => {
  const x = 24 + index * 293;
  out += rect(x, 113, 270, 112, "url(#panel)", C.mid, 13);
  out += `<rect x="${x}" y="113" width="270" height="4" rx="2" fill="url(#accent)"/>`;
  out += text(x + 17, 145, label, 10.5, C.muted);
  out += text(x + 17, 190, Number(value).toLocaleString("en-US"), 31, C.white, "start", "bold");
  out += text(x + 17, 211, note, 9, C.pale);
});
out += "</svg>";
await writeFile("profile/assets/overview.svg", out);

// Language distribution by repository primary language.
out = shell(620, 390, "LANGUAGE MIX", "PUBLIC REPOSITORIES  /  PRIMARY LANGUAGE PER REPOSITORY");
const totalLanguages = languages.reduce((total, [, count]) => total + count, 0);
const palette = [C.bright, C.lav, C.mid, C.pale, C.soft, C.glow, "#8a6bb0"];
if (totalLanguages > 0) {
  let angle = 0;
  languages.forEach(([name, count], index) => {
    const sweep = count / totalLanguages * 359.8;
    out += `<path d="${donutPath(170, 243, 87, angle, angle + sweep)}" fill="none" stroke="${palette[index % palette.length]}" stroke-width="26" stroke-linecap="butt"/>`;
    angle += sweep;
  });
  out += text(170, 239, String(totalLanguages), 27, C.white, "middle", "bold");
  out += text(170, 261, "REPOSITORIES", 9, C.muted, "middle");
  languages.forEach(([name, count], index) => {
    const y = 139 + index * 34;
    out += `<rect x="315" y="${y - 10}" width="11" height="11" rx="3" fill="${palette[index % palette.length]}"/>`;
    out += text(337, y, name, 12, C.lav);
    out += text(590, y, `${count} repos`, 10.5, C.muted, "end");
  });
} else {
  out += `<circle cx="170" cy="243" r="87" fill="none" stroke="${C.mid}" stroke-width="26"/>`;
  out += text(170, 250, "—", 28, C.white, "middle", "bold");
  out += text(315, 216, "No primary language data yet", 12, C.muted);
  out += text(315, 241, "The chart updates from public repositories", 10, C.muted);
}
out += text(28, 365, "Each repository contributes one primary-language label.", 9.5, C.muted);
out += "</svg>";
await writeFile("profile/assets/languages.svg", out);

// Six most-starred public repositories.
out = shell(620, 390, "TOP REPOSITORIES", "RANKED BY PUBLIC STARS  /  TOP SIX");
if (topRepos.length) {
  const max = Math.max(1, ...topRepos.map(repo => repo.stargazers_count));
  topRepos.forEach((repo, index) => {
    const y = 131 + index * 37;
    const width = Math.max(3, 350 * (repo.stargazers_count / max));
    out += text(28, y, `${String(index + 1).padStart(2, "0")}  ${shortName(repo.name, 24)}`, 10.5, C.lav);
    out += `<rect x="28" y="${y + 9}" width="390" height="7" rx="3.5" fill="${C.panel}" stroke="${C.mid}" stroke-opacity=".45"/>`;
    out += `<rect x="28" y="${y + 9}" width="${Math.min(390, width)}" height="7" rx="3.5" fill="url(#accent)"/>`;
    out += text(590, y + 14, Number(repo.stargazers_count).toLocaleString("en-US"), 10.5, C.white, "end", "bold");
  });
} else {
  out += text(28, 208, "No public repositories found yet.", 12, C.muted);
}
out += text(28, 365, "Sorted by stars; forks break ties.", 9.5, C.muted);
out += "</svg>";
await writeFile("profile/assets/top-repositories.svg", out);

// Repository push recency. This is repository-level, not commit activity.
out = shell(1200, 285, "REPOSITORY UPDATE CADENCE", "DAYS SINCE LAST PUSH  /  ONE LATEST-PUSH DATE PER PUBLIC REPOSITORY");
const cadenceColors = [C.bright, C.pale, C.mid, C.soft, "#4b2a66", "#776488"];
const total = Math.max(1, repos.length);
const barX = 30, barY = 119, barWidth = 1140;
let segmentX = barX;
buckets.forEach(([, count], index) => {
  const width = count / total * barWidth;
  if (width > 0) out += `<rect x="${segmentX.toFixed(2)}" y="${barY}" width="${Math.max(1, width).toFixed(2)}" height="28" fill="${cadenceColors[index]}"/>`;
  segmentX += width;
});
buckets.forEach(([label, count], index) => {
  const column = index % 3, row = Math.floor(index / 3);
  const x = 38 + column * 390, y = 190 + row * 38;
  out += `<rect x="${x}" y="${y - 10}" width="11" height="11" rx="3" fill="${cadenceColors[index]}"/>`;
  out += text(x + 21, y, label, 11, C.lav);
  out += text(x + 350, y, `${count} repos`, 10.5, C.muted, "end");
});
out += text(1165, 265, `${repos.length} public repositories`, 9.5, C.muted, "end");
out += "</svg>";
await writeFile("profile/assets/cadence.svg", out);

console.log(`Updated ${org} analytics: ${repos.length} public repositories, ${languages.length} language groups.`);
