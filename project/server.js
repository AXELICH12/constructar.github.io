// server.js
// Запуск: node server.js --port=3000
// Зависимости: express, multer, nanoid, fs-extra, open
// Устанавливать: npm i express multer nanoid fs-extra open

const express = require('express');
const multer = require('multer');
const fse = require('fs-extra');
const path = require('path');
const { nanoid } = require('nanoid');
const open = require('open');

const app = express();

// ==== порт ====
const argPort = (process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1];
const PORT = (() => {
  const p = Number(argPort || process.env.PORT || 3000);
  if (!Number.isInteger(p) || p < 1 || p > 9999) {
    console.error('Порт должен быть числом от 1 до 9999. Пример: node server.js --port=8080');
    process.exit(1);
  }
  return p;
})();

// ==== папки ====
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const SITES_DIR = path.join(ROOT, 'sites');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

fse.ensureDirSync(PUBLIC_DIR);
fse.ensureDirSync(SITES_DIR);
fse.ensureDirSync(UPLOADS_DIR);

app.use(express.json({ limit: '20mb' }));
app.use('/builder', express.static(PUBLIC_DIR));
app.use('/sites', express.static(SITES_DIR));

// ==== загрузка изображений ====
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${nanoid(6)}${ext}`);
  }
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  // возвращаем относительный путь, который потом скопируем в сайт
  res.json({ ok: true, filename: req.file.filename });
});

// ==== генерация сайта ====
app.post('/api/create-site', async (req, res) => {
  try {
    const { title, theme, blocks } = req.body || {};
    if (!title || !Array.isArray(blocks)) {
      return res.status(400).json({ error: 'Некорректные данные' });
    }

    const slugBase = (title || 'site')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'site';

    const siteId = `${slugBase}-${Date.now().toString(36)}-${nanoid(4)}`;
    const siteDir = path.join(SITES_DIR, siteId);
    const assetsDir = path.join(siteDir, 'assets');

    await fse.ensureDir(siteDir);
    await fse.ensureDir(assetsDir);

    // Копируем все использованные изображения из uploads в assets
    for (const b of blocks) {
      if (b.type === 'image' && b.filename) {
        const src = path.join(UPLOADS_DIR, b.filename);
        const dst = path.join(assetsDir, b.filename);
        if (await fse.pathExists(src)) await fse.copy(src, dst);
        b.src = `./assets/${b.filename}`; // путь внутри сайта
      }
    }

    // Собираем index.html, styles.css, script.js
    const html = buildHTML({ title, theme, blocks });
    const css = buildCSS(theme);
    const js = buildClientJS();

    await fse.writeFile(path.join(siteDir, 'index.html'), html, 'utf8');
    await fse.writeFile(path.join(siteDir, 'styles.css'), css, 'utf8');
    await fse.writeFile(path.join(siteDir, 'script.js'), js, 'utf8');

    const url = `http://localhost:${PORT}/sites/${siteId}/index.html`;
    res.json({ ok: true, url, siteId });
    console.log('✅ Сайт создан:', url);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка создания сайта' });
  }
});

// ==== старт ====
app.listen(PORT, async () => {
  const builderUrl = `http://localhost:${PORT}/builder/`;
  console.log(`🚀 Конструктор: ${builderUrl}`);
  console.log(`ℹ️  Порт: ${PORT} (не более 4 цифр)`);
  // Авто-открытие конструктора в браузере
  try { await open(builderUrl); } catch {}
});

// ==== шаблоны сборки сайта ====
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHTML({ title, theme, blocks }) {
  const body = blocks.map(b => {
    if (b.type === 'h1') {
      return `<h1 class="block block-h1">${esc(b.text || '')}</h1>`;
    } else if (b.type === 'p') {
      return `<p class="block block-p">${esc(b.text || '')}</p>`;
    } else if (b.type === 'image') {
      const alt = esc(b.alt || '');
      const src = esc(b.src || '');
      return `<figure class="block block-img"><img src="${src}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`;
    } else {
      return '';
    }
  }).join('\n');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="./styles.css"/>
</head>
<body class="theme-${esc(theme || 'light')}">
  <header class="site-header">
    <div class="container">
      <a class="site-brand" href="./index.html">${esc(title)}</a>
      <nav class="site-nav">
        <a href="./index.html">Главная</a>
      </nav>
    </div>
  </header>

  <main class="container">
${body}
  </main>

  <footer class="site-footer">
    <div class="container">© ${new Date().getFullYear()} — Сайт создан в мини-конструкторе</div>
  </footer>

  <script src="./script.js"></script>
</body>
</html>`;
}

function buildCSS(theme) {
  return `:root{
  --bg:#ffffff;--text:#111111;--muted:#6b7280;--brand:#2563eb;--card:#f9fafb;--border:#e5e7eb;
}
.theme-dark{--bg:#0b0f19;--text:#e5e7eb;--muted:#9aa4b2;--brand:#60a5fa;--card:#0f172a;--border:#1f2937;}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.container{max-width:960px;margin:0 auto;padding:16px}
.site-header,.site-footer{border-bottom:1px solid var(--border);border-top:1px solid var(--border);background:var(--card)}
.site-brand{font-weight:700;text-decoration:none;color:var(--text)}
.site-nav a{margin-left:12px;text-decoration:none;color:var(--brand)}
.block{margin:20px 0}
.block-h1{font-size:2rem;line-height:1.2;margin:32px 0 16px}
.block-p{font-size:1rem;color:var(--text)}
.block-img{margin:24px 0;text-align:center}
.block-img img{max-width:100%;border-radius:12px;border:1px solid var(--border)}
figcaption{font-size:.875rem;color:var(--muted);margin-top:6px}
button,a.btn{cursor:pointer;display:inline-block;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);text-decoration:none;color:var(--text)}
a.btn-primary,button.btn-primary{background:var(--brand);color:#fff;border-color:var(--brand)}
`;
}

function buildClientJS() {
  return `// тут можно добавить интерактив для готового сайта при желании`;
         }
