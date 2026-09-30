import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';

const AZUL = '#1f5fbf';
const DIR = FileSystem.documentDirectory + 'relatorios/';
const CHAVE_LISTA = 'relatorios_v1';

const hoje = () => new Date().toLocaleDateString('pt-BR');
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function garantirDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

async function carregarLista() {
  const json = await AsyncStorage.getItem(CHAVE_LISTA);
  return json ? JSON.parse(json) : [];
}

async function salvarLista(lista) {
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(lista));
}

function htmlRelatorio({ fotoBase64, data, local, reparo, horas, gpsTexto }) {
  return `
  <html><head><meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; }
    h1 { text-align:center; color:${AZUL}; font-size: 22px; border-bottom: 4px solid ${AZUL}; padding-bottom: 10px; }
    img { width: 100%; max-height: 420px; object-fit: cover; margin: 16px 0; border-radius: 6px; }
    .campo { border-top: 1px solid #ccc; padding: 8px 0; }
    .rotulo { font-size: 11px; color: #666; text-transform: uppercase; }
    .valor { font-size: 16px; color: #111; margin-top: 2px; }
  </style></head>
  <body>
    <h1>RELATÓRIO DE OBRA</h1>
    <img src="data:image/jpeg;base64,${fotoBase64}" />
    <div class="campo"><div class="rotulo">Data</div><div class="valor">${data}</div></div>
    <div class="campo"><div class="rotulo">Local da obra</div><div class="valor">${local}</div></div>
    ${gpsTexto ? `<div class="campo"><div class="rotulo">Coordenadas GPS</div><div class="valor">${gpsTexto}</div></div>` : ''}
    <div class="campo"><div class="rotulo">O que precisa ser feito</div><div class="valor">${reparo || '—'}</div></div>
    <div class="campo"><div class="rotulo">Horas gastas</div><div class="valor">${horas ? horas + ' h' : '—'}</div></div>
  </body></html>`;
}

export default function App() {
  const frameRef = useRef(null);
  const [tela, setTela] = useState('form'); // form | preview | lista | detalhe
  const [foto, setFoto] = useState(null);
  const [data, setData] = useState(hoje());
  const [local, setLocal] = useState('');
  const [reparo, setReparo] = useState('');
  const [horas, setHoras] = useState('');
  const [gps, setGps] = useState(null); // {lat, lng}
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [lista, setLista] = useState([]);
  const [selecionado, setSelecionado] = useState(null);

  const gpsTexto = gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : '';

  // ---------- captura ----------
  const tirarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permissão', 'Permita o acesso à câmera para tirar fotos.');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled) setFoto(res.assets[0].uri);
  };

  const usarLocalizacao = async () => {
    try {
      setBuscandoGps(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permissão', 'Permita o acesso à localização.');
      const pos = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = pos.coords;
      setGps({ lat: latitude, lng: longitude });
      try {
        const [end] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (end) {
          const partes = [end.street, end.streetNumber, end.district, end.city, end.region].filter(Boolean);
          if (partes.length) setLocal(partes.join(', '));
        }
      } catch {
        // sem geocodificação reversa disponível — mantém só as coordenadas
      }
    } catch (e) {
      Alert.alert('Erro ao obter localização', String(e.message || e));
    } finally {
      setBuscandoGps(false);
    }
  };

  const gerar = () => {
    if (!foto) return Alert.alert('Falta a foto', 'Tire uma foto antes de continuar.');
    if (!local.trim()) return Alert.alert('Falta o local', 'Informe o local da obra.');
    setTela('preview');
  };

  const novo = () => {
    setFoto(null); setLocal(''); setReparo(''); setHoras(''); setData(hoje()); setGps(null);
    setTela('form');
  };

  // ---------- geração de arquivos ----------
  const gerarJpgTemp = () => captureRef(frameRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' });

  const gerarPdfTemp = async () => {
    const base64 = await FileSystem.readAsStringAsync(foto, { encoding: FileSystem.EncodingType.Base64 });
    const html = htmlRelatorio({ fotoBase64: base64, data, local, reparo, horas, gpsTexto });
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  };

  const compartilhar = async (gerarFn, mime) => {
    try {
      const uri = await gerarFn();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: mime });
    } catch (e) {
      Alert.alert('Erro ao compartilhar', String(e.message || e));
    }
  };

  const salvarNaGaleria = async () => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) return Alert.alert('Permissão', 'Permita salvar na galeria.');
      const uri = await gerarJpgTemp();
      const asset = await MediaLibrary.createAssetAsync(uri);
      const album = await MediaLibrary.getAlbumAsync('Relatorios de Obra');
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else await MediaLibrary.createAlbumAsync('Relatorios de Obra', asset, false);
      Alert.alert('Salvo!', 'Imagem salva na galeria (álbum "Relatorios de Obra").');
    } catch (e) {
      Alert.alert('Erro ao salvar na galeria', String(e.message || e));
    }
  };

  // salva JPG + PDF dentro do próprio app e adiciona à lista de relatórios
  const salvarNoApp = async () => {
    try {
      setSalvando(true);
      await garantirDir();
      const id = novoId();

      const jpgTmp = await gerarJpgTemp();
      const jpgUri = DIR + id + '.jpg';
      await FileSystem.copyAsync({ from: jpgTmp, to: jpgUri });

      const pdfTmp = await gerarPdfTemp();
      const pdfUri = DIR + id + '.pdf';
      await FileSystem.copyAsync({ from: pdfTmp, to: pdfUri });

      const registro = {
        id, data, local, reparo, horas,
        gps, jpgUri, pdfUri, criadoEm: Date.now(),
      };
      const listaAtual = await carregarLista();
      const novaLista = [registro, ...listaAtual];
      await salvarLista(novaLista);
      setLista(novaLista);

      Alert.alert('Relatório salvo', 'Ficou guardado no app. Você pode vê-lo em "Relatórios salvos".');
    } catch (e) {
      Alert.alert('Erro ao salvar', String(e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  // ---------- lista ----------
  const abrirLista = async () => {
    const l = await carregarLista();
    setLista(l);
    setTela('lista');
  };

  const abrirDetalhe = (registro) => {
    setSelecionado(registro);
    setTela('detalhe');
  };

  const excluir = async (registro) => {
    Alert.alert('Excluir relatório', 'Tem certeza? Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            await FileSystem.deleteAsync(registro.jpgUri, { idempotent: true });
            await FileSystem.deleteAsync(registro.pdfUri, { idempotent: true });
          } catch {}
          const novaLista = (await carregarLista()).filter((r) => r.id !== registro.id);
          await salvarLista(novaLista);
          setLista(novaLista);
          setTela('lista');
        },
      },
    ]);
  };

  // ---------- telas ----------
  if (tela === 'lista') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <TouchableOpacity onPress={novo}><Text style={s.headerLink}>‹ Novo</Text></TouchableOpacity>
          <Text style={s.headerTitulo}>Relatórios salvos</Text>
          <View style={{ width: 50 }} />
        </View>
        <FlatList
          data={lista}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={s.vazio}>Nenhum relatório salvo ainda.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.linha} onPress={() => abrirDetalhe(item)}>
              <Image source={{ uri: item.jpgUri }} style={s.linhaImg} />
              <View style={{ flex: 1 }}>
                <Text style={s.linhaLocal} numberOfLines={1}>{item.local}</Text>
                <Text style={s.linhaSub}>{item.data} · {item.horas ? item.horas + ' h' : 'sem horas'}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  if (tela === 'detalhe' && selecionado) {
    const r = selecionado;
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <TouchableOpacity onPress={() => setTela('lista')}><Text style={s.headerLink}>‹ Lista</Text></TouchableOpacity>
          <Text style={s.headerTitulo}>Detalhe</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={s.pad}>
          <Image source={{ uri: r.jpgUri }} style={s.detalheImg} resizeMode="contain" />
          <Botao texto="Compartilhar JPG" onPress={() => compartilhar(() => Promise.resolve(r.jpgUri), 'image/jpeg')} />
          <Botao texto="Compartilhar PDF" onPress={() => compartilhar(() => Promise.resolve(r.pdfUri), 'application/pdf')} secundario />
          <Botao texto="Excluir relatório" onPress={() => excluir(r)} secundario />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (tela === 'preview') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={s.pad}>
          {/* MOLDURA: tudo aqui dentro vira o JPG */}
          <View ref={frameRef} collapsable={false} style={s.frame}>
            <Text style={s.frameTitulo}>RELATÓRIO DE OBRA</Text>
            <Image source={{ uri: foto }} style={s.frameFoto} resizeMode="cover" />
            <Campo rotulo="Data" valor={data} />
            <Campo rotulo="Local da obra" valor={local} />
            {gpsTexto ? <Campo rotulo="Coordenadas GPS" valor={gpsTexto} /> : null}
            <Campo rotulo="O que precisa ser feito" valor={reparo || '—'} />
            <Campo rotulo="Horas gastas" valor={horas ? `${horas} h` : '—'} />
          </View>

          <Botao texto={salvando ? 'Salvando...' : 'Salvar relatório (JPG + PDF)'} onPress={salvarNoApp} disabled={salvando} />
          <Botao texto="Compartilhar JPG" onPress={() => compartilhar(gerarJpgTemp, 'image/jpeg')} secundario />
          <Botao texto="Compartilhar PDF" onPress={() => compartilhar(gerarPdfTemp, 'application/pdf')} secundario />
          <Botao texto="Salvar imagem na galeria do celular" onPress={salvarNaGaleria} secundario />
          <Botao texto="Voltar e editar" onPress={() => setTela('form')} secundario />
          <Botao texto="Novo relatório" onPress={novo} secundario />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={s.titulo}>Novo registro</Text>
            <TouchableOpacity onPress={abrirLista}><Text style={s.headerLink}>📋 Relatórios</Text></TouchableOpacity>
          </View>

          <TouchableOpacity onPress={tirarFoto} style={s.fotoBox}>
            {foto ? <Image source={{ uri: foto }} style={s.fotoImg} /> : <Text style={s.fotoTxt}>📷 Toque para tirar a foto</Text>}
          </TouchableOpacity>
          {foto && <Botao texto="Tirar outra foto" onPress={tirarFoto} secundario />}

          <Text style={s.label}>Data</Text>
          <TextInput style={s.input} value={data} onChangeText={setData} placeholder="dd/mm/aaaa" />

          <View style={s.linhaLabel}>
            <Text style={s.label}>Local da obra</Text>
            <TouchableOpacity onPress={usarLocalizacao} disabled={buscandoGps} style={s.gpsBtn}>
              {buscandoGps ? <ActivityIndicator size="small" color={AZUL} /> : <Text style={s.gpsBtnTxt}>📍 Usar GPS</Text>}
            </TouchableOpacity>
          </View>
          <TextInput style={s.input} value={local} onChangeText={setLocal} placeholder="Ex.: Rua X, 123 – Bloco B" />
          {gpsTexto ? <Text style={s.gpsInfo}>Coordenadas: {gpsTexto}</Text> : null}

          <Text style={s.label}>O que precisa ser feito (reparo/conserto)</Text>
          <TextInput
            style={[s.input, { height: 100, textAlignVertical: 'top' }]}
            value={reparo} onChangeText={setReparo} multiline placeholder="Descreva o serviço"
          />

          <Text style={s.label}>Horas gastas</Text>
          <TextInput style={s.input} value={horas} onChangeText={setHoras} keyboardType="decimal-pad" placeholder="Ex.: 2.5" />

          <Botao texto="Gerar relatório" onPress={gerar} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Campo = ({ rotulo, valor }) => (
  <View style={s.campo}>
    <Text style={s.campoRotulo}>{rotulo}</Text>
    <Text style={s.campoValor}>{valor}</Text>
  </View>
);

const Botao = ({ texto, onPress, secundario, disabled }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={[s.btn, secundario && s.btnSec, disabled && { opacity: 0.6 }]}>
    <Text style={[s.btnTxt, secundario && s.btnTxtSec]}>{texto}</Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f5f7' },
  pad: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerTitulo: { fontWeight: '700', fontSize: 16 },
  headerLink: { color: AZUL, fontWeight: '600' },
  titulo: { fontSize: 22, fontWeight: '700' },
  fotoBox: { height: 220, borderRadius: 12, backgroundColor: '#e3e6ea', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 8, marginBottom: 8 },
  fotoImg: { width: '100%', height: '100%' },
  fotoTxt: { fontSize: 16, color: '#555' },
  label: { marginTop: 12, marginBottom: 4, fontWeight: '600', color: '#333' },
  linhaLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gpsBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  gpsBtnTxt: { color: AZUL, fontWeight: '600', fontSize: 13 },
  gpsInfo: { fontSize: 12, color: '#666', marginTop: 4 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d0d4da', padding: 10, fontSize: 16 },
  btn: { backgroundColor: AZUL, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  btnSec: { backgroundColor: '#fff', borderWidth: 1, borderColor: AZUL },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnTxtSec: { color: AZUL },
  // moldura
  frame: { backgroundColor: '#fff', borderWidth: 4, borderColor: AZUL, padding: 14 },
  frameTitulo: { textAlign: 'center', fontWeight: '800', fontSize: 18, color: AZUL, marginBottom: 10 },
  frameFoto: { width: '100%', aspectRatio: 4 / 3, marginBottom: 10, backgroundColor: '#ddd' },
  campo: { borderTopWidth: 1, borderColor: '#ccc', paddingVertical: 6 },
  campoRotulo: { fontSize: 11, color: '#666', textTransform: 'uppercase' },
  campoValor: { fontSize: 16, color: '#111' },
  // lista
  linha: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center' },
  linhaImg: { width: 60, height: 60, borderRadius: 6, marginRight: 12, backgroundColor: '#ddd' },
  linhaLocal: { fontSize: 16, fontWeight: '600' },
  linhaSub: { fontSize: 13, color: '#666', marginTop: 2 },
  vazio: { textAlign: 'center', color: '#777', marginTop: 40 },
  detalheImg: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: '#eee' },
});
