// Transcrição local com Whisper (roda dentro do celular, sem servidor)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODELOS = {
  rapida: 'onnx-community/whisper-base',
  precisa: 'onnx-community/whisper-small',
};

let pipe = null;
let chaveAtual = null;
let carregando = null;

function progresso(p) {
  if (p.status === 'progress' && p.total) {
    postMessage({ tipo: 'progresso', arquivo: p.file, carregado: p.loaded, total: p.total });
  }
}

async function criar(id, device) {
  if (device === 'webgpu') {
    return pipeline('automatic-speech-recognition', id, {
      device: 'webgpu',
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      progress_callback: progresso,
    });
  }
  return pipeline('automatic-speech-recognition', id, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: progresso,
  });
}

async function carregar(qualidade, gpu) {
  const id = MODELOS[qualidade] || MODELOS.rapida;
  const chave = id + (gpu ? ':gpu' : ':cpu');
  if (pipe && chaveAtual === chave) return;
  if (carregando && carregando.chave === chave) return carregando.promessa;

  const promessa = (async () => {
    if (pipe) {
      try { await pipe.dispose(); } catch (e) {}
      pipe = null;
    }
    postMessage({ tipo: 'carregando' });
    let device = 'wasm';
    if (gpu && self.navigator && self.navigator.gpu) {
      try {
        const a = await self.navigator.gpu.requestAdapter();
        if (a) device = 'webgpu';
      } catch (e) {}
    }
    try {
      pipe = await criar(id, device);
    } catch (e) {
      if (device !== 'webgpu') throw e;
      device = 'wasm';
      pipe = await criar(id, device);
    }
    chaveAtual = chave;
    postMessage({ tipo: 'pronto', device });
  })();
  carregando = { chave, promessa };
  try {
    await promessa;
  } finally {
    carregando = null;
  }
}

const IDIOMAS = { pt: 'portuguese', en: 'english', es: 'spanish' };

onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'carregar') {
      await carregar(m.qualidade, m.gpu);
    } else if (m.tipo === 'transcrever') {
      await carregar(m.qualidade, m.gpu);
      const opcoes = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
      if (IDIOMAS[m.idioma]) opcoes.language = IDIOMAS[m.idioma];
      const saida = await pipe(m.audio, opcoes);
      const texto = (Array.isArray(saida) ? saida.map((s) => s.text).join(' ') : saida.text) || '';
      postMessage({ tipo: 'texto', id: m.id, texto: texto.replace(/\s+/g, ' ').trim() });
    }
  } catch (e) {
    postMessage({ tipo: 'erro', id: m.id, msg: String((e && e.message) || e) });
  }
};
