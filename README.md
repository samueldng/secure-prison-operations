# Secure Prison Operations

3 Pontos de Atenção Antes de Colocar em Produção

Cadastro de Usuários (Evite Sign-Up aberto): Na tela de login, remova a opção pública de "Criar Conta". Em uma unidade prisional, apenas o Diretor deve criar ou convidar contas vinculando o user_id ao perfil correto e ao cadastro do servidor. Se a IA gerar botão de registro aberto na Fase 1, mande remover imediatamente.

Validação de Regra no Banco, não na Tela: Sempre que testar cada fase, tente burlar o fluxo: acesse com um usuário servidor ou chefia e verifique se ele realmente não consegue consultar dados do Bloco A/B ou da Intendência nem via URL direta. Se aparecer qualquer dado, peça à IA: "Revise as políticas RLS da tabela X para restringir estritamente à matriz de permissões".

Dados Sensíveis (LGPD e Segurança Prisional): Como o sistema armazenará matrículas SIISP, processos judiciais, atestados médicos e números de série de armamento, garanta na hospedagem final SSL obrigatório (HTTPS), autenticação em dois fatores (2FA) para o perfil Diretor e Intendência, e bloqueio de sessão por inatividade.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/71fa3391-b1cd-4f14-a343-f137b3f428ed).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
