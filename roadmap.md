# Roadmap GESTÃO UPSTI

- [x] **Fase 1: Fundação Institucional e Segurança Base**
  - [x] Tabela `profiles` com status ativo, cargo, matrícula e RLS restrito
  - [x] Matriz RBAC rígida de 4 perfis (`diretor`, `chefia`, `intendencia`, `servidor`)
  - [x] Trilha de auditoria imutável (`audit_logs`, append-only com trigger automático)
  - [x] Políticas de RLS com verificação 2FA (AAL2) para Diretor e Intendência
  - [x] Login institucional sem cadastro público (gestão de contas pela Direção)
  - [x] Shell responsivo (Sidebar Desktop + Bottom Bar Mobile + Sheet Menu)
  - [x] Idle timeout de 15 minutos sincronizado entre abas

- [x] **Fase 2: Gestão de Efetivo e Frequência (Módulos 01 a 06)**
  - [x] **Módulo 01:** Gestão de Servidores e Ficha com Histórico Funcional Unificado
  - [x] **Módulo 02:** Escalas e Plantões (24x72 e 12x36, Equipes Alpha/Beta, Gerador de Projeção Mensal e Painel de Cobertura)
  - [x] **Módulo 03:** Controle Contábil de Folgas (Ledger crédito/débito, regra 12h = 1 plantão e despacho exclusivo do Diretor)
  - [x] **Módulo 04:** Faltas, Atrasos e Atestados Médicos (Armazenamento em bucket privado `documentos-restritos` com URLs assinadas)
  - [x] **Módulo 05:** Férias, Recessos e Licenças (Períodos aquisitivos e impedimento automático de escalação conflitante)
  - [x] **Módulo 06:** Permutas de Plantão (Workflow: Solicitada → Aceita → Autorizada) e Plantão Plus (Consolidação de horas extras)

- [x] **Fase 3: Custódia Carcerária e Deslocamentos (Módulos 07 a 10)**
  - [x] **Módulo 07:** Blocos A e B (22 Celas, Mapa Carcerário visual em tempo real, relação nominal SIISP e Transferência Atômica exclusiva do Diretor)
  - [x] **Módulo 08:** Missões Externas (Apuração de carga horária e conversão automática em crédito no Banco de Folgas)
  - [x] **Módulos 09 e 10:** Operações Judiciais (Escoltas, Tribunal do Júri e Audiências Judiciais com controle de viatura, KM e Relatório Final obrigatório)

- [x] **Fase 4: Intendência Bélica, Relatórios e Backup (Módulos 11 e 12)**
  - [x] **Módulo 11:** Intendência e Controle de Armamento (Inventário serializado, trava contra cautela simultânea, devoluções com conferência física e alerta de atrasos)
  - [x] **Módulo 12:** Relatórios Gerenciais (7 relatórios impressos/PDF com cabeçalho oficial institucional da UPSTI, exportação em planilha Excel/CSV)
  - [x] **Backup e Contingência:** Exportação integral de banco de dados em JSON sob demanda pelo Diretor
  - [x] **Dashboard Operacional 2.0:** Painel em tempo real com KPIs de efetivo, alertas de pendências, ocupação de celas, armamentos e agenda do dia
