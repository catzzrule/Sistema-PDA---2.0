// Notificação flutuante compartilhada por todo o app.
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
let hideTimer = null;

export function showToast(msg, type = 'info') {
  toastMessage.textContent = msg;
  toast.style.background = type === 'error' ? '#dc2626' : '#1e293b';
  toast.classList.add('show');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
