# MoneyTracker — projeto independente

Este projeto é **separado do TestoTracker**. Nenhum dado financeiro pessoal está embutido no site.

## Como publicar
1. Crie um repositório GitHub chamado `moneytracker` (pode ser público: contém apenas código, nunca dados privados).
2. Crie um **projeto Supabase novo e separado** do TestoTracker.
3. Execute `supabase_schema.sql` no SQL Editor do projeto novo.
4. Preencha `config.js` com a URL e **publishable key** desse novo Supabase (NUNCA a secret/service_role).
5. Publique `index.html`, `cloud.css`, `cloud.js` e `config.js` na raiz do repositório.
6. Em GitHub → Settings → Pages, escolha `Deploy from a branch` e `main /root`. O app ficará em `https://SEU_USUARIO.github.io/moneytracker/`.
7. Entre/crie uma conta, importe os XLSX B3 e confira `Salvo na nuvem`.

## Inclui
- Negociações e movimentações B3 (9 e 8 colunas); importação/exportação Excel.
- Registros manuais e deduplicação.
- Estratégia, análises por regras e metas; não é IA generativa.
- Nuvem com login Supabase e RLS por usuário.

## Privacidade
O site público só contém código sem dados. Os investimentos são inseridos após autenticação e protegidos por políticas de acesso do Supabase. O usuário deve guardar cópia de segurança e manter o projeto Supabase privado.