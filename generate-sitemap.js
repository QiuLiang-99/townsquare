// 生成 sitemap.xml（可选构建后步骤）。默认使用环境变量 SITE_URL 或占位域名。
const fs = require("fs");
const path = require("path");

const SITE = process.env.SITE_URL || "https://example.com";
const dist = path.resolve(__dirname, "dist");
if (!fs.existsSync(dist)) {
  console.log("[sitemap] dist 不存在，跳过");
  process.exit(0);
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), xml);
console.log("[sitemap] 写入 dist/sitemap.xml for", SITE);
