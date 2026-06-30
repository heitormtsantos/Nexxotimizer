# Nexxsensi Mobile Optimizer - Fluxo sem computador

## Decisao

O fluxo principal do Nexxsensi Mobile Optimizer deve funcionar direto no celular. A
interface nao deve exigir que o comprador entenda ADB, URL local, bridge desktop,
token, localhost ou comandos.

O desktop bridge continua existindo como modo tecnico opcional, mas nao deve ser a
porta de entrada do produto.

## Publico

Usuario gamer ou usuario comum que comprou o produto para reduzir travamentos,
melhorar bateria e preparar o celular para jogos. Esse usuario nao deve precisar
conhecer programacao ou ferramentas Android.

## Experiencia principal

Tela inicial:

- Status simples do aparelho.
- Botao para ativar modo avancado.
- Acoes grandes e clicaveis:
  - Boost Jogo.
  - Iniciar Jogo.
  - Otimizar Bateria.
  - Limpar Cache.
  - Reduzir Travamentos.
  - Reverter.

## Modo avancado

O app deve explicar como ativar depuracao Wi-Fi em linguagem de consumidor:

1. Abrir configuracoes do Android.
2. Ativar opcoes do desenvolvedor, se ainda nao estiver ativo.
3. Abrir Depuracao sem fio.
4. Tocar em Parear dispositivo com codigo.
5. Informar codigo e porta no app.

Android 11 ou superior e o alvo principal para pareamento sem computador. Em
versoes antigas, o app deve limitar funcoes ou informar que o modo avancado nao
esta disponivel sem root/computador.

## Arquitetura

- React Native continua sendo a interface.
- Uma camada `AdvancedModeService` deve concentrar deteccao de Android, status do
  modo avancado, pareamento Wi-Fi e execucao de acoes.
- A implementacao Expo atual pode simular/explicar o fluxo, mas execucao real sem
  computador exige modulo Android nativo ou integracao Shizuku.
- A UI nao deve depender do bridge desktop para mostrar as acoes principais.

## Linguagem

Usar termos orientados a beneficio:

- "Ativar modo avancado" em vez de "conectar ADB".
- "Boost Jogo" em vez de "perfil gaming".
- "Limpar Cache" em vez de "pm trim-caches".
- "Reverter ajustes" em vez de "revert record".
