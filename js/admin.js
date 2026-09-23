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

  const publicLinkBlock = (item.status === 'confirmada_cgti' && item.portalLink) ? `
    <div class="report-table" style="padding: 0.9rem 1.1rem; margin-bottom: 1.5rem; box-shadow: none;">
      <strong>Link público:</strong>
      <a href="${escapeHtml(item.portalLink)}" target="_blank" rel="noopener">${escapeHtml(item.portalLink)}</a>
    </div>` : '';

  adminModalBody.innerHTML = generateReportHTML(item.data, item.id, item.timestamp, toMeta(item)) + publicLinkBlock;
  adminDetailModal.classList.add('show');
}

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

// Monta o link público de "publico.html?id=..." a partir da URL atual, sem
// depender de estar em / ou em /algum-subcaminho/ (ex: GitHub Pages de projeto).
function buildPublicLink(id) {
  const basePath = window.location.pathname.replace(/[^/]*$/, '');
  return `${window.location.origin}${basePath}publico.html?id=${id}`;
}

// Gera o link público permanente da base (view public.public_datasets, ver
// schema.sql — só metadados, nunca expira porque nunca é regenerado depois de
// criado) e confirma o recebimento pela CGTI. A integração real com a API do
// dados.gov.br fica para uma etapa futura; por enquanto este link já serve
// pra disponibilizar a ficha publicamente, sem login.
async function confirmReceipt(id) {
  if (!confirm('Confirmar o recebimento desta base? Isso vai gerar o link público e marcar a resposta como publicada.')) return;

  const portalLink = buildPublicLink(id);
  const { error } = await sb
    .from('submissions')
    .update({ status: 'confirmada_cgti', portal_link: portalLink, portal_link_generated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    showToast(`Erro ao confirmar recebimento: ${error.message}`, 'error');
    return;
  }
  await refreshSubmissions();
  showToast('Recebimento confirmado! Link público gerado.');
}

async function copyPublicLink(id) {
  const item = cachedSubmissions.find(s => s.id === id);
  const link = item?.portalLink || buildPublicLink(id);
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link público copiado para a área de transferência.');
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
