// Autenticação (Supabase Auth) — login, troca de senha obrigatória e roteamento
// entre a tela de área (formulário) e a tela de CGTI (painel admin).
import { sb } from './supabase-client.js';
import { session } from './session.js';
import { showToast } from './toast.js';
import { enterUserView } from './wizard.js';
import { enterAdminView } from './admin.js';
import { enterOuvidoriaView } from './ouvidoria.js';
import { enterAtrasosView } from './atrasos-mock.js';

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loginView = document.getElementById('login-view');
const forcePasswordView = document.getElementById('force-password-view');
const userView = document.getElementById('user-view');
const adminView = document.getElementById('admin-view');
const ouvidoriaView = document.getElementById('ouvidoria-view');
const atrasosView = document.getElementById('atrasos-view');
const headerActions = document.getElementById('header-actions-authenticated');
const btnFillDemo = document.getElementById('btn-fill-demo');
const btnToggleAdmin = document.getElementById('btn-toggle-admin');
const userBadgeText = document.getElementById('user-badge-text');
const btnLogout = document.getElementById('btn-logout');

const ouvidoriaNavTabs = document.getElementById('ouvidoria-nav-tabs');
const btnNavOuvPainel = document.getElementById('btn-nav-ouv-painel');
const btnNavOuvAtrasos = document.getElementById('btn-nav-ouv-atrasos');

const ROLE_LABELS = { master: 'CGTI (Master)', ouvidoria: 'Ouvidoria', normal: 'Área' };

const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginErrorText = document.getElementById('login-error-text');
const btnLoginSubmit = document.getElementById('btn-login-submit');
const btnToggleLoginPassword = document.getElementById('btn-toggle-login-password');
const iconLoginEye = document.getElementById('icon-login-eye');

const forcePasswordForm = document.getElementById('force-password-form');
const forcePasswordNewInput = document.getElementById('force-password-new');
const forcePasswordConfirmInput = document.getElementById('force-password-confirm');
const forcePasswordError = document.getElementById('force-password-error');
const forcePasswordErrorText = document.getElementById('force-password-error-text');
const btnForcePasswordSubmit = document.getElementById('btn-force-password-submit');

function showLoginView() {
  session.user = null;
  session.profile = null;
  authScreen.style.display = 'block';
  appShell.style.display = 'none';
  loginView.style.display = 'flex';
  forcePasswordView.style.display = 'none';
  headerActions.style.display = 'none';
  btnToggleAdmin.style.display = 'none';
  ouvidoriaNavTabs.style.display = 'none';
  loginForm.reset();
  loginError.style.display = 'none';
}

function showForcePasswordView() {
  authScreen.style.display = 'block';
  appShell.style.display = 'none';
  loginView.style.display = 'none';
  forcePasswordView.style.display = 'flex';
  forcePasswordForm.reset();
  forcePasswordError.style.display = 'none';
}

function hideAppViews() {
  userView.style.display = 'none';
  adminView.style.display = 'none';
  ouvidoriaView.style.display = 'none';
  atrasosView.style.display = 'none';
}

function showUserView() {
  authScreen.style.display = 'none';
  appShell.style.display = 'block';
  hideAppViews();
  userView.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showAdminView() {
  authScreen.style.display = 'none';
  appShell.style.display = 'block';
  hideAppViews();
  adminView.style.display = 'block';
  await enterAdminView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setOuvidoriaNavActive(tab) {
  btnNavOuvPainel.classList.toggle('active', tab === 'painel');
  btnNavOuvAtrasos.classList.toggle('active', tab === 'atrasos');
}

async function showOuvidoriaView() {
  authScreen.style.display = 'none';
  appShell.style.display = 'block';
  hideAppViews();
  ouvidoriaView.style.display = 'block';
  setOuvidoriaNavActive('painel');
  await enterOuvidoriaView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAtrasosView() {
  authScreen.style.display = 'none';
  appShell.style.display = 'block';
  hideAppViews();
  atrasosView.style.display = 'block';
  setOuvidoriaNavActive('atrasos');
  enterAtrasosView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

btnNavOuvPainel?.addEventListener('click', showOuvidoriaView);
btnNavOuvAtrasos?.addEventListener('click', showAtrasosView);

function updateUserBadge(profile) {
  userBadgeText.textContent = `${profile.area || profile.email} • ${ROLE_LABELS[profile.role] || profile.role}`;
  headerActions.style.display = 'flex';
}

async function enterAuthenticatedArea(profile) {
  // "Preenchimento Demo" só faz sentido pra quem preenche o formulário (área).
  btnFillDemo.style.display = profile.role === 'normal' ? '' : 'none';
  // O botão de alternar pro Painel Admin só existe pra CGTI (master já podia
  // pré-visualizar a tela de formulário; ouvidoria não precisa disso).
  btnToggleAdmin.style.display = profile.role === 'master' ? 'inline-flex' : 'none';
  // Abas de navegação (Painel da Ouvidoria / Dashboard de Atrasos) só fazem
  // sentido pra quem está logado como ouvidoria.
  ouvidoriaNavTabs.style.display = profile.role === 'ouvidoria' ? 'flex' : 'none';

  if (profile.role === 'master') {
    await showAdminView();
  } else if (profile.role === 'ouvidoria') {
    await showOuvidoriaView();
  } else {
    showUserView();
    enterUserView();
  }
}

async function onLoggedIn(user) {
  session.user = user;

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    showToast('Não foi possível carregar seu perfil. Contate a CGTI.', 'error');
    await sb.auth.signOut();
    showLoginView();
    return;
  }

  session.profile = profile;
  updateUserBadge(profile);

  if (profile.must_change_password) {
    showForcePasswordView();
    return;
  }

  await enterAuthenticatedArea(profile);
}

async function fullLogout() {
  await sb.auth.signOut();
  showLoginView();
  showToast('Sessão encerrada.');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  btnLoginSubmit.disabled = true;
  btnLoginSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  btnLoginSubmit.disabled = false;
  btnLoginSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';

  if (error) {
    loginErrorText.textContent = 'E-mail ou senha incorretos.';
    loginError.style.display = 'block';
    return;
  }

  await onLoggedIn(data.user);
});

forcePasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  forcePasswordError.style.display = 'none';

  const newPassword = forcePasswordNewInput.value;
  const confirmPassword = forcePasswordConfirmInput.value;

  if (newPassword.length < 6) {
    forcePasswordErrorText.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
    forcePasswordError.style.display = 'block';
    return;
  }
  if (newPassword !== confirmPassword) {
    forcePasswordErrorText.textContent = 'As senhas não coincidem.';
    forcePasswordError.style.display = 'block';
    return;
  }

  btnForcePasswordSubmit.disabled = true;
  btnForcePasswordSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

  try {
    const { error: updateAuthError } = await sb.auth.updateUser({ password: newPassword });
    if (updateAuthError) throw updateAuthError;

    const { error: updateProfileError } = await sb
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', session.user.id);
    if (updateProfileError) throw updateProfileError;

    session.profile.must_change_password = false;
    showToast('Senha definida com sucesso!');

    await enterAuthenticatedArea(session.profile);
  } catch (err) {
    forcePasswordErrorText.textContent = err.message || 'Erro ao definir a nova senha.';
    forcePasswordError.style.display = 'block';
  } finally {
    btnForcePasswordSubmit.disabled = false;
    btnForcePasswordSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Definir Senha e Continuar';
  }
});

btnToggleLoginPassword?.addEventListener('click', () => {
  const isHidden = loginPasswordInput.type === 'password';
  loginPasswordInput.type = isHidden ? 'text' : 'password';
  iconLoginEye.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

// "Esqueci minha senha" — envia um link de redefinição por e-mail
document.getElementById('btn-forgot-password')?.addEventListener('click', async () => {
  const email = loginEmailInput.value.trim();
  loginError.style.display = 'none';

  if (!email) {
    loginErrorText.textContent = 'Digite seu e-mail no campo acima para receber o link de redefinição.';
    loginError.style.display = 'block';
    return;
  }

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('#')[0].split('?')[0]
  });

  if (error) {
    loginErrorText.textContent = error.message;
    loginError.style.display = 'block';
    return;
  }

  showToast('Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha.');
});

btnLogout?.addEventListener('click', fullLogout);

btnToggleAdmin.addEventListener('click', async () => {
  if (adminView.style.display === 'none') {
    await showAdminView();
  } else {
    showUserView();
  }
});

export async function initAuth() {
  showLoginView();

  const { data: { session: activeSession } } = await sb.auth.getSession();
  if (activeSession) {
    await onLoggedIn(activeSession.user);
  }

  sb.auth.onAuthStateChange(async (event, recoverySession) => {
    if (event === 'SIGNED_OUT') {
      showLoginView();
    } else if (event === 'PASSWORD_RECOVERY' && recoverySession) {
      // Usuário clicou no link de "Esqueci minha senha" — deixa definir uma nova
      session.user = recoverySession.user;
      const { data: profile } = await sb
        .from('profiles')
        .select('*')
        .eq('id', recoverySession.user.id)
        .single();
      session.profile = profile || null;
      if (session.profile) updateUserBadge(session.profile);
      showForcePasswordView();
    }
  });
}
