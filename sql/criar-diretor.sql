-- =============================================================
-- GESTÃO UPSTI — Criação / Reset do Usuário Inicial de Diretor (ADM)
-- =============================================================
-- Execute este script no SQL Editor do Supabase (Lovable).
--
-- DADOS DE ACESSO:
--   Usuário / Login: diretor   (ou diretor@upsti.ma.gov.br)
--   Senha:           TroqueEstaSenha#2026!
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email text := 'diretor@upsti.ma.gov.br';
  v_password text := 'TroqueEstaSenha#2026!';
  v_nome text := 'Diretor Geral UPSTI';
  v_matricula text := 'DIR-001';
  v_existing_id uuid;
BEGIN
  -- 1. Verifica se já existe o usuário em auth.users
  SELECT id INTO v_existing_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_user_id := v_existing_id;
    
    -- Atualiza senha, confirmação de email e metadata
    UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmed_at = COALESCE(confirmed_at, now()),
        last_sign_in_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('nome_completo', v_nome),
        banned_until = NULL,
        deleted_at = NULL,
        updated_at = now()
    WHERE id = v_user_id;

    -- Remove identidades antigas para recriar alinhadas
    DELETE FROM auth.identities WHERE user_id = v_user_id;
  ELSE
    -- Criação no auth.users
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmed_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome_completo', v_nome),
      false,
      now(),
      now()
    );
  END IF;

  -- 2. Insere a identidade correspondente no auth.identities
  -- (O ID e provider_id DEVEM corresponder ao user_id para o GoTrue aceitar o login)
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    v_user_id::text,
    format('{"sub":"%s","email":"%s","email_verified":true}', v_user_id::text, v_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- 3. Garante o registro na tabela profiles
  INSERT INTO public.profiles (id, nome_completo, email, matricula, cargo, ativo)
  VALUES (v_user_id, v_nome, v_email, v_matricula, 'Diretor Geral', true)
  ON CONFLICT (id) DO UPDATE 
    SET ativo = true,
        nome_completo = EXCLUDED.nome_completo,
        email = EXCLUDED.email,
        matricula = EXCLUDED.matricula;

  -- 4. Vincula a role 'diretor' no RBAC
  DELETE FROM public.user_roles WHERE user_id = v_user_id AND role <> 'diretor';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'diretor')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 5. Vincula o Diretor como Servidor Ativo da UPSTI
  INSERT INTO public.servidores (
    user_id,
    nome_completo,
    matricula_funcional,
    cargo_funcao,
    lotacao,
    email,
    regime_escala,
    equipe,
    turno_padrao,
    status
  ) VALUES (
    v_user_id,
    v_nome,
    v_matricula,
    'Diretor Geral',
    'UPSTI - Direção',
    v_email,
    '24x72',
    'Alpha',
    'Diurno',
    'Ativo'
  )
  ON CONFLICT (matricula_funcional) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        status = 'Ativo';

  RAISE NOTICE 'Conta do Diretor configurada com sucesso para % (ID: %)', v_email, v_user_id;
END $$;
