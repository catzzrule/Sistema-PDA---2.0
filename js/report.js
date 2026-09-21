// Geração do relatório de uma resposta (usado no resumo do passo 3, na impressão/PDF
// e no modal de detalhe do admin) — construído a partir de FORM_FIELDS, então uma
// pergunta nova aparece aqui automaticamente sem precisar editar este arquivo.
import { FORM_FIELDS, isFieldVisible } from './fields.js';
import { STATUS_LABELS } from './status-labels.js';

// Escapa texto vindo de usuários antes de injetar em innerHTML (previne XSS armazenado)
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDisplayValue(data, field) {
  if (field.type === 'date-range') {
    const start = data[field.id] || 'N/A';
    const end = data[field.pairId] || 'N/A';
    return `De ${escapeHtml(start)} até ${escapeHtml(end)}`;
  }

  const val = data[field.id];
  const fallback = 'Não informado';
  const raw = Array.isArray(val)
    ? (val.length ? val.join(', ') : fallback)
    : (val && val.toString().trim() ? val : fallback);
  return escapeHtml(raw);
}

function renderFieldRow(data, field) {
  const valueStyle = field.emphasize ? ' style="font-weight: 600;"' : '';
  return `
          <tr>
            <td class="col-label">${escapeHtml(field.number)}. ${escapeHtml(field.label)}</td>
            <td class="col-value"${valueStyle}>${getDisplayValue(data, field)}</td>
          </tr>`;
}

function renderStatusBlock(meta) {
  if (!meta || !meta.status) return '';

  const label = STATUS_LABELS[meta.status] || meta.status;
  const reasonLine = meta.status === 'rejeitada' && meta.rejectionReason
    ? `<div style="margin-top: 0.35rem;"><strong>Motivo da rejeição:</strong> ${escapeHtml(meta.rejectionReason)}</div>`
    : '';

  return `
      <div class="summary-section-title" style="margin-top: 0;">Status do Workflow</div>
      <div class="report-table" style="padding: 0.9rem 1.1rem; margin-bottom: 1.5rem; box-shadow: none;">
        <div><strong>Situação atual:</strong> ${escapeHtml(label)}</div>
        ${reasonLine}
      </div>`;
}

function renderSectionTable(data, sectionNumber) {
  const rows = FORM_FIELDS
    .filter(f => f.section === sectionNumber && isFieldVisible(data, f))
    .map(f => renderFieldRow(data, f))
    .join('');

  return `<table class="report-table"><tbody>${rows}</tbody></table>`;
}

export function generateReportHTML(data, subId = '', subTimestamp = '', meta = null) {
  const emitDate = subTimestamp || new Date().toLocaleDateString('pt-BR');
  const headerId = subId
    ? `<span style="font-size: 0.85rem; color: #1351b4; font-weight: bold;">#ID: ${escapeHtml(subId)}</span>`
    : '';

  return `
      <div class="print-header">
        <div class="print-header-top">
          <div>
            <div class="gov-title">PORTAL DADOS.GOV.BR • GOVERNO FEDERAL</div>
            <div class="doc-title">Ficha de Cadastro de Conjunto de Dados</div>
          </div>
          <div>${headerId}</div>
        </div>
        <div class="print-meta">
          <span><strong>Órgão/Organização:</strong> Ministério do Esporte (MESP)</span>
          <span><strong>Data de Emissão:</strong> ${escapeHtml(emitDate)}</span>
        </div>
      </div>

      ${renderStatusBlock(meta)}

      <div class="summary-section-title">1. Identificação do Conjunto de Dados</div>
      ${renderSectionTable(data, 1)}

      <div class="summary-section-title" style="margin-top: 1.2rem;">2. Recursos e Dicionário de Dados</div>
      ${renderSectionTable(data, 2)}
    `;
}
