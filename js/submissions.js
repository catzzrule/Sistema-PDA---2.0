// Utilidades compartilhadas entre admin.js, ouvidoria.js e wizard.js para lidar
// com o workflow de aprovação (Área -> Ouvidoria -> CGTI) das respostas.
import { sb } from './supabase-client.js';
import { showToast } from './toast.js';
import { STATUS_LABELS } from './status-labels.js';

export { STATUS_LABELS };

export function mapSubmissionRow(row) {
  return {
    id: row.id,
    timestamp: new Date(row.created_at).toLocaleString('pt-BR'),
    area: row.area,
    data: row.data,
    status: row.status,
    rejectionReason: row.rejection_reason,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toLocaleString('pt-BR') : null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toLocaleString('pt-BR') : null,
    portalLink: row.portal_link,
  };
}

// orderAscending=true -> mais antigas primeiro (fila de revisão da Ouvidoria).
export async function fetchSubmissions(orderAscending = false) {
  const { data, error } = await sb
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: orderAscending });

  if (error) {
    showToast(`Erro ao carregar respostas: ${error.message}`, 'error');
    return [];
  }

  return data.map(mapSubmissionRow);
}

export function statusBadgeHtml(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="badge-status badge-status-${status}">${label}</span>`;
}
