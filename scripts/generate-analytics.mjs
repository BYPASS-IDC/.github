import { writeFile } from "node:fs/promises";

const org = "BYPASS-IDC";
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
};
const C = {
  bg: "#1b0532", panel: "#260b40", mid: "#5b1285",
  bright: "#9227c9", lav: "#d7d1e4", white: "#ffffff",
  muted: "#a99bbd", grid: "#45205f"
};

async function get(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}
function xml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[c]);
}
function svgStart(w, h, title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xml(title)}">
  <rect width="${w}" height="${h}" rx="18" fill="${C.bg}" stroke="${C.mid}"/>
  <text x="28" y="43" fill="${C.lav}" font-family="monospace" font-size="18" font-weight="bold">${xml(title)}</text>
  <text x="28" y="70" fill="${C.bright}" font-family="monospace" font-size="11" letter-spacing="1">${xml(subtitle)}</text>`;
}
function txt(x,y,s,size=13,color=C.muted,anchor="start",weight="normal") {
  return `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-family="monospace" font-size="${size}" font-weight="${weight}">${xml(s)}</text>`;
}
function rounded(x,y,w,h,fill=C.panel,stroke=C.mid,rx=12) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
}
function polar(cx, cy, r, angle) {
  const a = (angle - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function donutPath(cx, cy, r, start, end) {
  const [x1,y1] = polar(cx,cy,r,start);
  const [x2,y2] = polar(cx,cy,r,end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const repos = [];
for (let page=1; ; page++) {
  const batch = await get(`https://api.github.com/orgs/${org}/repos?type=public&per_page=100&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const sum = key => repos.reduce((n,r) => n + (Number(r[key]) || 0), 0);
const languageCounts = new Map();
for (const repo of repos) {
  if (repo.language) languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
}
const allLanguages = [...languageCounts.entries()].sort((a,b)=>b[1]-a[1]);
const languages = allLanguages.slice(0,6);
const otherLanguageCount = allLanguages.slice(6).reduce((n,[,count])=>n+count,0);
if (otherLanguageCount) languages.push(["Other",otherLanguageCount]);
const topRepos = [...repos].sort((a,b)=>b.stargazers_count-a.stargazers_count || b.forks_count-a.forks_count).slice(0,6);
const now = Date.now();
const buckets = [
  ["0–7 days",0],["8–30 days",0],["31–90 days",0],["91–180 days",0],["> 180 days",0],["No push date",0]
];
for (const repo of repos) {
  if (!repo.pushed_at) { buckets[5][1]++; continue; }
  const days = Math.max(0,(now-new Date(repo.pushed_at).getTime())/86400000);
  const ix = days <= 7 ? 0 : days <= 30 ? 1 : days <= 90 ? 2 : days <= 180 ? 3 : 4;
  buckets[ix][1]++;
}
const issueTotal = sum("open_issues_count");
const totalStars = sum("stargazers_count");
const totalForks = sum("forks_count");
const generated = new Date().toISOString().slice(0,10);

let out = svgStart(1200,230,"ORGANIZATION SNAPSHOT",`PUBLIC REPOSITORY METRICS  /  GENERATED ${generated}`);
const metrics = [
  ["PUBLIC REPOSITORIES",repos.length],
  ["TOTAL STARS",totalStars],
  ["TOTAL FORKS",totalForks],
  ["OPEN ISSUES + PRS",issueTotal]
];
metrics.forEach(([label,value],i)=>{
  const x=25+i*293;
  out += rounded(x,100,270,104);
  out += txt(x+18,133,label,11,C.muted);
  out += txt(x+18,179,Number(value).toLocaleString("en-US"),29,C.white,"start","bold");
});
out += "</svg>";
await writeFile("profile/assets/overview.svg",out);

// Language donut and legend: counts each repo's primary language.
out = svgStart(620,360,"LANGUAGE MIX","PUBLIC REPOSITORIES  /  PRIMARY LANGUAGE PER REPOSITORY");
const totalLanguages = languages.reduce((n,[,v])=>n+v,0);
const palette=[C.bright,C.lav,C.mid,"#bc82e5","#7b55a4","#e5b8ff","#8a6bb0"];
if (totalLanguages) {
  let angle=0;
  languages.forEach(([name,count],i)=>{
    const sweep=count/totalLanguages*359.8;
    out += `<path d="${donutPath(165,220,77,angle,angle+sweep)}" fill="none" stroke="${palette[i%palette.length]}" stroke-width="25" stroke-linecap="butt"/>`;
    angle+=sweep;
  });
  out += txt(165,216,languages.length,26,C.white,"middle","bold");
  out += txt(165,239,"LANGUAGES",10,C.muted,"middle");
  languages.forEach(([name,count],i)=>{
    const y=126+i*29;
    out += `<rect x="300" y="${y-11}" width="10" height="10" rx="2" fill="${palette[i%palette.length]}"/>`;
    out += txt(320,y,name,12,C.lav);
    out += txt(575,y,`${count} repos`,11,C.muted,"end");
  });
} else {
  out += `<circle cx="165" cy="220" r="77" fill="none" stroke="${C.mid}" stroke-width="25"/>`;
  out += txt(165,224,"—",26,C.white,"middle","bold");
  out += txt(300,205,"No primary languages detected",12,C.muted);
}
out += "</svg>";
await writeFile("profile/assets/languages.svg",out);

// Most-starred repositories.
out = svgStart(620,360,"TOP REPOSITORIES","RANKED BY PUBLIC STARS");
if (topRepos.length) {
  const max=Math.max(1,...topRepos.map(r=>r.stargazers_count));
  topRepos.forEach((r,i)=>{
    const y=116+i*38, width=365*(r.stargazers_count/max);
    const name=r.name.length>24 ? `${r.name.slice(0,21)}…` : r.name;
    out += txt(28,y,name,11,C.lav);
    out += `<rect x="28" y="${y+8}" width="365" height="8" rx="4" fill="${C.panel}"/>`;
    out += `<rect x="28" y="${y+8}" width="${Math.max(3,width)}" height="8" rx="4" fill="${C.bright}"/>`;
    out += txt(585,y+14,String(r.stargazers_count),11,C.white,"end","bold");
  });
} else {
  out += txt(28,180,"No public repositories found yet.",13,C.muted);
}
out += "</svg>";
await writeFile("profile/assets/top-repositories.svg",out);

// Push recency snapshot (one last-push date per public repository).
out = svgStart(1200,250,"REPOSITORY UPDATE CADENCE","DAYS SINCE LAST PUSH  /  REPOSITORY-LEVEL SNAPSHOT");
const labels=["0–7 days","8–30 days","31–90 days","91–180 days","> 180 days","No push date"];
const total=Math.max(1,repos.length);
let x=34;
const barY=112, barW=1132;
const colors=[C.bright,"#aa62d1",C.mid,"#74429a","#4b2a66","#5d4a6d"];
let segmentX=x;
buckets.forEach(([,count],i)=>{
  const w=(count/total)*barW;
  if (w>0) out+=`<rect x="${segmentX.toFixed(2)}" y="${barY}" width="${Math.max(1,w).toFixed(2)}" height="27" fill="${colors[i]}" />`;
  segmentX+=w;
});
buckets.forEach(([label,count],i)=>{
  const col=i%3, row=Math.floor(i/3), lx=36+col*390, ly=177+row*35;
  out+=`<rect x="${lx}" y="${ly-10}" width="10" height="10" rx="2" fill="${colors[i]}"/>`;
  out+=txt(lx+19,ly,label,11,C.lav);
  out+=txt(lx+348,ly,`${count} repos`,11,C.muted,"end");
});
out+=txt(1165,232,`${repos.length} repositories`,10,C.muted,"end");
out+="</svg>";
await writeFile("profile/assets/cadence.svg",out);

console.log(`Updated BYPASS IDC analytics: ${repos.length} public repositories, ${languages.length} primary languages.`);
