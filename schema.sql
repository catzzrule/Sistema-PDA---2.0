-- ============================================================================
-- Schema do Sistema PDA (Plano de Dados Abertos) - MESP
-- Rode este script inteiro em: Supabase -> SQL Editor -> New query -> Run
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Perfis (master = CGTI, ouvidoria = OUV, normal = área)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'normal' check (role in ('master', 'normal')),
  area text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Adiciona o perfil "ouvidoria" (revisão das respostas antes da CGTI) ao check
-- original, que só aceitava master/normal.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('master', 'normal', 'ouvidoria'));

alter table public.profiles enable row level security;

-- Funções auxiliares (security definer) para checar o perfil do usuário logado,
-- sem causar recursão nas políticas de RLS da própria tabela profiles.
create or replace function public.is_master()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'master'
  );
$$;

create or replace function public.is_ouvidoria()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'ouvidoria'
  );
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_master() or public.is_ouvidoria());

-- ----------------------------------------------------------------------------
-- 2. Gatilho: ao criar um usuário no Auth, copia a área dos metadados.
--    IMPORTANTE: o "role" NUNCA é lido dos metadados aqui — sempre entra como
--    'normal'. Isso impede que alguém se autopromova a "master" chamando a
--    API pública de cadastro (auth.signUp) com {"role":"master"} nos metadados.
--    Uma conta só vira master por ação manual da CGTI (UPDATE nesta tabela).
--    Toda conta nova já nasce com must_change_password = true, pois foi
--    criada pela CGTI com uma senha provisória.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, area, must_change_password)
  values (
    new.id,
    new.email,
    'normal',
    new.raw_user_meta_data ->> 'area',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    area = excluded.area;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cada usuário só pode alterar a própria flag "must_change_password" (depois
-- de trocar a senha) — nunca o próprio role, area ou email. A restrição de
-- coluna abaixo garante isso mesmo que a política de RLS libere a linha.
revoke update on public.profiles from authenticated;
grant update (must_change_password) on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 3. Respostas enviadas pelas áreas
-- ----------------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Workflow de aprovação: Área envia -> Ouvidoria revisa (aprova ou rejeita com
-- motivo, pedindo reenvio) -> CGTI confirma o recebimento da aprovada.
alter table public.submissions add column if not exists status text not null default 'em_analise';
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('em_analise', 'rejeitada', 'aprovada_ouvidoria', 'confirmada_cgti'));

alter table public.submissions add column if not exists reviewed_by uuid references auth.users(id);
alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists rejection_reason text;
alter table public.submissions add column if not exists confirmed_by uuid references auth.users(id);
alter table public.submissions add column if not exists confirmed_at timestamptz;
alter table public.submissions add column if not exists portal_link text;
alter table public.submissions add column if not exists portal_link_generated_at timestamptz;

-- Defesa em profundidade: mesmo que a UI tenha um bug, o banco não aceita um
-- estado inconsistente (ex.: "rejeitada" sem motivo, ou "aprovada" sem revisor).
alter table public.submissions drop constraint if exists submissions_rejeicao_precisa_motivo;
alter table public.submissions add constraint submissions_rejeicao_precisa_motivo
  check (status <> 'rejeitada' or rejection_reason is not null);

alter table public.submissions drop constraint if exists submissions_aprovacao_precisa_revisor;
alter table public.submissions add constraint submissions_aprovacao_precisa_revisor
  check (status not in ('aprovada_ouvidoria', 'confirmada_cgti')
         or (reviewed_by is not null and reviewed_at is not null));

alter table public.submissions drop constraint if exists submissions_confirmacao_precisa_cgti;
alter table public.submissions add constraint submissions_confirmacao_precisa_cgti
  check (status <> 'confirmada_cgti' or (confirmed_by is not null and confirmed_at is not null));

alter table public.submissions enable row level security;

-- INSERT: só a própria área, e só nas colunas que ela deveria poder preencher.
-- "status" nunca vem do cliente — sempre nasce com o DEFAULT 'em_analise'.
revoke insert on public.submissions from authenticated;
grant insert (id, user_id, area, data) on public.submissions to authenticated;

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own" on public.submissions
  for insert with check (auth.uid() = user_id and status = 'em_analise');

-- SELECT: dono da resposta, Ouvidoria (revisão) e CGTI (master) veem tudo.
drop policy if exists "submissions_select" on public.submissions;
create policy "submissions_select" on public.submissions
  for select using (auth.uid() = user_id or public.is_master() or public.is_ouvidoria());

-- UPDATE: uma política por ator do workflow, cada uma restrita à sua própria
-- transição de estado (área só reabre o que a Ouvidoria rejeitou; Ouvidoria só
-- decide o que está em análise; CGTI só confirma o que a Ouvidoria aprovou).
drop policy if exists "submissions_update_own_resubmit" on public.submissions;
create policy "submissions_update_own_resubmit" on public.submissions
  for update
  using (auth.uid() = user_id and status = 'rejeitada')
  with check (auth.uid() = user_id and status = 'em_analise');

drop policy if exists "submissions_update_ouvidoria_review" on public.submissions;
create policy "submissions_update_ouvidoria_review" on public.submissions
  for update
  using (public.is_ouvidoria() and status = 'em_analise')
  with check (public.is_ouvidoria() and status in ('rejeitada', 'aprovada_ouvidoria'));

drop policy if exists "submissions_update_master_confirm" on public.submissions;
create policy "submissions_update_master_confirm" on public.submissions
  for update
  using (public.is_master() and status = 'aprovada_ouvidoria')
  with check (public.is_master() and status = 'confirmada_cgti');

-- GRANT de coluna para UPDATE: nunca deixa id/user_id/area/created_at serem
-- tocados por nenhum perfil. As demais colunas ainda precisam do trigger
-- abaixo, porque área/ouvidoria/master são o MESMO role do Postgres
-- (authenticated) — o GRANT não diferencia entre eles, só o trigger consegue.
revoke update on public.submissions from authenticated;
grant update (
  data, status,
  reviewed_by, reviewed_at, rejection_reason,
  confirmed_by, confirmed_at,
  portal_link, portal_link_generated_at
) on public.submissions to authenticated;

-- Garante que cada perfil só efetivamente altera as colunas da sua própria
-- etapa do workflow, e que reviewed_by/reviewed_at/confirmed_by/confirmed_at
-- nunca vêm do cliente — são sempre auth.uid()/now() calculados no servidor.
create or replace function public.submissions_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_master() then
    new.data := old.data;
    new.area := old.area;
    new.user_id := old.user_id;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.rejection_reason := old.rejection_reason;
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  elsif public.is_ouvidoria() then
    new.data := old.data;
    new.area := old.area;
    new.user_id := old.user_id;
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
    new.portal_link := old.portal_link;
    new.portal_link_generated_at := old.portal_link_generated_at;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    if new.status <> 'rejeitada' then
      new.rejection_reason := null;
    end if;
  else
    -- Área (dona da resposta): só "data" e "status" podem mudar.
    new.area := old.area;
    new.user_id := old.user_id;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.rejection_reason := old.rejection_reason;
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
    new.portal_link := old.portal_link;
    new.portal_link_generated_at := old.portal_link_generated_at;
  end if;

  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists submissions_guard_update on public.submissions;
create trigger submissions_guard_update
  before update on public.submissions
  for each row execute procedure public.submissions_guard_update();

drop policy if exists "submissions_delete_master" on public.submissions;
create policy "submissions_delete_master" on public.submissions
  for delete using (public.is_master());

-- ----------------------------------------------------------------------------
-- 4. Armazenamento de arquivos (recurso + dicionário de dados anexados)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pda-arquivos', 'pda-arquivos', false)
on conflict (id) do nothing;

drop policy if exists "pda_arquivos_insert_own" on storage.objects;
create policy "pda_arquivos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pda-arquivos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pda_arquivos_select" on storage.objects;
create policy "pda_arquivos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pda-arquivos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_master()
      or public.is_ouvidoria()
    )
  );

-- O upload usa upsert:true (reenvio de arquivo com o mesmo nome vira um UPDATE
-- no Storage, não um INSERT) — sem esta policy o reenvio falharia por RLS.
drop policy if exists "pda_arquivos_update_own" on storage.objects;
create policy "pda_arquivos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pda-arquivos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'pda-arquivos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Cadastro de usuários:
--
-- Áreas (perfil normal) e Ouvidoria (perfil ouvidoria): use o botão "Cadastrar
-- Área" no Painel Admin (dentro do próprio site — tem um seletor de perfil),
-- ou cadastre manualmente em Supabase -> Authentication -> Users -> Add user
-- (marcando "Auto Confirm User"; o campo "area" pode ser preenchido em User
-- Metadata como { "area": "Nome da Área" } — opcional). Toda conta criada
-- assim nasce como perfil "normal"; para virar "ouvidoria" promova depois:
--   update public.profiles set role = 'ouvidoria' where id = 'UUID-DO-USUARIO';
--
-- CGTI (perfil master): não existe cadastro por metadata, por segurança.
-- Crie a conta normalmente (dashboard ou botão do painel) e depois promova
-- rodando no SQL Editor:
--   update public.profiles set role = 'master', area = 'CGTI' where id = 'UUID-DO-USUARIO';
--
-- Senha provisória: toda conta nova entra com must_change_password = true,
-- então a pessoa é obrigada a definir sua própria senha no primeiro login
-- (o site cuida disso automaticamente). Se quiser isentar alguém dessa
-- exigência (ex.: sua própria conta master já em uso), rode:
--   update public.profiles set must_change_password = false where id = 'UUID-DO-USUARIO';
-- ============================================================================
