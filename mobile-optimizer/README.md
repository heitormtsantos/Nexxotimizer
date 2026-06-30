# Nexxsensi Mobile Optimizer

App React Native/Expo para o otimizador Android da Nexxsensi.

O fluxo principal e celular direto, sem exigir computador. A interface usa linguagem
de consumidor: Boost Jogo, Otimizar Bateria, Limpar Cache, Reduzir Travamentos e
Reverter.

O app mantem a identidade visual da versao desktop: fundo escuro, paineis compactos,
vermelho de acao, verde de status e banners reaproveitados de `optimizerDuck`.

## Rodar

```powershell
npm install
npm run start -- --localhost --port 8082
```

Para rodar no navegador:

```powershell
npm run web:dev
```

URLs locais para desenvolvimento:

- App web: `http://localhost:8084`
- Expo/Metro mobile: `http://localhost:8082`
- Bridge ADB opcional/tecnico: `http://localhost:4545`

Abra no Expo Go ou use:

```powershell
npm run android
```

Importante: a partir da integracao nativa, Expo Go serve apenas para testar UI.
Para listar jogos instalados, abrir jogos e ler status real de Shizuku/Android,
use build nativo com `npm run android`.

Requisitos locais para build Android:

- JDK 17.
- Android SDK configurado em `ANDROID_HOME` ou `android/local.properties`.
- Um aparelho Android com depuracao USB ou wireless debugging para instalar o app.

Para iniciar o bridge tecnico opcional:

```powershell
npm run bridge
```

Verificar se o ambiente local principal esta vivo:

```powershell
npm run verify:local
```

Esse comando valida o bridge tecnico, catalogo, protecao por token e a resposta
HTML do app web quando ele estiver rodando.

## Fluxo principal

- O usuario abre o app no celular.
- A tela inicial mostra botoes grandes: Boost Jogo, Iniciar Jogo, Otimizar
  Bateria, Limpar Cache, Reduzir Travamentos e Reverter.
- Quando uma acao precisa de permissao avancada, o app abre o assistente
  **Ativar modo avancado**.
- O assistente guia o usuario para Depuracao sem fio no proprio Android.
- Android 11+ e o alvo recomendado para pareamento sem computador.

## Arquitetura planejada

- **Mobile app**: interface principal, ativacao/key, botoes de otimizacao,
  assistente de modo avancado e historico.
- **AdvancedModeService**: camada para detectar Android, orientar depuracao Wi-Fi,
  integrar modulo Android nativo ou Shizuku e executar acoes.
- **Desktop ADB Bridge**: modo tecnico opcional, nao e a entrada principal do
  produto.
- **Backend existente**: reaproveita validacao de key e pode servir catalogo
  remoto de otimizacoes.
- **Reversao**: estado por aparelho, versao Android e comandos aplicados.

## Estado atual

- Home mobile/gamer sem URL, localhost, token ou bridge na tela principal.
- Assistente de modo avancado por depuracao sem fio.
- Projeto Android nativo gerado em `android/`.
- Modulo nativo `NexxsensiNative` para listar jogos instalados, abrir jogo
  selecionado, abrir opcoes do desenvolvedor, abrir Shizuku e checar status de
  Shizuku/permissao.
- Execucao privilegiada por Shizuku UserService para acoes seguras:
  Boost Jogo, Limpar Cache, Otimizacao de RAM, Resfriamento, Reduzir Travamentos
  e Reverter.
- Metricas reais no Android: RAM, armazenamento, bateria, temperatura quando
  disponivel e ping.
- Botoes clicaveis para Boost Jogo, Iniciar Jogo, Otimizar Bateria, Limpar Cache,
  Reduzir Travamentos e Reverter.
- Servico `AdvancedModeService` criado para concentrar a futura integracao
  Shizuku/modulo nativo.
- App web em `http://localhost:8084`.
- Desktop ADB Bridge local em `http://localhost:4545` como modo tecnico.
- Catalogo de debloat possui filtros/recomendacoes por fabricante:
  Geral, Samsung, Xiaomi/POCO, Motorola, Oppo e Realme.
- Validacao de key usa a API `api.nexxsensi.com/api/keys/validate`.
- Persistencia segura no app mobile com `expo-secure-store`; na web, usa
  `localStorage`.

## Proximos blocos para producao

- Testar execucao privilegiada em aparelho real com Shizuku autorizado.
- Completar pareamento Wi-Fi ADB por codigo dentro do celular quando nao houver
  Shizuku ativo.
- Refinar allowlist de comandos por fabricante e versao Android.
- Expandir catalogo por fabricante com allowlist/blocklist segura.
- Conectar ativacao/key ao backend da Nexxsensi.
- Testar em Samsung, Xiaomi/POCO, Motorola, Realme/Oppo e Android 11-15.

## Bridge ADB tecnico opcional

O bridge continua util para desenvolvimento, suporte e modo tecnico, mas nao e o
fluxo principal para o comprador comum.

```powershell
$env:ADB_PATH="C:\platform-tools\adb.exe"
npm run bridge
```

Gerar pacote portatil do companion desktop:

```powershell
npm run package:bridge
```

Saida: `dist/nexxsensi-adb-bridge/` e `dist/nexxsensi-adb-bridge.zip`.

Instalar Platform Tools pelo bridge:

```powershell
Invoke-RestMethod http://localhost:4545/platform-tools/install `
  -Method Post `
  -Headers @{ "X-Bridge-Token" = "<token>" } `
  -ContentType "application/json" `
  -Body '{}'
```

O download usa o pacote oficial do Google para Windows:
`https://dl.google.com/android/repository/platform-tools-latest-windows.zip`.
Pagina oficial: `https://developer.android.com/tools/releases/platform-tools`.

Execucao real pela API exige token do bridge e confirmacao literal:

```powershell
Invoke-RestMethod http://localhost:4545/apply `
  -Method Post `
  -Headers @{ "X-Bridge-Token" = "<token>" } `
  -ContentType "application/json" `
  -Body '{"serial":"DEVICE_SERIAL","optimizationId":"balanced","dryRun":false,"confirmation":"APPLY_REAL_ADB_COMMANDS"}'
```
