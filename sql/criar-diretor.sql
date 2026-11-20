-- =============================================================
-- GESTÃO UPSTI — Criação do Usuário Inicial de Diretor (ADM)
-- =============================================================
-- Execute este script no SQL Editor do Supabase (Lovable).
--
-- DADOS DE ACESSO GERADOS:
--   Usuário / Login: diretor   (ou diretor@upsti.local)
--   Senha Inicial:   Diretor@123
-- =============================================================

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email text := 'diretor@upsti.local';
  v_password text := 'Diretor@123'; -- Você pode alterar sua senha aqui
  v_nome text := 'Diretor Geral UPSTI';
  v_matricula text := 'DIR-001';
BEGIN
  -- 1. Verifica se o usuário já existe no auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    
    -- Atualiza senha caso já exista
    UPDATE auth.users 
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    -- 2. Cria o usuário no Supabase Auth
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome_completo', v_nome),
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  END IF;

  -- 3. Garante o registro na tabela profiles
  INSERT INTO public.profiles (id, nome_completo, email, matricula, cargo, ativo)
  VALUES (v_user_id, v_nome, v_email, v_matricula, 'Diretor Geral', true)
  ON CONFLICT (id) DO UPDATE 
  SET ativo = true, nome_completo = v_nome, matricula = v_matricula;

  -- 4. Vincula o perfil 'diretor' na matriz RBAC
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'diretor')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 5. Vincula o Diretor como Servidor Ativo da Unidade
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
  SET user_id = v_user_id, status = 'Ativo';

  RAISE NOTICE 'Conta de Diretor configurada com sucesso para % (ID: %)', v_email, v_user_id;
END $$;
