// Exportação CSV do painel admin — usa FORM_FIELDS para incluir todas as perguntas
// (antes só exportava 6 colunas fixas; uma pergunta nova aparece aqui automaticamente).
import { FORM_FIELDS } from './fields.js';
import { STATUS_LABELS } from './status-labels.js';

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function getCsvValue(data, field) {
  if (field.type === 'date-range') {
    return `${data[field.id] || ''} a ${data[field.pairId] || ''}`;
  }
  const val = data[field.id];
  if (Array.isArray(val)) return val.join(', ');
  return val ?? '';
}

export function buildSubmissionsCsv(list) {
  const headers = [
    'Área', 'Data / Hora', 'Status', 'Motivo da Rejeição', 'Confirmado em', 'Link do Portal',
    ...FORM_FIELDS.map(f => `${f.number}. ${f.label}`)
  ];
  const rows = [headers.map(csvEscape).join(';')];

  list.forEach(item => {
    const row = [
      item.area || '',
      item.timestamp,
      STATUS_LABELS[item.status] || item.status || '',
      item.rejectionReason || '',
      item.confirmedAt || '',
      item.portalLink || '',
      ...FORM_FIELDS.map(f => getCsvValue(item.data, f))
    ];
    rows.push(row.map(csvEscape).join(';'));
  });

  return '﻿' + rows.join('\n');
}
