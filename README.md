# Escala UPA D'Água — Backend

API real (Node + Express + Postgres) para o sistema de gestão de escalas.
O banco Postgres já está provisionado no Railway, no projeto **escala-upa-dagua**.

## O que já existe
- `src/db.js` — conexão e schema (gestores, colaboradores, escalas, alocações, overrides)
- `src/regimes.js` — regras de cálculo do código do dia (12x36 par/ímpar, 12x48, administrativo)
- `src/importer.js` — leitor do export de RH, mapeado às colunas reais:
  `Chapa`, `Nome`, `Nome Funcão`, `Descrição Seção`, `Situação`, `Descrição do Horario`
- `src/server.js` — API REST (auth por JWT, colaboradores, importação, escalas, overrides)

## Como colocar no ar (Railway)

1. Crie um repositório no GitHub (pode ser privado) e suba este código:
   ```bash
   cd escala-upa-backend
   git init
   git add .
   git commit -m "backend inicial"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/escala-upa-backend.git
   git push -u origin main
   ```
2. Me avise o nome do repositório (`SEU_USUARIO/escala-upa-backend`) — eu conecto ele
   ao projeto Railway que já criei, defino as variáveis de ambiente (incluindo o
   `DATABASE_URL` do Postgres já provisionado) e disparo o primeiro deploy.
3. No primeiro boot, se as variáveis `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` estiverem
   definidas, o sistema cria automaticamente o primeiro gestor administrador — é com ele
   que você faz o primeiro login e cadastra os demais gestores pela API.

## Endpoints principais
- `POST /api/auth/login` `{email, senha}` → `{token}`
- `GET  /api/colaboradores` (qualquer gestor autenticado — visualização total)
- `POST /api/colaboradores` (só nos seus setores)
- `PATCH /api/colaboradores/:id` (editar dados, ou definir `grupo`/`ciclo_inicio`)
- `POST /api/colaboradores/importar` (multipart, campo `arquivo`; só admin) — faz upsert
  por `Chapa`, então reenviar o arquivo atualiza quem já existe sem duplicar
- `POST /api/escalas` `{setor, inicio, responsavel, excluidos:[]}` → gera a escala do ciclo
- `GET  /api/escalas/:id/grade` → grade pronta (dias × colaboradores × código)
- `PUT  /api/alocacoes/:id/override` `{dia, codigo}` → marca FE/FF num dia específico

## Observação sobre a coluna "Situação"
`A` = ativo (entra na escala). Qualquer outro valor (ex: `P` = prorrogado/afastado) é
importado como `situacao = 'inativo'` e fica automaticamente fora de novas escalas,
mas o cadastro não é apagado — preserva o histórico de escalas já geradas com essa pessoa.
