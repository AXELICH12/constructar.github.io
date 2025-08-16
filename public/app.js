// public/app.js

const $ = sel => document.querySelector(sel);
const canvas = $('#canvas');
const titleInput = $('#site-title');
const themeSelect = $('#theme');
const addH1Btn = $('#add-h1');
const addPBtn = $('#add-p');
const addImgInput = $('#add-img');
const genBtn = $('#generate');
const resultLink = $('#result-link');

let blocks = []; // {id, type, text?, alt?, filename?}

function uid() { return Math.random().toString(36).slice(2, 9); }

function render() {
  canvas.innerHTML = '';
  for (const b of blocks) {
    const li = document.createElement('li');
    li.className = 'block';
    li.draggable = true;
    li.dataset.id = b.id;

    const grip = document.createElement('div');
    grip.className = 'grip';
    grip.textContent = '↕';
    li.appendChild(grip);

    if (b.type === 'h1' || b.type === 'p') {
      const ta = document.createElement('textarea');
      ta.value = b.text || '';
      ta.placeholder = b.type === 'h1' ? 'Заголовок...' : 'Текст...';
      ta.addEventListener('input', () => { b.text = ta.value; });
      li.appendChild(ta);
    } else if (b.type === 'image') {
      const wrapper = document.createElement('div');
      const img = document.createElement('img');
      img.alt = b.alt || '';
      img.src = b.preview || '#';
      wrapper.appendChild(img);

      const alt = document.createElement('input');
      alt.type = 'text';
      alt.placeholder = 'Подпись к картинке';
      alt.value = b.alt || '';
      alt.addEventListener('input', () => { b.alt = alt.value; });
      wrapper.appendChild(alt);
      li.appendChild(wrapper);
    }

    const ctrls = document.createElement('div');
    ctrls.className = 'controls';
    const up = document.createElement('button'); up.textContent = '↑';
    const down = document.createElement('button'); down.textContent = '↓';
    const del = document.createElement('button'); del.textContent = 'Удалить';
    up.onclick = () => move(b.id, -1);
    down.onclick = () => move(b.id, +1);
    del.onclick = () => removeBlock(b.id);
    ctrls.append(up, down, del);
    li.appendChild(ctrls);

    // drag & drop
    li.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/id', b.id);
    });
    li.addEventListener('dragover', e => e.preventDefault());
    li.addEventListener('drop', e => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData('text/id');
      const toId = b.id;
      reorder(fromId, toId);
    });

    canvas.appendChild(li);
  }
}

function move(id, dir) {
  const i = blocks.findIndex(b => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  render();
}

function reorder(fromId, toId) {
  if (fromId === toId) return;
  const fromIdx = blocks.findIndex(b => b.id === fromId);
  const toIdx = blocks.findIndex(b => b.id === toId);
  const [item] = blocks.splice(fromIdx, 1);
  blocks.splice(toIdx, 0, item);
  render();
}

function removeBlock(id) {
  blocks = blocks.filter(b => b.id !== id);
  render();
}

addH1Btn.onclick = () => {
  blocks.push({ id: uid(), type: 'h1', text: 'Новый заголовок' });
  render();
};

addPBtn.onclick = () => {
  blocks.push({ id: uid(), type: 'p', text: 'Новый текстовый блок' });
  render();
};

addImgInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  // Загружаем файл на сервер (в папку uploads)
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await r.json();
  if (!data.ok) { alert('Ошибка загрузки'); return; }

  const reader = new FileReader();
  reader.onload = () => {
    blocks.push({
      id: uid(),
      type: 'image',
      filename: data.filename, // имя файла на сервере
      preview: reader.result,  // превью для конструктора
      alt: file.name.replace(/\.[^.]+$/, '')
    });
    render();
  };
  reader.readAsDataURL(file);
  // сброс
  e.target.value = '';
};

genBtn.onclick = async () => {
  const title = titleInput.value.trim() || 'Без названия';
  const theme = themeSelect.value || 'light';

  // Подготавливаем минимальные данные для сборки
  const blocksForBuild = blocks.map(b => {
    if (b.type === 'image') {
      return { type: 'image', filename: b.filename, alt: b.alt || '' };
    } else if (b.type === 'h1') {
      return { type: 'h1', text: (b.text || '').trim() };
    } else if (b.type === 'p') {
      return { type: 'p', text: (b.text || '').trim() };
    }
    return null;
  }).filter(Boolean);

  const resp = await fetch('/api/create-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, theme, blocks: blocksForBuild })
  });
  const data = await resp.json();
  if (!data.ok) {
    alert('Ошибка создания сайта');
    return;
  }
  resultLink.href = data.url;
  resultLink.style.display = 'inline-block';
  resultLink.textContent = 'Открыть сайт';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
