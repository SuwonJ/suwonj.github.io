// /write shares a native template with /admin; generate it at build time.
import { readFile, writeFile } from 'node:fs/promises';
const admin = await readFile('admin/index.html', 'utf8');
const write = admin.replace('<title>Sulog Studio - CMS Dashboard</title>', '<title>Sulog Write</title>')
  .replace('href="/admin/" class="brand-logo"', 'href="/write/" class="brand-logo"')
  .replace('<span>Sulog Studio</span>', '<span>Sulog Write</span>')
  .replace('<span class="badge">PRO CMS</span>', '').replaceAll('#tmp (임시)', '#tmp')
  .replace('<div class="cat-opt" data-cat="research">#research</div>', '<div class="cat-opt" data-cat="research">#research</div><div class="cat-opt" data-cat="page">#page</div>')
  .replace('<script type="module" src="./admin.js?v=20"></script>', '<script type="module" src="./write.js?v=20"></script>\n    <script type="module" src="./pdf.js?v=20"></script>\n    <script type="module" src="./page-mode.js?v=20"></script>');
await writeFile('write/index.html', write.split('\n').map(line => line.trimEnd()).join('\n'));
