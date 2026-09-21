// Painel da Ouvidoria: fila de respostas enviadas pelas áreas, aprovação ou
// rejeição (com motivo) antes do encaminhamento para a CGTI.
import { sb } from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';
import { escapeHtml, generateReportHTML } from './report.js';
import { showToast } from './toast.js';
import { fetchSubmissions, statusBadgeHtml } from './submissions.js';

let cachedQueue = [];
let activeItem = null;

const ouvDetailModal = document.getElementById('ouv-detail-modal');
const ouvModalBody = document.getElementById('ouv-modal-body');
const btnApprove = document.getElementById('btn-ouv-approve');
const btnReject = document.getElementById('btn-ouv-reject');
const rejectReasonBox = document.getElementById('ouv-reject-reason-box');
const rejectReasonInput = document.getElementById('ouv-reject-reason');
const btnDownloadRecurso = document.getElementById('btn-ouv-download-recurso');
const btnDownloadDicionario = document.getElementById('btn-ouv-download-dicionario');

function renderMetrics() {
  const fila = cachedQueue.filter(i => i.status === 'em_analise').length;
  const rejeitadas = cachedQueue.filter(i => i.status === 'rejeitada').length;
  const aprovadas = cachedQueue.filter(i => i.status === 'aprovada_ouvidoria' || i.status === 'confirmada_cgti').length;

  const elFila = document.getElementById('ouv-metric-fila');
  const elRejeitadas = document.getElementById('ouv-metric-rejeitadas');
  const elAprovadas = document.getElementById('ouv-metric-aprovadas');
  if (elFila) elFila.textContent = fila;
  if (elRejeitadas) elRejeitadas.textContent = rejeitadas;
  if (elAprovadas) elAprovadas.textContent = aprovadas;
}

function renderTable() {
  const tbody = document.getElementById('ouv-table-body');
  const searchVal = (document.getElementById('ouv-search-input')?.value || '').toLowerCase().trim();

  const filtered = cachedQueue.filter(item => {
    if (!searchVal) return true;
    const text = `${item.area || ''} ${item.data.q2_titulo_base || ''} ${item.data.q4_area_tecnica || ''} ${item.data.q12_palavras_chave || ''}`.toLowerCase();
    return text.includes(searchVal);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
          ${cachedQueue.length === 0 ? 'Nenhuma resposta enviada ainda pelas áreas.' : 'Nenhuma resposta encontrada para este termo de busca.'}
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
      <td>${statusBadgeHtml(item.status)}</td>
      <td style="text-align: center;">
        <button type="button" class="btn-action-icon" data-view-id="${escapeHtml(item.id)}" title="Analisar Resposta">
          <i class="fa-solid fa-magnifying-glass"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('ouv-search-input')?.addEventListener('input', renderTable);

async function refreshQueue() {
  cachedQueue = await fetchSubmissions(true);
  renderMetrics();
  renderTable();
}

async function downloadFile(path) {
  if (!path) return;
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60);
  if (error) {
    showToast(`Erro ao gerar link do arquivo: ${error.message}`, 'error');
    return;
  }
  window.open(data.signedUrl, '_blank');
}

function openDetail(id) {
  const item = cachedQueue.find(s => s.id === id);
  if (!item) return;
  activeItem = item;

  ouvModalBody.innerHTML = generateReportHTML(item.data, item.id, item.timestamp, {
    status: item.status,
    rejectionReason: item.rejectionReason,
  });

  const recursoPath = item.data.q22_arquivo_recurso_path;
  const dicionarioPath = item.data.q25_arquivo_dicionario_path;
  btnDownloadRecurso.style.display = recursoPath ? 'inline-flex' : 'none';
  btnDownloadDicionario.style.display = dicionarioPath ? 'inline-flex' : 'none';

  const pendingReview = item.status === 'em_analise';
  btnApprove.style.display = pendingReview ? 'inline-flex' : 'none';
  btnReject.style.display = pendingReview ? 'inline-flex' : 'none';
  rejectReasonBox.style.display = 'none';
  rejectReasonInput.value = '';

  ouvDetailModal.classList.add('show');
}

document.getElementById('ouv-table-body')?.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-view-id]');
  if (viewBtn) openDetail(viewBtn.dataset.viewId);
});

function closeModal() {
  ouvDetailModal.classList.remove('show');
  activeItem = null;
}

document.getElementById('btn-ouv-modal-close')?.addEventListener('click', closeModal);

btnDownloadRecurso?.addEventListener('click', () => downloadFile(activeItem?.data.q22_arquivo_recurso_path));
btnDownloadDicionario?.addEventListener('click', () => downloadFile(activeItem?.data.q25_arquivo_dicionario_path));

btnApprove?.addEventListener('click', async () => {
  if (!activeItem) return;
  const { error } = await sb.from('submissions').update({ status: 'aprovada_ouvidoria' }).eq('id', activeItem.id);
  if (error) {
    showToast(`Erro ao aprovar: ${error.message}`, 'error');
    return;
  }
  closeModal();
  await refreshQueue();
  showToast('Resposta aprovada e enviada para a CGTI.');
});

// Primeiro clique revela a caixa de motivo; segundo clique confirma a rejeição
// (evita um botão extra só para "abrir o campo de motivo").
btnReject?.addEventListener('click', async () => {
  if (!activeItem) return;

  if (rejectReasonBox.style.display === 'none') {
    rejectReasonBox.style.display = 'block';
    rejectReasonInput.focus();
    return;
  }

  const reason = rejectReasonInput.value.trim();
  if (!reason) {
    showToast('Descreva o motivo da rejeição antes de confirmar.', 'error');
    rejectReasonInput.focus();
    return;
  }

  const { error } = await sb.from('submissions').update({ status: 'rejeitada', rejection_reason: reason }).eq('id', activeItem.id);
  if (error) {
    showToast(`Erro ao rejeitar: ${error.message}`, 'error');
    return;
  }
  closeModal();
  await refreshQueue();
  showToast('Resposta rejeitada — a área foi notificada para reenviar.');
});

// Chamado pelo auth.js sempre que a Ouvidoria entra no próprio painel.
export async function enterOuvidoriaView() {
  await refreshQueue();
}
