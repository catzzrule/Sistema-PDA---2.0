// Ponto de entrada: monta o painel de marca do login/troca de senha (compartilhado
// entre as duas telas via <template>, evitando duplicar o SVG/marca em cada uma)
// e inicializa a autenticação. wizard.js, admin.js, ouvidoria.js e
// atrasos-mock.js se auto-registram ao serem importados (event listeners), e
// auth.js os aciona conforme o perfil de quem loga (área, CGTI ou ouvidoria).
import './wizard.js';
import './admin.js';
import './ouvidoria.js';
import './atrasos-mock.js';
import { initAuth } from './auth.js';

function mountAuthBrandPanels() {
  const template = document.getElementById('tpl-auth-brand');
  if (!template) return;

  document.querySelectorAll('[data-auth-brand]').forEach((slot, index) => {
    const clone = template.content.cloneNode(true);

    // O template tem <linearGradient id="..."> fixos, referenciados por
    // stroke="url(#...)" nos <path>. Como é clonado mais de uma vez (login +
    // troca de senha), ids repetidos no mesmo documento quebrariam o url(#...)
    // de um dos dois — então cada clone recebe ids únicos aqui.
    clone.querySelectorAll('linearGradient[id]').forEach(gradient => {
      const oldId = gradient.id;
      const newId = `${oldId}-${index}`;
      gradient.id = newId;
      clone.querySelectorAll(`[stroke="url(#${oldId})"]`).forEach(el => {
        el.setAttribute('stroke', `url(#${newId})`);
      });
    });

    slot.appendChild(clone);
  });
}

mountAuthBrandPanels();
initAuth();
