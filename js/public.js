// Página pública de uma base de dados confirmada (publico.html?id=...).
// Não faz parte do app autenticado — usa a chave anônima do Supabase direto,
// sem login: lê os metadados pela view public.public_datasets e, se houver
// arquivo anexado, abre a planilha/documento em si (via SheetJS, 100% no
// navegador — nada é enviado a serviços externos), imitando a experiência de
// abrir um arquivo "online" que o SharePoint dava.
import { sb } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';
import { generateReportHTML, escapeHtml } from './report.js';

const contentEl = document.getElementById('public-content');
const filesEl = document.getElementById('public-files');

// Não precisa ser um link permanente: é gerado de novo a cada visita à página
// (que essa sim é o link permanente), só precisa durar o tempo de carregar.
const SIGNED_URL_TTL_SECONDS = 300;

const SPREADSHEET_EXTS = ['xlsx', 'xls', 'csv', 'ods'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

function renderNotFound() {
  contentEl.innerHTML = `
    <div class="public-state">
      <i class="fa-solid fa-folder-open"></i>
      Nenhuma base publicada foi encontrada para este link.<br>
      Verifique se o endereço está completo ou se a base já foi confirmada pela CGTI.
    </div>
  `;
}

function renderError(message) {
  contentEl.innerHTML = `
    <div class="public-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Não foi possível carregar esta ficha agora.<br>
      <span style="font-size: 0.8rem;">${escapeHtml(message)}</span>
    </div>
  `;
}

function getExtension(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename || '');
  return match ? match[1].toLowerCase() : '';
}

function createFileCard(label, filename) {
  const card = document.createElement('div');
  card.className = 'file-preview-card';

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
  filesEl.appendChild(card);

  return { body, status };
}

function renderSpreadsheet(body, arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const html = XLSX.utils.sheet_to_html(firstSheet, { editable: false });

  const wrap = document.createElement('div');
  wrap.className = 'file-preview-table-wrap';
  wrap.innerHTML = html;
  body.appendChild(wrap);
}

function renderPdf(body, url) {
  const iframe = document.createElement('iframe');
  iframe.className = 'file-preview-frame';
  iframe.src = url;
  body.appendChild(iframe);
}

function renderImage(body, url) {
  const img = document.createElement('img');
  img.className = 'file-preview-image';
  img.src = url;
  body.appendChild(img);
}

function renderDownloadFallback(body, url, filename) {
  const wrap = document.createElement('div');
  wrap.className = 'file-preview-fallback';
  wrap.innerHTML = `
    <i class="fa-solid fa-file-arrow-down" style="font-size: 1.8rem; display: block; margin-bottom: 0.75rem;"></i>
    Pré-visualização não disponível para este tipo de arquivo.<br>
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-outline"
      style="display: inline-flex; margin-top: 0.75rem;">
      <i class="fa-solid fa-download"></i> Baixar ${escapeHtml(filename)}
    </a>
  `;
  body.appendChild(wrap);
}

async function loadFilePreview(label, filename, path) {
  if (!path) return;
  const { body, status } = createFileCard(label, filename);

  let signedUrl;
  try {
    const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Link indisponível.');
    signedUrl = data.signedUrl;
  } catch (err) {
    status.textContent = '';
    body.innerHTML = `<div class="file-preview-fallback">Não foi possível carregar este arquivo agora.</div>`;
    return;
  }

  status.textContent = '';
  const ext = getExtension(filename);

  if (SPREADSHEET_EXTS.includes(ext)) {
    try {
      const resp = await fetch(signedUrl);
      if (!resp.ok) throw new Error('download failed');
      const buffer = await resp.arrayBuffer();
      renderSpreadsheet(body, buffer);
      return;
    } catch (err) {
      // Se não der pra renderizar como planilha, cai no link de download abaixo.
    }
  } else if (ext === 'pdf') {
    renderPdf(body, signedUrl);
    return;
  } else if (IMAGE_EXTS.includes(ext)) {
    renderImage(body, signedUrl);
    return;
  }

  renderDownloadFallback(body, signedUrl, filename);
}

async function loadPublicDataset() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    renderNotFound();
    return;
  }

  const { data: row, error } = await sb
    .from('public_datasets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    renderError(error.message);
    return;
  }
  if (!row) {
    renderNotFound();
    return;
  }

  const confirmedDate = row.confirmed_at ? new Date(row.confirmed_at).toLocaleDateString('pt-BR') : '';
  contentEl.innerHTML = generateReportHTML(row.data, row.id, confirmedDate, { status: 'confirmada_cgti' });

  await Promise.all([
    loadFilePreview('Arquivo do Recurso', row.data.q22_arquivo_recurso, row.data.q22_arquivo_recurso_path),
    loadFilePreview('Dicionário de Dados', row.data.q25_arquivo_dicionario, row.data.q25_arquivo_dicionario_path),
  ]);
}

loadPublicDataset();
