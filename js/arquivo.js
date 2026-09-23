// Visualização de UM arquivo em tela cheia (arquivo.html?id=...&campo=recurso|dicionario).
// É o link que o CGTI copia pra compartilhar — abre direto o arquivo, sem
// passar pela ficha (publico.html), do jeito que um link de Excel Online abre
// direto a planilha. Sem login: usa a chave anônima do Supabase.
import { sb } from './supabase-client.js';
import { escapeHtml } from './report.js';
import { mountFilePreview } from './file-viewer.js';

const FIELD_MAP = {
  recurso: { label: 'Arquivo do Recurso', nameKey: 'q22_arquivo_recurso', pathKey: 'q22_arquivo_recurso_path' },
  dicionario: { label: 'Dicionário de Dados', nameKey: 'q25_arquivo_dicionario', pathKey: 'q25_arquivo_dicionario_path' },
};

const topbarEl = document.getElementById('arquivo-topbar');
const contentEl = document.getElementById('arquivo-content');

function renderState(html) {
  contentEl.innerHTML = `<div class="public-state">${html}</div>`;
}

async function loadArquivo() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const campo = params.get('campo');
  const fieldInfo = FIELD_MAP[campo];

  if (!id || !fieldInfo) {
    renderState('<i class="fa-solid fa-triangle-exclamation"></i>Link inválido: faltam informações do arquivo.');
    return;
  }

  const { data: row, error } = await sb
    .from('public_datasets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    renderState(`<i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar este arquivo agora.<br><span style="font-size: 0.8rem;">${escapeHtml(error.message)}</span>`);
    return;
  }
  if (!row) {
    renderState('<i class="fa-solid fa-folder-open"></i>Nenhuma base publicada foi encontrada para este link.');
    return;
  }

  const filename = row.data[fieldInfo.nameKey];
  const path = row.data[fieldInfo.pathKey];

  if (!path) {
    renderState(`<i class="fa-solid fa-folder-open"></i>Esta base não tem um arquivo de "${escapeHtml(fieldInfo.label)}" anexado.`);
    return;
  }

  const titulo = row.data.q2_titulo_base || 'Base de Dados';
  document.title = `${filename} – ${titulo} – MESP`;

  topbarEl.innerHTML = `
    <div>
      <strong>${escapeHtml(titulo)}</strong>
      <span style="color: var(--text-muted); font-size: 0.85rem;"> — ${escapeHtml(fieldInfo.label)}</span>
    </div>
    <a href="publico.html?id=${encodeURIComponent(row.id)}">
      <i class="fa-solid fa-circle-info"></i> Ver ficha completa da base
    </a>
  `;

  contentEl.innerHTML = '';
  await mountFilePreview(contentEl, fieldInfo.label, filename, path, { fullpage: true });
}

loadArquivo();
