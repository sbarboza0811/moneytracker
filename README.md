# MoneyTracker — investimentos B3

Aplicação web **independente** do TestoTracker e do Home Architect.

- Repositório: https://github.com/sbarboza0811/moneytracker
- URL prevista: https://sbarboza0811.github.io/moneytracker/
- Supabase exclusivo: https://supabase.com/dashboard/project/xdpdmcihbqjerduxhagm
- Região: São Paulo (sa-east-1)
- Banco: `public.moneytracker_snapshots`, com **RLS por usuário** (4 políticas).
- Arquivos de investimentos: **não** ficam no repositório público. São importados depois do login.

## Ativação pendente: duas configurações de console

1. Em [GitHub Pages](https://github.com/sbarboza0811/moneytracker/settings/pages), em **Build and deployment → Source**, selecionar **GitHub Actions**. O workflow `.github/workflows/pages.yml` já está no repositório.
2. Em [Supabase Auth → URL Configuration](https://supabase.com/dashboard/project/xdpdmcihbqjerduxhagm/auth/url-configuration), configurar **Site URL** como `https://sbarboza0811.github.io/moneytracker/` e adicionar esse mesmo endereço à lista de **Redirect URLs**. Isso faz os links de confirmação de e-mail voltarem corretamente para o MoneyTracker.

## Primeira utilização

1. Criar conta **nova** no MoneyTracker (a base de usuários é independente do TestoTracker).
2. Confirmar e-mail, se solicitado, e fazer login.
3. Acessar `Arquivos B3` e importar seus arquivos de negociação e movimentação `.xlsx` da B3, ou restaurar o backup pessoal feito anteriormente.
4. Conferir `Salvo na nuvem`; somente depois acessar outro dispositivo.
5. Fazer backup periódico do histórico.

## Funcionalidades

- Importar e exportar negociações e movimentações em planilhas com layout B3.
- Cadastro/edição manual e verificação de duplicidades.
- Posições de custo estimadas a partir do histórico, distribuição, metas, cenários e análises baseadas em regras.
- Conta própria, acesso privado e sincronização com Supabase.

As informações da B3 não são sincronizadas automaticamente; importação manual continua necessária. Não fornece cotações em tempo real ou recomendações geradas por IA conectada. A publicação no GitHub Pages depende da configuração descrita acima.

## Segurança

No navegador, use apenas a **publishable key** do Supabase. **Jamais** inclua `service_role`, senhas ou arquivos financeiros no GitHub. A tabela tem RLS e só autoriza operações do próprio usuário autenticado. Backup ainda é recomendado.
