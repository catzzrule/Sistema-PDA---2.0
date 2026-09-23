// Página pública de uma base de dados confirmada (publico.html?id=...).
// Não faz parte do app autenticado — usa a chave anônima do Supabase direto,
// sem login, lendo só a view public.public_datasets (metadados, sem arquivos).
import { sb } from './supabase-client.js';
import { generateReportHTML, escapeHtml } from './report.js';

const contentEl = document.getElementById('public-content');

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
}

loadPublicDataset();
