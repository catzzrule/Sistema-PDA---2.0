// Estado de sessão compartilhado entre auth.js, wizard.js e admin.js.
// Simples objeto mutável em vez de passar callbacks entre os módulos.
export const session = {
  user: null,
  profile: null,
};
