 Obra Foto (Expo + React Native)

Tira foto → preenche os dados (com opção de pegar a localização por GPS) → gera um relatório em **JPG** e/ou **PDF** → salva dentro do app (com tela de lista dos relatórios já feitos) e, opcionalmente, na galeria do celular.

## Telas

- **Novo registro**: tira a foto, botão "📍 Usar GPS" preenche o local automaticamente (endereço aproximado + coordenadas), preenche reparo e horas.
- **Preview / moldura**: mostra o relatório montado; permite salvar (JPG + PDF) dentro do app, compartilhar cada formato, ou salvar o JPG na galeria.
- **Relatórios salvos**: lista todos os relatórios já salvos no app, com miniatura, local e data.
- **Detalhe**: abre um relatório salvo, permite compartilhar de novo (JPG/PDF) ou excluir.

## Como criar o projeto

```bash
npx create-expo-app@latest obra-foto --template blank
cd obra-foto

npx expo install \
  expo-image-picker \
  expo-media-library \
  expo-sharing \
  expo-location \
  expo-file-system \
  expo-print \
  react-native-view-shot \
  @react-native-async-storage/async-storage
```

Substitua o `App.js` gerado pelo deste projeto.

## Permissões (app.json)

Dentro de `"expo"`, adicione:

```json
"plugins": [
  ["expo-image-picker", { "cameraPermission": "Permitir que o app use a câmera para fotografar a obra." }],
  ["expo-media-library", { "savePhotosPermission": "Permitir salvar os relatórios na galeria." }],
  ["expo-location", { "locationAlwaysAndWhenInUsePermission": "Permitir usar a localização para preencher o local da obra." }]
]
```

## Rodar

```bash
npx expo start
```

Escaneie o QR code com o app **Expo Go**.

> No Android, o Expo Go tem limitações com a galeria e com alguns módulos nativos (GPS costuma funcionar bem). Se algo falhar em "Salvar na galeria", use um build de desenvolvimento:
> ```bash
> npx expo run:android
> ```

## Onde os relatórios ficam salvos

Os arquivos JPG e PDF de cada relatório salvo pela tela de preview ficam em uma pasta própria do app:
`FileSystem.documentDirectory + 'relatorios/'`
Isso é armazenamento **local e privado do app** — não depende de permissão de galeria e não some se o usuário desinstalar outro app. A lista (metadados) fica em `AsyncStorage`.

Se o usuário também tocar em "Salvar imagem na galeria do celular", uma cópia do JPG vai para o álbum **Relatorios de Obra**, visível no app de Fotos.

## Gerar APK para instalar

```bash
npm i -g eas-cli
eas build -p android --profile preview
```

## Decisões de implementação

- **PDF**: gerado com `expo-print` a partir de um HTML simples (mesmo leiaute da moldura). Não precisa de biblioteca extra de layout de PDF.
- **JPG**: gerado com `react-native-view-shot`, tirando um "print" da moldura React Native — mesmo mecanismo da primeira versão.
- **Lista de relatórios**: metadados em `AsyncStorage` (leve, sem banco de dados) + arquivos JPG/PDF na pasta de documentos do app.
- **GPS**: `expo-location` pega coordenadas e tenta converter em endereço (`reverseGeocodeAsync`); se a geocodificação reversa falhar (ex.: sem internet), o app mantém as coordenadas numéricas no relatório mesmo assim.
