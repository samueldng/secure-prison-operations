-- =============================================================
-- GESTÃO UPSTI — Migrations SQL para Módulos 01–12
-- =============================================================
-- Execute este script no SQL Editor do Supabase (Lovable).
-- Todas as instruções estão ordenadas por dependência e são
-- idempotentes (podem ser executadas repetidas vezes com segurança).
-- =============================================================

-- =============================================
-- MÓDULO 01: SERVIDORES (CRIADO PRIMEIRO)
-- =============================================
CREATE TABLE IF NOT EXISTS public.servidores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome_completo text NOT NULL,
  matricula_funcional text UNIQUE NOT NULL,
  cpf text UNIQUE,
  cargo_funcao text,
  lotacao text DEFAULT 'UPSTI',
  telefone text,
  email text,
  regime_escala text NOT NULL DEFAULT '24x72' CHECK (regime_escala IN ('24x72','12x36')),
  equipe text NOT NULL DEFAULT 'Alpha' CHECK (equipe IN ('Alpha','Beta')),
  turno_padrao text NOT NULL DEFAULT 'Diurno' CHECK (turno_padrao IN ('Diurno','Noturno')),
  status text NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Férias','Licença','Afastado','Inativo')),
  data_admissao date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servidores_equipe ON public.servidores(equipe);
CREATE INDEX IF NOT EXISTS idx_servidores_status ON public.servidores(status);
CREATE INDEX IF NOT EXISTS idx_servidores_user ON public.servidores(user_id);

ALTER TABLE public.servidores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servidores TO authenticated;
GRANT ALL ON public.servidores TO service_role;

DROP POLICY IF EXISTS "srv_diretor_all" ON public.servidores;
CREATE POLICY "srv_diretor_all" ON public.servidores FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "srv_chefia_select" ON public.servidores;
CREATE POLICY "srv_chefia_select" ON public.servidores FOR SELECT TO authenticated
  USING (public.is_chefia());

DROP POLICY IF EXISTS "srv_own_select" ON public.servidores;
CREATE POLICY "srv_own_select" ON public.servidores FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS servidores_touch ON public.servidores;
CREATE TRIGGER servidores_touch BEFORE UPDATE ON public.servidores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_servidores ON public.servidores;
CREATE TRIGGER audit_servidores AFTER INSERT OR UPDATE OR DELETE ON public.servidores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================
-- FUNÇÃO AUXILIAR: Obter servidor_id do usuário logado
-- (Definida após a tabela servidores existir)
-- =============================================
CREATE OR REPLACE FUNCTION public.own_servidor_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.servidores WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;

-- =============================================
-- MÓDULO 02: ESCALAS E PLANTÕES
-- =============================================
CREATE TABLE IF NOT EXISTS public.escalas_plantao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  data date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('Diurno','Noturno')),
  tipo text NOT NULL DEFAULT 'Regular' CHECK (tipo IN ('Regular','Extra','Cobertura')),
  status text NOT NULL DEFAULT 'Escalado' CHECK (status IN ('Escalado','Presente','Ausente','Substituído')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(servidor_id, data, turno)
);

CREATE INDEX IF NOT EXISTS idx_escalas_data ON public.escalas_plantao(data);
CREATE INDEX IF NOT EXISTS idx_escalas_servidor ON public.escalas_plantao(servidor_id);

ALTER TABLE public.escalas_plantao ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalas_plantao TO authenticated;
GRANT ALL ON public.escalas_plantao TO service_role;

DROP POLICY IF EXISTS "esc_diretor_all" ON public.escalas_plantao;
CREATE POLICY "esc_diretor_all" ON public.escalas_plantao FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "esc_chefia_all" ON public.escalas_plantao;
CREATE POLICY "esc_chefia_all" ON public.escalas_plantao FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "esc_own_select" ON public.escalas_plantao;
CREATE POLICY "esc_own_select" ON public.escalas_plantao FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

DROP TRIGGER IF EXISTS escalas_touch ON public.escalas_plantao;
CREATE TRIGGER escalas_touch BEFORE UPDATE ON public.escalas_plantao
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_escalas ON public.escalas_plantao;
CREATE TRIGGER audit_escalas AFTER INSERT OR UPDATE OR DELETE ON public.escalas_plantao
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================
-- MÓDULO 03: FOLGAS (LEDGER CONTÁBIL)
-- =============================================
CREATE TABLE IF NOT EXISTS public.folgas_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('credito','debito')),
  horas numeric(6,2) NOT NULL CHECK (horas > 0),
  origem text NOT NULL CHECK (origem IN ('regulamentar','missao_externa','compensacao','gozo')),
  referencia_id uuid,
  descricao text,
  data_referencia date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Aprovada','Rejeitada','Gozada')),
  aprovado_por uuid REFERENCES auth.users(id),
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folgas_servidor ON public.folgas_ledger(servidor_id);
CREATE INDEX IF NOT EXISTS idx_folgas_status ON public.folgas_ledger(status);

ALTER TABLE public.folgas_ledger ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.folgas_ledger TO authenticated;
GRANT ALL ON public.folgas_ledger TO service_role;

DROP POLICY IF EXISTS "flg_diretor_all" ON public.folgas_ledger;
CREATE POLICY "flg_diretor_all" ON public.folgas_ledger FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "flg_chefia_all" ON public.folgas_ledger;
CREATE POLICY "flg_chefia_all" ON public.folgas_ledger FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "flg_own_select" ON public.folgas_ledger;
CREATE POLICY "flg_own_select" ON public.folgas_ledger FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

DROP POLICY IF EXISTS "flg_own_insert" ON public.folgas_ledger;
CREATE POLICY "flg_own_insert" ON public.folgas_ledger FOR INSERT TO authenticated
  WITH CHECK (servidor_id = public.own_servidor_id());

DROP TRIGGER IF EXISTS audit_folgas ON public.folgas_ledger;
CREATE TRIGGER audit_folgas AFTER INSERT OR UPDATE OR DELETE ON public.folgas_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================
-- MÓDULO 04: FALTAS E ATESTADOS
-- =============================================
CREATE TABLE IF NOT EXISTS public.faltas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('Justificada','Injustificada')),
  minutos_atraso integer DEFAULT 0,
  justificativa text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.faltas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faltas TO authenticated;
GRANT ALL ON public.faltas TO service_role;

DROP POLICY IF EXISTS "flt_diretor_all" ON public.faltas;
CREATE POLICY "flt_diretor_all" ON public.faltas FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "flt_chefia_all" ON public.faltas;
CREATE POLICY "flt_chefia_all" ON public.faltas FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "flt_own_select" ON public.faltas;
CREATE POLICY "flt_own_select" ON public.faltas FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

DROP TRIGGER IF EXISTS faltas_touch ON public.faltas;
CREATE TRIGGER faltas_touch BEFORE UPDATE ON public.faltas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_faltas ON public.faltas;
CREATE TRIGGER audit_faltas AFTER INSERT OR UPDATE OR DELETE ON public.faltas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE IF NOT EXISTS public.atestados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  dias_afastamento integer NOT NULL DEFAULT 1 CHECK (dias_afastamento >= 1),
  cid text,
  observacoes text,
  arquivo_path text,
  registrado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.atestados TO authenticated;
GRANT ALL ON public.atestados TO service_role;

DROP POLICY IF EXISTS "att_diretor_all" ON public.atestados;
CREATE POLICY "att_diretor_all" ON public.atestados FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "att_chefia_all" ON public.atestados;
CREATE POLICY "att_chefia_all" ON public.atestados FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "att_own_select" ON public.atestados;
CREATE POLICY "att_own_select" ON public.atestados FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

DROP TRIGGER IF EXISTS atestados_touch ON public.atestados;
CREATE TRIGGER atestados_touch BEFORE UPDATE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_atestados ON public.atestados;
CREATE TRIGGER audit_atestados AFTER INSERT OR UPDATE OR DELETE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Storage bucket privado para documentos restritos (seguro contra exceções)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('documentos-restritos', 'documentos-restritos', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "docs_read" ON storage.objects;
  CREATE POLICY "docs_read" ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'documentos-restritos'
      AND (
        public.is_diretor()
        OR public.is_chefia()
        OR (storage.foldername(name))[1] = auth.uid()::text
      )
    );

  DROP POLICY IF EXISTS "docs_insert" ON storage.objects;
  CREATE POLICY "docs_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'documentos-restritos'
      AND (public.is_diretor() OR public.is_chefia())
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =============================================
-- MÓDULO 05: FÉRIAS E LICENÇAS
-- =============================================
CREATE TABLE IF NOT EXISTS public.ferias_licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'Férias','Recesso','Licença Médica','Licença Prêmio',
    'Licença Maternidade','Licença Paternidade','Licença Interesse Particular'
  )),
  periodo_aquisitivo text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'Solicitada' CHECK (status IN (
    'Solicitada','Aprovada','Em Vigor','Concluída','Cancelada'
  )),
  aprovado_por uuid REFERENCES auth.users(id),
  aprovado_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_ferias_servidor ON public.ferias_licencas(servidor_id);
CREATE INDEX IF NOT EXISTS idx_ferias_datas ON public.ferias_licencas(data_inicio, data_fim);

ALTER TABLE public.ferias_licencas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.ferias_licencas TO authenticated;
GRANT ALL ON public.ferias_licencas TO service_role;

DROP POLICY IF EXISTS "fer_diretor_all" ON public.ferias_licencas;
CREATE POLICY "fer_diretor_all" ON public.ferias_licencas FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "fer_chefia_all" ON public.ferias_licencas;
CREATE POLICY "fer_chefia_all" ON public.ferias_licencas FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "fer_own_select" ON public.ferias_licencas;
CREATE POLICY "fer_own_select" ON public.ferias_licencas FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

DROP POLICY IF EXISTS "fer_own_insert" ON public.ferias_licencas;
CREATE POLICY "fer_own_insert" ON public.ferias_licencas FOR INSERT TO authenticated
  WITH CHECK (servidor_id = public.own_servidor_id());

DROP TRIGGER IF EXISTS ferias_touch ON public.ferias_licencas;
CREATE TRIGGER ferias_touch BEFORE UPDATE ON public.ferias_licencas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_ferias ON public.ferias_licencas;
CREATE TRIGGER audit_ferias AFTER INSERT OR UPDATE OR DELETE ON public.ferias_licencas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Trigger: sincronizar status do servidor em férias/licença
CREATE OR REPLACE FUNCTION public.sync_servidor_ferias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Em Vigor' AND (OLD IS NULL OR OLD.status <> 'Em Vigor') THEN
    UPDATE public.servidores SET status =
      CASE WHEN NEW.tipo = 'Férias' OR NEW.tipo = 'Recesso' THEN 'Férias' ELSE 'Licença' END
    WHERE id = NEW.servidor_id;
  END IF;
  IF NEW.status = 'Concluída' AND OLD.status = 'Em Vigor' THEN
    UPDATE public.servidores SET status = 'Ativo' WHERE id = NEW.servidor_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ferias_sync_servidor ON public.ferias_licencas;
CREATE TRIGGER ferias_sync_servidor AFTER UPDATE ON public.ferias_licencas
  FOR EACH ROW EXECUTE FUNCTION public.sync_servidor_ferias();

-- =============================================
-- MÓDULO 06: PERMUTAS E PLANTÃO PLUS
-- =============================================
CREATE TABLE IF NOT EXISTS public.permutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id uuid NOT NULL REFERENCES public.servidores(id),
  substituto_id uuid NOT NULL REFERENCES public.servidores(id),
  data_original date NOT NULL,
  turno_original text NOT NULL CHECK (turno_original IN ('Diurno','Noturno')),
  data_compensacao date NOT NULL,
  turno_compensacao text NOT NULL CHECK (turno_compensacao IN ('Diurno','Noturno')),
  justificativa text,
  status text NOT NULL DEFAULT 'Solicitada' CHECK (status IN (
    'Solicitada','Aceita','Autorizada','Recusada','Cancelada'
  )),
  aceito_em timestamptz,
  autorizado_por uuid REFERENCES auth.users(id),
  autorizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (solicitante_id <> substituto_id)
);

ALTER TABLE public.permutas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.permutas TO authenticated;
GRANT ALL ON public.permutas TO service_role;

DROP POLICY IF EXISTS "prm_diretor_all" ON public.permutas;
CREATE POLICY "prm_diretor_all" ON public.permutas FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "prm_chefia_all" ON public.permutas;
CREATE POLICY "prm_chefia_all" ON public.permutas FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "prm_own_select" ON public.permutas;
CREATE POLICY "prm_own_select" ON public.permutas FOR SELECT TO authenticated
  USING (solicitante_id = public.own_servidor_id() OR substituto_id = public.own_servidor_id());

DROP POLICY IF EXISTS "prm_own_insert" ON public.permutas;
CREATE POLICY "prm_own_insert" ON public.permutas FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = public.own_servidor_id());

DROP POLICY IF EXISTS "prm_aceitar" ON public.permutas;
CREATE POLICY "prm_aceitar" ON public.permutas FOR UPDATE TO authenticated
  USING (substituto_id = public.own_servidor_id() AND status = 'Solicitada')
  WITH CHECK (substituto_id = public.own_servidor_id() AND status = 'Aceita');

DROP TRIGGER IF EXISTS permutas_touch ON public.permutas;
CREATE TRIGGER permutas_touch BEFORE UPDATE ON public.permutas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_permutas ON public.permutas;
CREATE TRIGGER audit_permutas AFTER INSERT OR UPDATE OR DELETE ON public.permutas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE IF NOT EXISTS public.plantao_plus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id) ON DELETE CASCADE,
  data date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('Diurno','Noturno')),
  horas_extras numeric(5,2) NOT NULL CHECK (horas_extras > 0),
  motivacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plantao_plus ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantao_plus TO authenticated;
GRANT ALL ON public.plantao_plus TO service_role;

DROP POLICY IF EXISTS "pp_diretor_all" ON public.plantao_plus;
CREATE POLICY "pp_diretor_all" ON public.plantao_plus FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "pp_chefia_all" ON public.plantao_plus;
CREATE POLICY "pp_chefia_all" ON public.plantao_plus FOR ALL TO authenticated
  USING (public.is_chefia()) WITH CHECK (public.is_chefia());

DROP POLICY IF EXISTS "pp_own_select" ON public.plantao_plus;
CREATE POLICY "pp_own_select" ON public.plantao_plus FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

DROP TRIGGER IF EXISTS pp_touch ON public.plantao_plus;
CREATE TRIGGER pp_touch BEFORE UPDATE ON public.plantao_plus
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_pp ON public.plantao_plus;
CREATE TRIGGER audit_pp AFTER INSERT OR UPDATE OR DELETE ON public.plantao_plus
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================
-- MÓDULO 07: BLOCOS A E B (CELAS E INTERNOS)
-- =============================================
CREATE TABLE IF NOT EXISTS public.celas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco text NOT NULL CHECK (bloco IN ('A','B')),
  numero integer NOT NULL CHECK (numero BETWEEN 1 AND 11),
  capacidade integer NOT NULL DEFAULT 4,
  situacao text NOT NULL DEFAULT 'Vazia' CHECK (situacao IN ('Ocupada','Vazia','Isolada','Interditada')),
  observacoes_administrativas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bloco, numero)
);

ALTER TABLE public.celas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.celas TO authenticated;
GRANT ALL ON public.celas TO service_role;

DROP POLICY IF EXISTS "cel_diretor_all" ON public.celas;
CREATE POLICY "cel_diretor_all" ON public.celas FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP TRIGGER IF EXISTS celas_touch ON public.celas;
CREATE TRIGGER celas_touch BEFORE UPDATE ON public.celas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_celas ON public.celas;
CREATE TRIGGER audit_celas AFTER INSERT OR UPDATE OR DELETE ON public.celas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Seed fixo das 22 celas (Blocos A e B)
INSERT INTO public.celas (bloco, numero) VALUES
  ('A',1),('A',2),('A',3),('A',4),('A',5),('A',6),('A',7),('A',8),('A',9),('A',10),('A',11),
  ('B',1),('B',2),('B',3),('B',4),('B',5),('B',6),('B',7),('B',8),('B',9),('B',10),('B',11)
ON CONFLICT (bloco, numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.internos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  matricula_siisp text UNIQUE NOT NULL,
  cela_atual_id uuid REFERENCES public.celas(id),
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  data_saida date,
  status text NOT NULL DEFAULT 'Custodiado' CHECK (status IN ('Custodiado','Transferido','Alvará/Saída')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internos_cela ON public.internos(cela_atual_id);
CREATE INDEX IF NOT EXISTS idx_internos_status ON public.internos(status);

ALTER TABLE public.internos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.internos TO authenticated;
GRANT ALL ON public.internos TO service_role;

DROP POLICY IF EXISTS "int_diretor_all" ON public.internos;
CREATE POLICY "int_diretor_all" ON public.internos FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP TRIGGER IF EXISTS internos_touch ON public.internos;
CREATE TRIGGER internos_touch BEFORE UPDATE ON public.internos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_internos ON public.internos;
CREATE TRIGGER audit_internos AFTER INSERT OR UPDATE OR DELETE ON public.internos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE IF NOT EXISTS public.movimentacoes_celas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interno_id uuid NOT NULL REFERENCES public.internos(id),
  cela_origem_id uuid REFERENCES public.celas(id),
  cela_destino_id uuid NOT NULL REFERENCES public.celas(id),
  motivo text NOT NULL,
  autorizado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.movimentacoes_celas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.movimentacoes_celas TO authenticated;
GRANT ALL ON public.movimentacoes_celas TO service_role;

DROP POLICY IF EXISTS "mov_diretor_all" ON public.movimentacoes_celas;
CREATE POLICY "mov_diretor_all" ON public.movimentacoes_celas FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP TRIGGER IF EXISTS audit_mov ON public.movimentacoes_celas;
CREATE TRIGGER audit_mov AFTER INSERT ON public.movimentacoes_celas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Função: Transferência Atômica de Internos
CREATE OR REPLACE FUNCTION public.transferir_interno(
  p_interno_id uuid,
  p_cela_destino_id uuid,
  p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_origem uuid;
  v_sit text;
  v_cap integer;
  v_ocu integer;
BEGIN
  IF NOT public.is_diretor() THEN
    RAISE EXCEPTION 'Apenas o Diretor pode autorizar transferências.';
  END IF;

  SELECT cela_atual_id INTO v_origem FROM public.internos WHERE id = p_interno_id;
  SELECT situacao, capacidade INTO v_sit, v_cap FROM public.celas WHERE id = p_cela_destino_id;

  IF v_sit = 'Interditada' THEN
    RAISE EXCEPTION 'Cela destino está interditada.';
  END IF;

  SELECT count(*) INTO v_ocu FROM public.internos
    WHERE cela_atual_id = p_cela_destino_id AND status = 'Custodiado';
  IF v_ocu >= v_cap THEN
    RAISE EXCEPTION 'Cela destino na capacidade máxima (%/%).', v_ocu, v_cap;
  END IF;

  UPDATE public.internos SET cela_atual_id = p_cela_destino_id WHERE id = p_interno_id;

  INSERT INTO public.movimentacoes_celas (interno_id, cela_origem_id, cela_destino_id, motivo, autorizado_por)
  VALUES (p_interno_id, v_origem, p_cela_destino_id, p_motivo, auth.uid());

  IF v_origem IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.internos WHERE cela_atual_id = v_origem AND status = 'Custodiado' AND id <> p_interno_id) THEN
      UPDATE public.celas SET situacao = 'Vazia' WHERE id = v_origem AND situacao = 'Ocupada';
    END IF;
  END IF;
  UPDATE public.celas SET situacao = 'Ocupada' WHERE id = p_cela_destino_id AND situacao IN ('Vazia','Isolada');
END $$;

-- =============================================
-- MÓDULO 08: MISSÕES EXTERNAS
-- =============================================
CREATE TABLE IF NOT EXISTS public.missoes_externas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servidor_responsavel_id uuid NOT NULL REFERENCES public.servidores(id),
  equipe_ids uuid[] DEFAULT '{}',
  data_saida timestamptz NOT NULL,
  data_retorno timestamptz,
  horas_trabalhadas numeric(6,2),
  destino text NOT NULL,
  finalidade text NOT NULL,
  status text NOT NULL DEFAULT 'Solicitada' CHECK (status IN (
    'Solicitada','Autorizada','Em Andamento','Concluída','Cancelada'
  )),
  autorizado_por uuid REFERENCES auth.users(id),
  autorizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.missoes_externas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.missoes_externas TO authenticated;
GRANT ALL ON public.missoes_externas TO service_role;

DROP POLICY IF EXISTS "mis_diretor_all" ON public.missoes_externas;
CREATE POLICY "mis_diretor_all" ON public.missoes_externas FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "mis_chefia_select" ON public.missoes_externas;
CREATE POLICY "mis_chefia_select" ON public.missoes_externas FOR SELECT TO authenticated
  USING (public.is_chefia());

DROP POLICY IF EXISTS "mis_own_select" ON public.missoes_externas;
CREATE POLICY "mis_own_select" ON public.missoes_externas FOR SELECT TO authenticated
  USING (
    servidor_responsavel_id = public.own_servidor_id()
    OR public.own_servidor_id() = ANY(equipe_ids)
  );

DROP TRIGGER IF EXISTS missoes_touch ON public.missoes_externas;
CREATE TRIGGER missoes_touch BEFORE UPDATE ON public.missoes_externas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_missoes ON public.missoes_externas;
CREATE TRIGGER audit_missoes AFTER INSERT OR UPDATE OR DELETE ON public.missoes_externas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Função: Concluir missão + crédito automático no ledger de folgas
CREATE OR REPLACE FUNCTION public.concluir_missao(
  p_missao_id uuid,
  p_data_retorno timestamptz,
  p_horas numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_srv uuid;
  v_st text;
BEGIN
  IF NOT public.is_diretor() THEN
    RAISE EXCEPTION 'Apenas o Diretor pode concluir missões.';
  END IF;

  SELECT servidor_responsavel_id, status INTO v_srv, v_st
  FROM public.missoes_externas WHERE id = p_missao_id;

  IF v_st NOT IN ('Autorizada','Em Andamento') THEN
    RAISE EXCEPTION 'Missão precisa estar Autorizada ou Em Andamento.';
  END IF;

  UPDATE public.missoes_externas SET
    status = 'Concluída', data_retorno = p_data_retorno, horas_trabalhadas = p_horas
  WHERE id = p_missao_id;

  INSERT INTO public.folgas_ledger (servidor_id, tipo, horas, origem, referencia_id, descricao, status, aprovado_por, aprovado_em)
  VALUES (v_srv, 'credito', p_horas, 'missao_externa', p_missao_id,
    'Crédito automático — missão externa concluída', 'Aprovada', auth.uid(), now());
END $$;

-- =============================================
-- MÓDULOS 09/10: OPERAÇÕES JUDICIAIS
-- =============================================
CREATE TABLE IF NOT EXISTS public.operacoes_judiciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('Escolta','Tribunal do Júri','Audiência')),
  internos_ids uuid[] NOT NULL DEFAULT '{}',
  numero_processo text NOT NULL,
  unidade_destino text NOT NULL,
  data_programada timestamptz NOT NULL,
  equipe_ids uuid[] NOT NULL DEFAULT '{}',
  viatura text,
  km_saida numeric(10,1),
  km_retorno numeric(10,1),
  horario_saida timestamptz,
  horario_chegada timestamptz,
  status text NOT NULL DEFAULT 'Programada' CHECK (status IN (
    'Programada','Autorizada','Em Andamento','Concluída','Cancelada'
  )),
  autorizado_por uuid REFERENCES auth.users(id),
  autorizado_em timestamptz,
  relatorio_final text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (km_retorno IS NULL OR km_saida IS NULL OR km_retorno >= km_saida)
);

CREATE INDEX IF NOT EXISTS idx_ops_data ON public.operacoes_judiciais(data_programada);
CREATE INDEX IF NOT EXISTS idx_ops_status ON public.operacoes_judiciais(status);

ALTER TABLE public.operacoes_judiciais ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.operacoes_judiciais TO authenticated;
GRANT ALL ON public.operacoes_judiciais TO service_role;

DROP POLICY IF EXISTS "ops_diretor_all" ON public.operacoes_judiciais;
CREATE POLICY "ops_diretor_all" ON public.operacoes_judiciais FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "ops_chefia_select" ON public.operacoes_judiciais;
CREATE POLICY "ops_chefia_select" ON public.operacoes_judiciais FOR SELECT TO authenticated
  USING (public.is_chefia());

DROP POLICY IF EXISTS "ops_own_select" ON public.operacoes_judiciais;
CREATE POLICY "ops_own_select" ON public.operacoes_judiciais FOR SELECT TO authenticated
  USING (public.own_servidor_id() = ANY(equipe_ids));

DROP TRIGGER IF EXISTS ops_touch ON public.operacoes_judiciais;
CREATE TRIGGER ops_touch BEFORE UPDATE ON public.operacoes_judiciais
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_ops ON public.operacoes_judiciais;
CREATE TRIGGER audit_ops AFTER INSERT OR UPDATE OR DELETE ON public.operacoes_judiciais
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================
-- MÓDULO 11: INTENDÊNCIA E ARMAMENTO
-- =============================================
CREATE TABLE IF NOT EXISTS public.armamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('Pistola','Espingarda','Carabina','Colete','Munição','Acessório Controlado')),
  marca text,
  modelo text,
  numero_serie text UNIQUE,
  numero_patrimonio text,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
  localizacao_fisica text,
  estado_conservacao text NOT NULL DEFAULT 'Bom' CHECK (estado_conservacao IN ('Ótimo','Bom','Regular','Inoperante')),
  status text NOT NULL DEFAULT 'Disponível' CHECK (status IN ('Disponível','Cautelado','Em Manutenção','Baixado')),
  responsavel_guarda uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.armamentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.armamentos TO authenticated;
GRANT ALL ON public.armamentos TO service_role;

DROP POLICY IF EXISTS "arm_diretor_all" ON public.armamentos;
CREATE POLICY "arm_diretor_all" ON public.armamentos FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "arm_intendencia_all" ON public.armamentos;
CREATE POLICY "arm_intendencia_all" ON public.armamentos FOR ALL TO authenticated
  USING (public.is_intendencia()) WITH CHECK (public.is_intendencia());

DROP TRIGGER IF EXISTS armamentos_touch ON public.armamentos;
CREATE TRIGGER armamentos_touch BEFORE UPDATE ON public.armamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_armamentos ON public.armamentos;
CREATE TRIGGER audit_armamentos AFTER INSERT OR UPDATE OR DELETE ON public.armamentos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE IF NOT EXISTS public.cautelas_armamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armamento_id uuid NOT NULL REFERENCES public.armamentos(id),
  servidor_id uuid NOT NULL REFERENCES public.servidores(id),
  status text NOT NULL DEFAULT 'Solicitada' CHECK (status IN ('Solicitada','Ativa','Devolvida','Cancelada')),
  autorizado_por uuid REFERENCES auth.users(id),
  autorizado_em timestamptz,
  data_retirada timestamptz,
  data_devolucao_prevista timestamptz,
  data_devolucao_efetiva timestamptz,
  estado_devolucao text CHECK (estado_devolucao IN ('Ótimo','Bom','Regular','Inoperante')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cautelas_armamento ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.cautelas_armamento TO authenticated;
GRANT ALL ON public.cautelas_armamento TO service_role;

DROP POLICY IF EXISTS "cau_diretor_all" ON public.cautelas_armamento;
CREATE POLICY "cau_diretor_all" ON public.cautelas_armamento FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "cau_intendencia_all" ON public.cautelas_armamento;
CREATE POLICY "cau_intendencia_all" ON public.cautelas_armamento FOR ALL TO authenticated
  USING (public.is_intendencia()) WITH CHECK (public.is_intendencia());

DROP POLICY IF EXISTS "cau_own_select" ON public.cautelas_armamento;
CREATE POLICY "cau_own_select" ON public.cautelas_armamento FOR SELECT TO authenticated
  USING (servidor_id = public.own_servidor_id());

-- Bloqueio: não cautela armamento já cautelado/em manutenção
CREATE OR REPLACE FUNCTION public.check_cautela_disponivel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Ativa' THEN
    IF EXISTS (
      SELECT 1 FROM public.armamentos WHERE id = NEW.armamento_id AND status IN ('Cautelado','Em Manutenção')
    ) THEN
      RAISE EXCEPTION 'Armamento indisponível (já cautelado ou em manutenção).';
    END IF;
    UPDATE public.armamentos SET status = 'Cautelado' WHERE id = NEW.armamento_id;
  END IF;
  IF NEW.status = 'Devolvida' AND (OLD IS NULL OR OLD.status = 'Ativa') THEN
    UPDATE public.armamentos SET status = 'Disponível' WHERE id = NEW.armamento_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS check_cautela ON public.cautelas_armamento;
CREATE TRIGGER check_cautela BEFORE INSERT OR UPDATE ON public.cautelas_armamento
  FOR EACH ROW EXECUTE FUNCTION public.check_cautela_disponivel();

DROP TRIGGER IF EXISTS cautelas_touch ON public.cautelas_armamento;
CREATE TRIGGER cautelas_touch BEFORE UPDATE ON public.cautelas_armamento
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_cautelas ON public.cautelas_armamento;
CREATE TRIGGER audit_cautelas AFTER INSERT OR UPDATE OR DELETE ON public.cautelas_armamento
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE IF NOT EXISTS public.manutencoes_armamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  armamento_id uuid NOT NULL REFERENCES public.armamentos(id),
  tipo text NOT NULL CHECK (tipo IN ('Preventiva','Corretiva')),
  descricao_tecnica text NOT NULL,
  responsavel text,
  data_entrada date NOT NULL DEFAULT CURRENT_DATE,
  data_retorno date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manutencoes_armamento ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.manutencoes_armamento TO authenticated;
GRANT ALL ON public.manutencoes_armamento TO service_role;

DROP POLICY IF EXISTS "man_diretor_all" ON public.manutencoes_armamento;
CREATE POLICY "man_diretor_all" ON public.manutencoes_armamento FOR ALL TO authenticated
  USING (public.is_diretor()) WITH CHECK (public.is_diretor());

DROP POLICY IF EXISTS "man_intendencia_all" ON public.manutencoes_armamento;
CREATE POLICY "man_intendencia_all" ON public.manutencoes_armamento FOR ALL TO authenticated
  USING (public.is_intendencia()) WITH CHECK (public.is_intendencia());

DROP TRIGGER IF EXISTS manutencoes_touch ON public.manutencoes_armamento;
CREATE TRIGGER manutencoes_touch BEFORE UPDATE ON public.manutencoes_armamento
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_manutencoes ON public.manutencoes_armamento;
CREATE TRIGGER audit_manutencoes AFTER INSERT OR UPDATE OR DELETE ON public.manutencoes_armamento
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =============================================
-- REVOGAÇÃO DE FUNÇÕES INTERNAS
-- =============================================
REVOKE EXECUTE ON FUNCTION public.own_servidor_id() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.transferir_interno(uuid, uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.concluir_missao(uuid, timestamptz, numeric) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_cautela_disponivel() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_servidor_ferias() FROM public, anon, authenticated;
