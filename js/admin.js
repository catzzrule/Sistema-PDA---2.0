// Painel do administrador (perfil master / CGTI): lista de respostas, filtros,
// exportação CSV, detalhe de resposta e cadastro de novas áreas.
import { sb } from './supabase-client.js';
import { escapeHtml, generateReportHTML } from './report.js';
import { buildSubmissionsCsv } from './csv.js';
import { showToast } from './toast.js';
import { fetchSubmissions, statusBadgeHtml } from './submissions.js';

let cachedSubmissions = [];

function toMeta(item) {
  return { status: item.status, rejectionReason: item.rejectionReason };
}

function renderAdminTable() {
  const list = cachedSubmissions;
  const adminBadgeCount = document.getElementById('admin-badge-count');
  const metricTotal = document.getElementById('metric-total');
  const metricAbertos = document.getElementById('metric-abertos');
  const metricOds = document.getElementById('metric-ods');
  const tbody = document.getElementById('admin-table-body');
  const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();

  if (adminBadgeCount) adminBadgeCount.textContent = list.length;
  if (metricTotal) metricTotal.textContent = list.length;

  let abertosCount = 0;
  let odsCount = 0;
  list.forEach(item => {
    if (item.data.q1_dados_abertos === 'Aberto') abertosCount++;
    if (item.data.q8_relacao_ods === 'SIM') odsCount++;
  });
  if (metricAbertos) metricAbertos.textContent = abertosCount;
  if (metricOds) metricOds.textContent = odsCount;

  const filtered = list.filter(item => {
    if (!searchVal) return true;
    const text = `${item.id} ${item.area || ''} ${item.data.q2_titulo_base || ''} ${item.data.q4_area_tecnica || ''} ${item.data.q5_email_area || ''} ${item.data.q12_palavras_chave || ''}`.toLowerCase();
    return text.includes(searchVal);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
          ${list.length === 0 ? 'Nenhuma resposta enviada ainda pelas áreas.' : 'Nenhuma resposta encontrada para este termo de busca.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.area || 'Área não identificada')}</strong></td>
      <td style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(item.timestamp)}</td>
      <td style="font-weight: 600;">${escapeHtml(item.data.q2_titulo_base || 'Sem Título')}</td>
      <td>${escapeHtml(item.data.q4_area_tecnica || 'Não informada')}</td>
      <td>${escapeHtml(item.data.q6_periodicidade || 'N/A')}</td>
      <td>
        <span class="${item.data.q1_dados_abertos === 'Aberto' ? 'badge-aberto' : 'badge-nao-aberto'}">
          ${escapeHtml(item.data.q1_dados_abertos || 'N/A')}
        </span>
      </td>
      <td>${statusBadgeHtml(item.status)}</td>
      <td style="text-align: center; white-space: nowrap;">
        ${item.status === 'aprovada_ouvidoria' ? `
        <button type="button" class="btn-action-icon" data-confirm-id="${escapeHtml(item.id)}" title="Confirmar Recebimento">
          <i class="fa-solid fa-check"></i>
        </button>` : ''}
        ${item.status === 'confirmada_cgti' ? `
        <button type="button" class="btn-action-icon" data-copy-link-id="${escapeHtml(item.id)}" title="Copiar Link Público">
          <i class="fa-solid fa-link"></i>
        </button>` : ''}
        <button type="button" class="btn-action-icon" data-view-id="${escapeHtml(item.id)}" title="Ver Detalhes">
          <i class="fa-solid fa-eye"></i>
        </button>
        <button type="button" class="btn-action-icon danger" data-delete-id="${escapeHtml(item.id)}" title="Excluir Resposta">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('admin-search-input')?.addEventListener('input', renderAdminTable);

// Delegação de evento: a tabela é toda recriada a cada render, então os
// listeners ficam num único elemento estável (tbody) em vez de por linha.
let activeDetailSubmission = null;
const adminDetailModal = document.getElementById('admin-detail-modal');
const adminModalBody = document.getElementById('admin-modal-body');

function viewSubmissionDetail(id) {
  const item = cachedSubmissions.find(s => s.id === id);
  if (!item) return;
  activeDetailSubmission = item;

  let publicLinksBlock = '';
  if (item.status === 'confirmada_cgti') {
    const rows = [
      ...getFileLinks(item).map(fl => ({ label: `Link do ${fl.label} (${fl.filename})`, url: fl.url })),
      { label: 'Link da ficha completa (metadados)', url: buildFichaLink(item.id) },
    ];

    publicLinksBlock = `
      <div class="report-table" style="padding: 0.9rem 1.1rem; margin-bottom: 1.5rem; box-shadow: none;">
        <strong style="display: block; margin-bottom: 0.5rem;">Links públicos</strong>
        ${rows.map(r => `
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; flex-wrap: wrap;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(r.label)}:</span>
            <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" style="font-size: 0.85rem; word-break: break-all;">${escapeHtml(r.url)}</a>
            <button type="button" class="btn-action-icon" data-copy-url="${escapeHtml(r.url)}" title="Copiar link" style="margin-left: auto;">
              <i class="fa-solid fa-copy"></i>
            </button>
          </div>
        `).join('')}
      </div>`;
  }

  adminModalBody.innerHTML = generateReportHTML(item.data, item.id, item.timestamp, toMeta(item)) + publicLinksBlock;
  adminDetailModal.classList.add('show');
}

adminModalBody?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy-url]');
  if (!btn) return;
  const url = btn.dataset.copyUrl;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copiado para a área de transferência.');
  } catch {
    showToast(url, 'info');
  }
});

async function deleteSubmission(id) {
  if (!confirm('Tem certeza que deseja excluir esta resposta?')) return;
  const { error } = await sb.from('submissions').delete().eq('id', id);
  if (error) {
    showToast(`Erro ao excluir: ${error.message}`, 'error');
    return;
  }
  await refreshSubmissions();
  showToast('Resposta excluída com sucesso.');
}

// Monta links a partir da URL atual, sem depender de estar em / ou em
// /algum-subcaminho/ (ex: GitHub Pages de projeto).
function basePath() {
  return window.location.pathname.replace(/[^/]*$/, '');
}

// Ficha com os metadados da base (publico.html).
function buildFichaLink(id) {
  return `${window.location.origin}${basePath()}publico.html?id=${id}`;
}

// Abre o arquivo em si, em tela cheia, tipo "Excel Online" — sem passar pela
// ficha. campo é 'recurso' (q22) ou 'dicionario' (q25).
function buildFileLink(id, campo) {
  return `${window.location.origin}${basePath()}arquivo.html?id=${id}&campo=${campo}`;
}

// Um link por arquivo anexado (se houver dois, dois links — nunca um só
// combinando os dois, é isso que faz o link abrir a planilha direto).
function getFileLinks(item) {
  const links = [];
  if (item.data.q22_arquivo_recurso_path) {
    links.push({ label: 'Recurso', filename: item.data.q22_arquivo_recurso, url: buildFileLink(item.id, 'recurso') });
  }
  if (item.data.q25_arquivo_dicionario_path) {
    links.push({ label: 'Dicionário', filename: item.data.q25_arquivo_dicionario, url: buildFileLink(item.id, 'dicionario') });
  }
  return links;
}

// Gera o(s) link(s) público(s) permanente(s) da base (view public.public_datasets
// + policy de Storage, ver schema.sql) e confirma o recebimento pela CGTI. A
// integração real com a API do dados.gov.br fica para uma etapa futura; por
// enquanto estes links já servem pra disponibilizar o arquivo publicamente,
// sem login, abrindo direto (não só a ficha de metadados).
async function confirmReceipt(id) {
  if (!confirm('Confirmar o recebimento desta base? Isso vai gerar os links públicos e marcar a resposta como publicada.')) return;

  const item = cachedSubmissions.find(s => s.id === id);
  const fileLinks = item ? getFileLinks(item) : [];
  const portalLink = fileLinks[0]?.url || buildFichaLink(id);

  const { error } = await sb
    .from('submissions')
    .update({ status: 'confirmada_cgti', portal_link: portalLink, portal_link_generated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    showToast(`Erro ao confirmar recebimento: ${error.message}`, 'error');
    return;
  }
  await refreshSubmissions();
  showToast('Recebimento confirmado! Link(s) público(s) gerado(s).');
}

async function copyPublicLink(id) {
  const item = cachedSubmissions.find(s => s.id === id);
  const fileLinks = item ? getFileLinks(item) : [];
  const link = fileLinks[0]?.url || item?.portalLink || buildFichaLink(id);
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link copiado para a área de transferência.');
  } catch {
    showToast(link, 'info');
  }
}

document.getElementById('admin-table-body')?.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-view-id]');
  if (viewBtn) return viewSubmissionDetail(viewBtn.dataset.viewId);

  const deleteBtn = e.target.closest('[data-delete-id]');
  if (deleteBtn) return deleteSubmission(deleteBtn.dataset.deleteId);

  const confirmBtn = e.target.closest('[data-confirm-id]');
  if (confirmBtn) return confirmReceipt(confirmBtn.dataset.confirmId);

  const copyLinkBtn = e.target.closest('[data-copy-link-id]');
  if (copyLinkBtn) return copyPublicLink(copyLinkBtn.dataset.copyLinkId);
});

document.getElementById('btn-admin-modal-close')?.addEventListener('click', () => adminDetailModal.classList.remove('show'));
document.getElementById('btn-admin-modal-ok')?.addEventListener('click', () => adminDetailModal.classList.remove('show'));

document.getElementById('btn-admin-modal-print')?.addEventListener('click', () => {
  if (!activeDetailSubmission) return;
  document.getElementById('summary-content').innerHTML = generateReportHTML(
    activeDetailSubmission.data, activeDetailSubmission.id, activeDetailSubmission.timestamp, toMeta(activeDetailSubmission)
  );
  window.print();
});

// ---------------------------------------------------------------------------
// Cadastro de novas áreas (via Edge Function segura — nunca cria usuário no
// navegador diretamente, só a Edge Function tem a service_role key)
// ---------------------------------------------------------------------------
const newAreaModal = document.getElementById('new-area-modal');
const newAreaForm = document.getElementById('new-area-form');
const newAreaRoleSelect = document.getElementById('new-area-role');
const newAreaNameInput = document.getElementById('new-area-name');
const newAreaEmailInput = document.getElementById('new-area-email');
const newAreaPasswordInput = document.getElementById('new-area-password');
const newAreaError = document.getElementById('new-area-error');
const newAreaErrorText = document.getElementById('new-area-error-text');
const btnNewAreaSubmit = document.getElementById('btn-new-area-submit');

document.getElementById('btn-admin-new-area')?.addEventListener('click', () => {
  newAreaForm.reset();
  newAreaError.style.display = 'none';
  newAreaModal.classList.add('show');
  setTimeout(() => newAreaNameInput.focus(), 150);
});

document.getElementById('btn-new-area-cancel')?.addEventListener('click', () => {
  newAreaModal.classList.remove('show');
});

newAreaForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  newAreaError.style.display = 'none';
  btnNewAreaSubmit.disabled = true;
  btnNewAreaSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cadastrando...';

  const area = newAreaNameInput.value.trim();
  const email = newAreaEmailInput.value.trim();
  const password = newAreaPasswordInput.value;
  const role = newAreaRoleSelect.value;

  try {
    const { data, error } = await sb.functions.invoke('create-area-user', { body: { email, password, area, role } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    newAreaModal.classList.remove('show');
    showToast(`${role === 'ouvidoria' ? 'Login de Ouvidoria' : 'Área'} "${area}" cadastrado(a) com sucesso!`);
  } catch (err) {
    newAreaErrorText.textContent = err.message || 'Erro ao cadastrar a área.';
    newAreaError.style.display = 'block';
  } finally {
    btnNewAreaSubmit.disabled = false;
    btnNewAreaSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Cadastrar';
  }
});

// ---------------------------------------------------------------------------
// Exportação CSV
// ---------------------------------------------------------------------------
document.getElementById('btn-admin-export-csv')?.addEventListener('click', () => {
  if (!cachedSubmissions.length) {
    showToast('Nenhuma resposta registrada para exportar.', 'error');
    return;
  }

  const csvContent = buildSubmissionsCsv(cachedSubmissions);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respostas_dados_gov_br_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Relatório CSV exportado com sucesso!');
});

async function refreshSubmissions() {
  cachedSubmissions = await fetchSubmissions(false);
  renderAdminTable();
}

// Chamado pelo auth.js sempre que o master (CGTI) entra no painel admin.
export async function enterAdminView() {
  await refreshSubmissions();
}
