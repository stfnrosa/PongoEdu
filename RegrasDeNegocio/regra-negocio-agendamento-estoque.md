# Regra de Negócio – Agendamento de Práticas com Validação de Estoque

## Objetivo

Garantir que agendamentos de práticas somente sejam concluídos quando houver disponibilidade suficiente dos materiais necessários, mantendo a integridade do estoque e permitindo que o professor solicite apoio da equipe auxiliar quando aplicável.

---

# Cadastro de Produtos

## Controle de Estoque

O cadastro de produtos deverá possuir o campo:

**Controla Estoque** (Sim/Não)

### Quando "Controla Estoque" = Sim

O sistema deverá:

* Controlar entradas e saídas de estoque.
* Validar disponibilidade durante o agendamento.
* Exigir o preenchimento do campo Estoque Mínimo.
* Participar das rotinas automáticas de reposição.

### Quando "Controla Estoque" = Não

O sistema não deverá:

* Controlar saldo.
* Validar disponibilidade.
* Participar das movimentações de estoque.
* Gerar solicitações automáticas de compra.

---

## Estoque Mínimo

Todo produto que controla estoque deverá possuir um valor de Estoque Mínimo configurado.

### Finalidade

Permitir que o sistema identifique automaticamente a necessidade de reposição.

### Regra

```text
Saldo Atual ≤ Estoque Mínimo
```

O sistema deverá gerar automaticamente uma Solicitação de Compra.

---

# Criação de Agendamento

## Validação de Estoque

Ao criar um agendamento, o sistema deverá validar todos os materiais vinculados à prática.

A validação deverá considerar apenas produtos com:

```text
Controla Estoque = Sim
```

---

## Estoque Suficiente

Quando todos os materiais possuírem quantidade suficiente:

* O botão "Criar Agendamento" deverá permanecer habilitado.
* O agendamento poderá ser criado normalmente.

---

## Estoque Insuficiente

Quando existir ao menos um material com quantidade insuficiente:

```text
Saldo Atual < Quantidade Solicitada
```

O sistema deverá:

* Exibir quais materiais estão indisponíveis.
* Bloquear o botão "Criar Agendamento".
* Impedir a conclusão do agendamento.

Mensagem:

> Não há quantidade suficiente em estoque para um ou mais materiais selecionados. O agendamento não poderá ser criado até que o estoque seja regularizado.

---

# Solicitação ao Auxiliar

## Cenário Permitido

O botão **Enviar Solicitação ao Auxiliar** somente deverá ser exibido quando:

```text
Estoque Mínimo < Saldo Atual < Quantidade Solicitada
```

Ou seja:

* Existe estoque disponível.
* O saldo não atende à necessidade da prática.
* O produto ainda não atingiu o estoque mínimo.

---

## Cenário Não Permitido

Quando:

```text
Saldo Atual ≤ Estoque Mínimo
```

O sistema NÃO deverá exibir o botão de solicitação ao auxiliar.

Motivo:

A reposição será tratada automaticamente pela rotina de estoque mínimo.

Mensagem:

> Este material está abaixo do estoque mínimo. A solicitação de compra será gerada automaticamente pelo sistema.

---

## Envio da Solicitação

Ao clicar em **Enviar Solicitação ao Auxiliar**, o sistema deverá:

* Criar uma Solicitação de Compra.
* Registrar origem = Professor.
* Registrar professor solicitante.
* Registrar os materiais solicitados.
* Registrar as quantidades solicitadas.
* Registrar data e hora da solicitação.
* Definir status inicial = Pendente de Análise.

Mensagem:

> Solicitação enviada para análise da equipe auxiliar.

---

# Bloqueio do Agendamento

Após o envio da solicitação:

* O botão Criar Agendamento deverá continuar bloqueado.
* O agendamento não deverá ser criado.
* Nenhum estoque deverá ser reservado.

Motivo:

A quantidade disponível continua insuficiente para atender à prática.

---

# Salvamento em Rascunho

## Fechamento do Modal

Quando o professor tentar fechar o modal após enviar uma solicitação ao auxiliar, o sistema deverá exibir:

> Você enviou uma solicitação ao auxiliar, mas o agendamento ainda não pode ser criado por falta de estoque. Deseja salvar este agendamento como rascunho para continuar depois?

Botões:

* Descartar
* Salvar Rascunho

---

## Ao Salvar Rascunho

O sistema deverá:

* Salvar os dados preenchidos.
* Salvar materiais e quantidades selecionadas.
* Vincular o rascunho à solicitação criada.
* Definir status = Rascunho.

O sistema NÃO deverá:

* Criar o agendamento.
* Reservar estoque.
* Exibir o registro na agenda.

Mensagem:

> Agendamento salvo como rascunho. Você será notificado quando houver estoque disponível para continuar.

---

# Exceções para Exibição do Rascunho

A mensagem de salvamento em rascunho NÃO deverá ser exibida quando, após o envio da solicitação:

* O material solicitado for removido.
* A quantidade do material for alterada.
* O material for substituído.
* A solicitação deixar de representar os dados atuais do formulário.

Nesses casos, ao fechar o modal, o sistema deverá exibir apenas a confirmação padrão de descarte.

Mensagem:

> Existem alterações não salvas. Deseja descartar as informações preenchidas?

---

# Notificação de Disponibilidade

Quando houver entrada de estoque suficiente para atender ao rascunho:

```text
Saldo Atual ≥ Quantidade Solicitada
```

O sistema deverá:

* Notificar o professor responsável.
* Informar que o agendamento poderá ser retomado.

Mensagem:

> Os materiais do seu agendamento em rascunho já possuem estoque disponível. Você pode continuar o agendamento.

---

# Regras Gerais

* O professor não poderá concluir um agendamento sem estoque suficiente.
* O envio de solicitação ao auxiliar não cria um agendamento.
* O envio de solicitação ao auxiliar não reserva estoque.
* O rascunho não bloqueia agenda nem estoque.
* O botão Criar Agendamento somente será habilitado quando todos os materiais possuírem saldo suficiente.
* Solicitações por estoque mínimo são geradas automaticamente pelo sistema.
* Solicitações originadas pelo professor dependem de análise da equipe auxiliar.
* Todas as ações deverão ser registradas em histórico para fins de auditoria.
