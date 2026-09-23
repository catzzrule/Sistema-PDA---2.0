// Renderização de um arquivo anexado (planilha/PDF/imagem) dentro de um
// container — compartilhado entre publico.html (prévia embutida na ficha) e
// arquivo.html (visualização em tela cheia, tipo "abrir no Excel Online").
// Usa SheetJS pra ler a planilha 100% no navegador — o arquivo nunca é
// enviado a nenhum serviço externo, só é lido localmente pra virar tabela.
import { sb } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';
import { escapeHtml } from './report.js';

// Não precisa ser permanente: é gerado de novo a cada visita à página (essa
// sim é o link permanente), só precisa durar o tempo de carregar.
const SIGNED_URL_TTL_SECONDS = 300;

const SPREADSHEET_EXTS = ['xlsx', 'xls', 'csv', 'ods'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

export function getExtension(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename || '');
  return match ? match[1].toLowerCase() : '';
}

// Quantas células realmente têm algo (ignora as chaves de metadado "!ref",
// "!merges" etc.) — usado pra achar a aba com dados de verdade.
function countNonEmptyCells(sheet) {
  return Object.keys(sheet).filter(key => key[0] !== '!').length;
}

// Monta a tabela via DOM (textContent), não via innerHTML: o conteúdo vem de
// um arquivo enviado por terceiros, então precisa ser tratado como texto
// puro — nunca como HTML — mesmo que uma célula contenha algo como "<script>".
function sheetToTableElement(sheet) {
  // header:1 -> array de arrays (mantém o layout visual da planilha, sem
  // assumir que a primeira linha é "cabeçalho de objeto"); raw:false formata
  // números/datas como o Excel mostraria, não o valor cru da célula.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const table = document.createElement('table');
  rows.forEach(rowValues => {
    const tr = document.createElement('tr');
    rowValues.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell === null || cell === undefined ? '' : String(cell);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  return table;
}

function renderSpreadsheetInto(body, arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  let tabsBar = null;
  if (sheetNames.length > 1) {
    tabsBar = document.createElement('div');
    tabsBar.className = 'file-preview-sheet-tabs';
    body.appendChild(tabsBar);
  }

  const wrap = document.createElement('div');
  wrap.className = 'file-preview-table-wrap';
  body.appendChild(wrap);

  function showSheet(name) {
    wrap.innerHTML = '';
    wrap.appendChild(sheetToTableElement(workbook.Sheets[name]));
    if (tabsBar) {
      Array.from(tabsBar.children).forEach(btn => btn.classList.toggle('active', btn.dataset.sheet === name));
    }
  }

  if (tabsBar) {
    sheetNames.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-preview-sheet-tab';
      btn.dataset.sheet = name;
      btn.textContent = name;
      btn.addEventListener('click', () => showSheet(name));
      tabsBar.appendChild(btn);
    });
  }

  // A primeira aba de uma planilha real pode ser uma capa/resumo quase vazia
  // (foi exatamente o que aconteceu com o arquivo de teste desta base) — então
  // a aba inicial é escolhida pela quantidade de células preenchidas, não pela
  // posição. As outras abas continuam acessíveis pelas abas acima da tabela.
  let bestSheet = sheetNames[0];
  let bestCount = -1;
  sheetNames.forEach(name => {
    const count = countNonEmptyCells(workbook.Sheets[name]);
    if (count > bestCount) {
      bestCount = count;
      bestSheet = name;
    }
  });

  showSheet(bestSheet);
}

function renderPdfInto(body, url) {
  const iframe = document.createElement('iframe');
  iframe.className = 'file-preview-frame';
  iframe.src = url;
  body.appendChild(iframe);
}

function renderImageInto(body, url) {
  const img = document.createElement('img');
  img.className = 'file-preview-image';
  img.src = url;
  body.appendChild(img);
}

function renderDownloadFallbackInto(body) {
  const wrap = document.createElement('div');
  wrap.className = 'file-preview-fallback';
  wrap.innerHTML = `
    <i class="fa-solid fa-file-arrow-down" style="font-size: 1.8rem; display: block; margin-bottom: 0.75rem;"></i>
    Pré-visualização não disponível para este tipo de arquivo — use o botão "Baixar arquivo" acima.
  `;
  body.appendChild(wrap);
}

// Cria o card (cabeçalho + corpo) e já dispara o carregamento do arquivo nele.
// `fullpage: true` aplica o modificador de CSS que ocupa a altura da janela
// (usado em arquivo.html); embutido na ficha (publico.html) fica com altura
// limitada e rolagem própria.
export async function mountFilePreview(container, label, filename, path, { fullpage = false } = {}) {
  if (!path) return;

  const card = document.createElement('div');
  card.className = fullpage ? 'file-preview-card fullpage' : 'file-preview-card';

  const header = document.createElement('div');
  header.className = 'file-preview-header';
  header.innerHTML = `<span><i class="fa-solid fa-file"></i> <strong>${escapeHtml(label)}:</strong> ${escapeHtml(filename)}</span>`;

  const status = document.createElement('span');
  status.style.fontSize = '0.8rem';
  status.style.color = 'var(--text-muted)';
  status.textContent = 'Carregando...';
  header.appendChild(status);

  const body = document.createElement('div');
  body.className = 'file-preview-body';

  card.appendChild(header);
  card.appendChild(body);
  container.appendChild(card);

  let signedUrl;
  let downloadUrl;
  try {
    const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Link indisponível.');
    signedUrl = data.signedUrl;

    // Link separado com Content-Disposition: attachment (via a opção
    // "download"), pra baixar de verdade em vez de só abrir no navegador —
    // o link de visualização acima fica sem essa opção de propósito, senão
    // o PDF/imagem também forçaria download em vez de abrir inline.
    const { data: dlData } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: filename });
    downloadUrl = dlData?.signedUrl || signedUrl;
  } catch (err) {
    status.textContent = '';
    body.innerHTML = `<div class="file-preview-fallback">Não foi possível carregar este arquivo agora.</div>`;
    return;
  }

  status.textContent = '';

  const downloadBtn = document.createElement('a');
  downloadBtn.href = downloadUrl;
  downloadBtn.className = 'btn btn-outline';
  downloadBtn.style.padding = '0.4rem 0.8rem';
  downloadBtn.style.fontSize = '0.8rem';
  downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Baixar arquivo';
  header.appendChild(downloadBtn);

  const ext = getExtension(filename);

  if (SPREADSHEET_EXTS.includes(ext)) {
    try {
      const resp = await fetch(signedUrl);
      if (!resp.ok) throw new Error('download failed');
      const buffer = await resp.arrayBuffer();
      renderSpreadsheetInto(body, buffer);
      return;
    } catch (err) {
      // Se não der pra renderizar como planilha, cai no link de download abaixo.
    }
  } else if (ext === 'pdf') {
    renderPdfInto(body, signedUrl);
    return;
  } else if (IMAGE_EXTS.includes(ext)) {
    renderImageInto(body, signedUrl);
    return;
  }

  renderDownloadFallbackInto(body);
}
