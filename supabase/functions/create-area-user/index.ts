// Edge Function: create-area-user
// Cria um novo login de área ou de ouvidoria no Supabase Auth.
// Só pode ser chamada por um usuário já autenticado com perfil "master" (CGTI) —
// isso é checado aqui dentro, no servidor, antes de usar a service_role key.
// Nunca chame admin.createUser() a partir do navegador: a service_role key
// dá acesso total ao banco e NUNCA deve existir em código de frontend.
//
// O perfil "master" nunca pode ser criado por aqui (só promoção manual via SQL
// Editor, ver schema.sql) — só "normal" (default) ou "ouvidoria".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Não autenticado.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Cliente no contexto de quem está chamando, só para descobrir quem é.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Sessão inválida ou expirada.' }, 401);
    }

    const { data: profile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'master') {
      return json({ error: 'Apenas a CGTI pode cadastrar novas áreas.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').trim();
    const password = body.password || '';
    const area = (body.area || '').trim();
    const role = (body.role || 'normal').trim();

    if (!email || !password || !area) {
      return json({ error: 'Preencha e-mail, senha e nome da área.' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
    }
    if (!['normal', 'ouvidoria'].includes(role)) {
      return json({ error: 'Perfil inválido.' }, 400);
    }

    // Cliente com privilégio administrativo — só existe aqui no servidor.
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { area },
    });

    if (createError) {
      return json({ error: createError.message }, 400);
    }

    // O trigger handle_new_user() sempre cria o profile como 'normal' — se o
    // perfil pedido for 'ouvidoria', promove aqui, com a service_role key
    // (que não é afetada pelos GRANTs de coluna que travam a role "authenticated").
    if (role !== 'normal') {
      const { error: roleError } = await adminClient
        .from('profiles')
        .update({ role })
        .eq('id', created.user!.id);

      if (roleError) {
        return json({ error: `Usuário criado, mas falhou ao definir o perfil: ${roleError.message}` }, 500);
      }
    }

    return json({ ok: true, user_id: created.user?.id });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro interno.' }, 500);
  }
});
