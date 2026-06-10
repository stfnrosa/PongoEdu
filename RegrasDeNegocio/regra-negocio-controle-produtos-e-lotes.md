# Regra de Negócio – Controle de Produtos e Lotes

## Objetivo

Permitir o controle de estoque por lote, garantindo rastreabilidade, controle de validade e gestão adequada dos materiais utilizados nas práticas.

---

# Estrutura de Controle

O estoque deverá ser controlado em dois níveis:

## Produto

Representa o cadastro principal do item.

O produto deverá conter informações como:

* Código do Produto
* Descrição
* Categoria
* Unidade de Medida
* Controla Estoque (Sim/Não)
* Estoque Mínimo
* Status (Ativo/Inativo)

O cadastro do produto não deverá ser removido em função do consumo ou esgotamento do estoque.

---

## Lote

Representa uma entrada específica de estoque vinculada a um produto.

Cada lote deverá possuir:

* Código do Lote
* Produto
* Data de Fabricação (opcional)
* Data de Validade
* Quantidade Inicial
* Quantidade Atual
* Data de Entrada
* Documento de Entrada
* Status

---

# Relação Produto x Lote

Um produto poderá possuir:

* Nenhum lote
* Um lote
* Vários lotes simultaneamente

Exemplo:

Produto:

* Álcool 70%

Lotes:

* Lote A001 → 10 unidades → validade 01/2027
* Lote A002 → 15 unidades → validade 06/2027
* Lote A003 → 20 unidades → validade 12/2027

Estoque total do produto:

```text
10 + 15 + 20 = 45 unidades
```

---

# Movimentação de Estoque

Toda entrada de estoque deverá criar um novo lote.

O sistema não deverá adicionar saldo diretamente ao produto.

A quantidade deverá ser vinculada obrigatoriamente a um lote.

---

# Consumo de Estoque

As saídas deverão ocorrer a partir dos lotes disponíveis.

O sistema deverá consumir automaticamente os lotes conforme a regra FEFO (First Expire, First Out).

Ou seja:

O lote com a validade mais próxima deverá ser consumido primeiro.

Exemplo:

Lote A001 → validade 01/2027
Lote A002 → validade 06/2027

Ao realizar uma saída:

* O sistema deverá consumir primeiro o lote A001.

---

# Esgotamento de Lote

Quando:

```text
Quantidade Atual = 0
```

O lote deverá:

* Ser marcado como Esgotado.
* Deixar de participar das movimentações de estoque.
* Permanecer disponível para consulta histórica.

O lote não deverá ser excluído fisicamente do sistema.

---

# Existência do Produto

O produto deverá continuar existindo mesmo quando:

* Não possuir saldo.
* Não possuir lotes ativos.
* Todos os lotes estiverem esgotados.
* Todos os lotes estiverem vencidos.

Exemplo:

Produto:

* Luva Descartável

Lotes:

* L001 → Esgotado
* L002 → Esgotado

Resultado:

* Produto continua cadastrado.
* Estoque total = 0.
* Nenhum lote disponível para consumo.

---

# Produtos Sem Estoque

Quando um produto não possuir lotes disponíveis com saldo:

```text
Estoque Total = 0
```

O sistema deverá:

* Exibir o produto normalmente.
* Informar indisponibilidade de estoque.
* Impedir utilização em agendamentos quando necessário.

---

# Controle de Validade

O sistema deverá considerar apenas lotes válidos para consumo.

Lotes vencidos:

* Não poderão ser utilizados em práticas.
* Não poderão ser reservados.
* Não poderão ser movimentados como saída operacional.

---

# Alertas de Validade

O sistema deverá gerar alertas para lotes próximos ao vencimento.

Sugestão:

* Alerta Amarelo: vence em até 90 dias.
* Alerta Vermelho: vence em até 30 dias.

---

# Exclusão

Não será permitida a exclusão física de:

* Produtos que possuam histórico.
* Lotes que possuam movimentações.

Em vez disso:

* Produto → Inativo.
* Lote → Esgotado ou Inativo.

---

# Rastreabilidade

Toda movimentação deverá registrar:

* Produto
* Lote
* Quantidade
* Tipo de movimentação
* Usuário responsável
* Data e hora
* Documento relacionado

---

# Cálculo de Estoque

O estoque exibido para o produto deverá ser calculado pela soma dos lotes ativos e não vencidos.

Fórmula:

```text
Estoque Total = Soma das Quantidades Atuais dos Lotes Disponíveis
```

Este valor será utilizado nas validações de:

* Agendamento
* Solicitação de Compra
* Estoque Mínimo
* Recebimento
* Inventário
