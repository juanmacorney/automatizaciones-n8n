// aviso_nuevo_episodio v2 (2026-11-10) - corrige la auditoria (C1-C3, I1-I4, I6, I7).
// AJUSTES DEL FLUJO (se ponen aparte en n8n, el SDK no los guarda aca):
//   errorWorkflow = ID_FLUJO_ERRORES (error_trigger) · timezone = America/Montevideo · executionOrder = v1
import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// ============ IDs fijos (no son secretos) ============
const TABLA = { __rl: true, mode: 'id', value: 'ID_TABLA_EPISODIOS' };
const CRED_BREVO = { httpHeaderAuth: { id: 'ID_CRED_BREVO', name: 'brevo' } };
const CRED_GMAIL = { gmailOAuth2: { id: 'ID_CRED_GMAIL', name: 'Gmail flor' } };
// Reintentos solo en lo que se puede repetir sin consecuencias (lecturas y correos sueltos).
// NUNCA en crear_campana ni en enviar_campana.
const REINTENTOS = { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 };

// Esquema de columnas de la tabla episodios_podcast
const S_EPISODIO_ID = { id: 'episodio_id', displayName: 'episodio_id', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false };
const S_TITULO = { id: 'titulo', displayName: 'titulo', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false };
const S_FECHA = { id: 'fecha_spotify', displayName: 'fecha_spotify', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false };
const S_VISTO = { id: 'visto_el', displayName: 'visto_el', required: false, defaultMatch: false, display: true, type: 'dateTime', readOnly: false, removed: false };
const S_ESTADO = { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false };
const S_YOUTUBE = { id: 'youtube_id', displayName: 'youtube_id', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false };
const S_CAMPANA = { id: 'campana_id', displayName: 'campana_id', required: false, defaultMatch: false, display: true, type: 'number', readOnly: false, removed: false };
const S_ALERTA = { id: 'alerta_youtube_enviada', displayName: 'alerta_youtube_enviada', required: false, defaultMatch: false, display: true, type: 'boolean', readOnly: false, removed: false };
const S_NOTA = { id: 'nota', displayName: 'nota', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false };

// ============ 1. Disparo ============
const cada_hora = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'cada_hora',
    // 2026-11-10: el admin lo cambio en n8n a cada 1 hora (antes cada 15 min)
    parameters: { rule: { interval: [{ field: 'hours' }] } }
  }
});

// ============ 2. Configuracion (lo unico que se toca para pasar de prueba a real) ============
const configuracion = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'configuracion',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'c1', name: 'lista_id', value: 23, type: 'number' },
          { id: 'c2', name: 'lista_nombre', value: 'Registrados De WIX', type: 'string' },
          { id: 'c3', name: 'correo_aprobacion', value: 'correo@ejemplo.com', type: 'string' },
          { id: 'c4', name: 'correo_admin', value: 'correo@ejemplo.com', type: 'string' },
          { id: 'c5', name: 'remitente_id', value: 1, type: 'number' },
          { id: 'c6', name: 'dias_maximos_nuevo', value: 3, type: 'number' },
          { id: 'c7', name: 'horas_alerta_youtube', value: 6, type: 'number' },
          { id: 'c8', name: 'minutos_aprobacion', value: 2880, type: 'number' },
          { id: 'c9', name: 'horas_max_preparando', value: 6, type: 'number' },
          { id: 'c10', name: 'horas_trabado_aprobacion', value: 49, type: 'number' },
          { id: 'c11', name: 'dias_pulso', value: 30, type: 'number' }
        ]
      },
      options: {}
    }
  }
});

// ============ 3. Leer Spotify, YouTube y la tabla ============
const buscar_episodios_spotify = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'buscar_episodios_spotify',
    ...REINTENTOS,
    parameters: {
      method: 'GET',
      url: 'https://api.spotify.com/v1/shows/ID_DEL_SHOW_SPOTIFY/episodes',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'spotifyOAuth2Api',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'limit', value: '5' }, { name: 'market', value: 'UY' }] },
      options: {}
    },
    credentials: { spotifyOAuth2Api: { id: 'ID_CRED_SPOTIFY', name: 'spotify_flor' } }
  }
});

const buscar_videos_youtube = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'buscar_videos_youtube',
    executeOnce: true,
    ...REINTENTOS,
    parameters: {
      method: 'GET',
      url: 'https://www.googleapis.com/youtube/v3/playlistItems',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'part', value: 'snippet,contentDetails' },
          { name: 'playlistId', value: 'UU4vxwwZUTWzdQdj-_IbiTbQ' },
          { name: 'maxResults', value: '15' }
        ]
      },
      options: {}
    },
    credentials: { httpQueryAuth: { id: 'ID_CRED_YOUTUBE', name: 'youtube_api_key' } }
  }
});

const leer_tabla = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'leer_tabla',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: TABLA, returnAll: true }
  }
});

// ============ 4. Decidir (todo determinista, sin IA) ============
const decidir = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'decidir',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const ZONA = 'America/Montevideo';
const MINUTOS_REINTENTO = 60; // 'preparando' sin avanzar por 1 h = la corrida murio, se reintenta
const cfg = $('configuracion').first().json;
const episodios = ($('buscar_episodios_spotify').first().json.items || []).filter(e => e && e.id);
const videosCrudos = $('buscar_videos_youtube').first().json.items || [];
const filas = $('leer_tabla').all().map(i => i.json).filter(f => f && f.episodio_id);

// Gritar en vez de adivinar
if (episodios.length === 0) throw new Error('Spotify no devolvio ningun episodio del podcast (respuesta vacia).');
if (filas.length === 0) throw new Error('La tabla episodios_podcast esta vacia. No sigo para no tomar episodios viejos como nuevos: hay que volver a sembrarla.');

const ahora = DateTime.now().setZone(ZONA);
const hoy = ahora.startOf('day');
const fecha = iso => DateTime.fromJSDate(new Date(iso));
const horasDesde = iso => ahora.diff(fecha(iso), 'hours').hours;
const diaSpotify = ep => ep && ep.release_date_precision === 'day' ? DateTime.fromISO(ep.release_date, { zone: ZONA }).startOf('day') : null;
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const porId = {};
for (const f of filas) porId[f.episodio_id] = f;

const filaDe = f => ({
  episodio_id: f.episodio_id, titulo: f.titulo || '', fecha_spotify: f.fecha_spotify || '',
  visto_el: f.visto_el ? new Date(f.visto_el).toISOString() : ahora.toUTC().toISO(),
  estado: f.estado || '', youtube_id: f.youtube_id || '', alerta_youtube_enviada: f.alerta_youtube_enviada === true, nota: f.nota || ''
});

// Parecido por palabras (solo para desempatar videos del mismo rango de fechas)
const palabras = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
  .replace(/https?:\\/\\/\\S+/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length > 3));
const parecido = (a, b) => {
  if (!a.size || !b.size) return 0;
  let c = 0;
  for (const w of a) if (b.has(w)) c++;
  return c / Math.min(a.size, b.size);
};

const videos = videosCrudos.map(v => {
  const s = v.snippet || {};
  const t = s.thumbnails || {};
  const id = (v.contentDetails && v.contentDetails.videoId) || (s.resourceId && s.resourceId.videoId);
  const publicado = (v.contentDetails && v.contentDetails.videoPublishedAt) || s.publishedAt;
  return {
    id, publicado,
    titulo: s.title || '',
    descripcion: s.description || '',
    miniatura: (t.maxres && t.maxres.url) || (t.standard && t.standard.url) || (t.high && t.high.url) || '',
    url: 'https://www.youtube.com/watch?v=' + id,
    palabras: palabras((s.title || '') + ' ' + (s.description || ''))
  };
}).filter(v => v.id && v.publicado && v.titulo !== 'Private video' && v.titulo !== 'Deleted video');

const salida = [];
const registrar = fila => salida.push({ json: { accion: 'registrar', fila } });
const alertar = (fila, asunto, mensaje) => salida.push({ json: { accion: 'alertar', fila, alerta_asunto: asunto, alerta_mensaje: mensaje } });

// ---- A) Filas trabadas: la ejecucion que las llevaba murio ----
for (const f of filas) {
  if (f.episodio_id === '__pulso__' || !f.updatedAt) continue;
  const trabadaAprobacion = f.estado === 'esperando_aprobacion' && horasDesde(f.updatedAt) >= cfg.horas_trabado_aprobacion;
  const trabadaEnvio = f.estado === 'enviando' && horasDesde(f.updatedAt) >= 1;
  if (!trabadaAprobacion && !trabadaEnvio) continue;
  alertar({ ...filaDe(f), estado: 'trabado', nota: 'Quedo en ' + f.estado + ' sin terminar' },
    'Revisar episodio trabado: ' + f.titulo,
    'El episodio <b>' + esc(f.titulo) + '</b> quedó en <b>' + f.estado + '</b> hace más de ' + Math.floor(horasDesde(f.updatedAt)) +
    ' horas y la ejecución no terminó.<br><br>' +
    (trabadaEnvio
      ? 'Puede que el mail SÍ haya salido: revisá la campaña ' + f.campana_id + ' en Brevo antes de hacer nada.'
      : 'No se envió nada. El borrador es la campaña ' + f.campana_id + ' en Brevo; si querés mandarlo, hacelo desde Brevo.'));
}

// ---- B) Episodios de Spotify, del mas viejo al mas nuevo ----
let yaHayUnoPreparando = false;
const ordenados = [...episodios].sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)));

for (const ep of ordenados) {
  const fila = porId[ep.id];
  const fechaEp = diaSpotify(ep);
  const diasEp = fechaEp ? hoy.diff(fechaEp, 'days').days : 999;
  const base = {
    episodio_id: ep.id,
    titulo: ep.name || '',
    fecha_spotify: ep.release_date || '',
    visto_el: fila && fila.visto_el ? new Date(fila.visto_el).toISOString() : ahora.toUTC().toISO(),
    alerta_youtube_enviada: !!(fila && fila.alerta_youtube_enviada === true),
    youtube_id: '',
    nota: ''
  };

  if (!fila) {
    // Episodio que la tabla no conoce: solo es nuevo si salio hace pocos dias
    if (diasEp > cfg.dias_maximos_nuevo) { registrar({ ...base, estado: 'ya_existia', nota: 'Episodio viejo: no se avisa' }); continue; }
  } else if (fila.estado === 'esperando_youtube') {
    // sigue buscando el video
  } else if (fila.estado === 'preparando') {
    if (!fila.updatedAt || ahora.diff(fecha(fila.updatedAt), 'minutes').minutes < MINUTOS_REINTENTO) continue; // otra corrida lo esta preparando
    if (horasDesde(base.visto_el) >= cfg.horas_max_preparando) {
      alertar({ ...base, youtube_id: fila.youtube_id || '', estado: 'abandonado', nota: 'Fallo al preparar durante ' + cfg.horas_max_preparando + ' h' },
        'No pude preparar el aviso de: ' + ep.name,
        'Intenté preparar el mail de <b>' + esc(ep.name) + '</b> durante ' + cfg.horas_max_preparando + ' horas y falló siempre (te llegaron las alertas de error). ' +
        'Dejé de intentar para no llenarte de alertas.<br><br>Cuando lo arregles, si todavía querés mandarlo, cambiá el estado de esa fila a <b>esperando_youtube</b> en la tabla episodios_podcast.');
      continue;
    }
  } else {
    continue; // ya resuelto (enviado, rechazado, vencido, ya_existia, abandonado...) o esperando aprobacion
  }

  // Tope de antiguedad: nunca avisar un episodio viejo (por ejemplo despues de una caida larga)
  if (diasEp > cfg.dias_maximos_nuevo) {
    alertar({ ...base, estado: 'abandonado', nota: 'Se hizo viejo sin poder avisarse' },
      'No se avisó el episodio: ' + ep.name,
      'El episodio <b>' + esc(ep.name) + '</b> salió en Spotify el ' + ep.release_date + ' y pasaron más de ' + cfg.dias_maximos_nuevo +
      ' días sin poder mandar el aviso (no apareció el video de YouTube o hubo errores). No lo mando solo porque ya es viejo. Si querés avisarlo igual, hacelo a mano desde Brevo.');
    continue;
  }

  // Buscar el video: publicado a +-1 dia (hora Uruguay), no usado por OTRO episodio.
  // Si hay varios, gana el que mas se parece en palabras; despues el mas cercano en fecha; despues el mas viejo.
  const usados = new Set(filas.filter(f => f.episodio_id !== ep.id).map(f => f.youtube_id).filter(Boolean));
  const pEp = palabras((ep.name || '') + ' ' + (ep.description || ''));
  let candidatos = [];
  if (fechaEp) {
    candidatos = videos
      .filter(v => !usados.has(v.id))
      .map(v => {
        const dia = DateTime.fromISO(v.publicado).setZone(ZONA).startOf('day');
        return { ...v, dif: Math.abs(dia.diff(fechaEp, 'days').days), parecido: parecido(pEp, v.palabras) };
      })
      .filter(v => v.dif <= 1)
      .sort((a, b) => (b.parecido - a.parecido) || (a.dif - b.dif) || String(a.publicado).localeCompare(String(b.publicado)));
  }
  const video = candidatos[0] || null;

  if (video && !yaHayUnoPreparando) {
    yaHayUnoPreparando = true;
    salida.push({ json: {
      accion: 'preparar',
      fila: { ...base, estado: 'preparando', youtube_id: video.id },
      episodio: {
        id: ep.id,
        titulo: ep.name || '',
        fecha: ep.release_date || '',
        url_spotify: (ep.external_urls && ep.external_urls.spotify) || ('https://open.spotify.com/episode/' + ep.id),
        imagen_spotify: (ep.images && ep.images[0] && ep.images[0].url) || ''
      },
      video: { id: video.id, titulo: video.titulo, descripcion: video.descripcion, miniatura: video.miniatura, url: video.url },
      dudoso: candidatos.length > 1,
      otros_videos: candidatos.slice(1).map(v => v.titulo)
    } });
  } else if (video) {
    // Hay otro episodio preparandose en esta vuelta: este queda para la proxima
    if (!fila || fila.estado !== 'esperando_youtube') registrar({ ...base, estado: 'esperando_youtube', nota: 'En cola: se prepara en la proxima revision' });
  } else {
    const horas = horasDesde(base.visto_el);
    const avisar = horas >= cfg.horas_alerta_youtube && !base.alerta_youtube_enviada;
    const nueva = { ...base, estado: 'esperando_youtube', alerta_youtube_enviada: base.alerta_youtube_enviada || avisar, nota: 'Sin video de YouTube todavia' };
    if (avisar) {
      alertar(nueva, 'Falta el video de YouTube: ' + ep.name,
        'Flor publicó <b>' + esc(ep.name) + '</b> en Spotify (' + ep.release_date + ') y hace ' + Math.floor(horas) +
        ' horas que no encuentro el video en YouTube (busco uno publicado un día antes o después).<br><br>' +
        'Sigo revisando cada hora: cuando aparezca, preparo el mail solo. Ojo: si el video está privado o programado, no lo veo hasta que sea público. ' +
        'Si en ' + cfg.dias_maximos_nuevo + ' días no aparece, dejo de intentar y te aviso.');
    } else if (!fila || fila.estado !== 'esperando_youtube') {
      registrar(nueva);
    }
  }
}

// ---- C) Pulso: si hace mucho que no hay episodios nuevos, avisar UNA vez ----
const masNuevo = episodios.reduce((m, e) => (!m || String(e.release_date) > String(m.release_date)) ? e : m, null);
const diaNuevo = diaSpotify(masNuevo);
const diasSinNuevo = diaNuevo ? hoy.diff(diaNuevo, 'days').days : 999;
const pulso = porId['__pulso__'];
if (masNuevo && diasSinNuevo >= cfg.dias_pulso && !(pulso && pulso.nota === masNuevo.id)) {
  alertar({ episodio_id: '__pulso__', titulo: 'control: dias sin episodio nuevo', fecha_spotify: masNuevo.release_date || '',
      visto_el: ahora.toUTC().toISO(), estado: 'pulso', youtube_id: '', alerta_youtube_enviada: false, nota: masNuevo.id },
    'Hace ' + diasSinNuevo + ' días que no veo episodios nuevos del podcast',
    'El episodio más nuevo que me devuelve Spotify es <b>' + esc(masNuevo.name) + '</b> del ' + masNuevo.release_date + '.<br><br>' +
    'Si Flor publicó algo después, el flujo no lo está viendo y hay que revisarlo. Si no publicó, ignorá este correo (no lo repito hasta que haya un episodio nuevo).');
}

return salida;`
    }
  }
});

// ============ 5. Guardar el estado en la tabla (antes de hacer nada hacia afuera) ============
const guardar_estado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'guardar_estado',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TABLA,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'episodio_id', condition: 'eq', keyValue: expr('{{ $json.fila.episodio_id }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          episodio_id: expr('{{ $json.fila.episodio_id }}'),
          titulo: expr('{{ $json.fila.titulo }}'),
          fecha_spotify: expr('{{ $json.fila.fecha_spotify }}'),
          visto_el: expr('{{ $json.fila.visto_el }}'),
          estado: expr('{{ $json.fila.estado }}'),
          youtube_id: expr('{{ $json.fila.youtube_id }}'),
          alerta_youtube_enviada: expr('{{ $json.fila.alerta_youtube_enviada }}'),
          nota: expr('{{ $json.fila.nota }}')
        },
        matchingColumns: [],
        schema: [S_EPISODIO_ID, S_TITULO, S_FECHA, S_VISTO, S_ESTADO, S_YOUTUBE, S_ALERTA, S_NOTA]
      },
      options: {}
    }
  }
});

const que_hacer = switchCase({
  version: 3.2,
  config: {
    name: 'que_hacer',
    parameters: {
      rules: {
        values: [
          {
            renameOutput: true,
            outputKey: 'preparar',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr("{{ $('decidir').item.json.accion }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'preparar' }],
              combinator: 'and'
            }
          },
          {
            renameOutput: true,
            outputKey: 'alertar',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr("{{ $('decidir').item.json.accion }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'alertar' }],
              combinator: 'and'
            }
          }
        ]
      },
      options: {}
    }
  }
});

// ============ 6. Armar el mail (diseno Flor 2026-11-10: titulo Spotify, miniatura y descripcion simplificada de YouTube) ============
const armar_mail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'armar_mail',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `const d = $('decidir').item.json;
const ep = d.episodio;
const v = d.video;

// Escapa HTML y las llaves (Brevo usa llaves dobles para sus plantillas)
const esc = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/{/g, '&#123;').replace(/}/g, '&#125;');

// Paleta y letras (mismo estilo que los mails de Flor en Brevo)
const C = {
  fondo: '#efe6d2', tarjeta: '#fbf6ea', oliva: '#68692b', olivaOscuro: '#4a5115',
  crema: '#fdf3d6', linea: '#f6e7b8', texto: '#2a2119', suave: '#e9dfc6', divisor: '#cdbf9c'
};
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';

// Cuerpo = version SIMPLIFICADA de la descripcion de YouTube: solo lo que habla del episodio.
// Se van (sin IA, con reglas fijas): capitulos/minutos, hashtags, links, redes (@usuario cortos),
// titulos tipo "Capitulos"/"Seguinos", la firma del podcast y los "comentame / suscribite".
// Como Flor escribe primero de que trata el episodio y despues los extras, el texto se CORTA en el
// primer extra que aparece despues del contenido (lo de mas abajo suele ser promo, capitulos o redes).
const RED = /@[\\w.]+|\\b[\\w-]+\\.(com|net|org|ar|uy|mx|es)\\b/i;
const palabrasSinRedes = l => l.replace(/@[\\w.]+|\\S+\\.(com|net|org|ar|uy|mx|es)\\S*/gi, ' ')
  .replace(/\\b(ig|instagram|web|mi web|tiktok)\\b/gi, ' ')
  .split(/\\s+/).filter(w => /\\p{L}/u.test(w)).length;
const esExtra = l =>
  !/\\p{L}/u.test(l) ||                                                 // sin letras (solo emojis, guiones...)
  /https?:\\/\\/|www\\./i.test(l) ||                                      // links
  /^\\s*\\(?\\d{1,2}:\\d{2}(:\\d{2})?\\)?(\\s|$)/.test(l) ||                  // capitulos: 03:09 ...
  /^\\s*(cap[ií]tulos?|timestamps?|seguinos|seguime|segu[ií] a .*|links?|redes( sociales)?|mis redes)\\s*:?\\s*$/i.test(l) ||
  /^\\s*(🎧|📲|📍)/u.test(l) ||                                          // firmas y llamados con emoji
  /coment[aá]me|coment[aá] (de|abajo|ac[aá])|suscrib|dale like|campanita/i.test(l) ||
  (RED.test(l) && (/[:·]/.test(l) || palabrasSinRedes(l) <= 2)) ||     // "IG @florcorney", "Flor: @x · x.com"
  (/puertas y portales/i.test(l) && l.trim().split(/\\s+/).length <= 8); // "Esto es Puertas y portales podcast"

const lineas = [];
let empezo = false;
for (const original of String(v.descripcion || '').replace(/\\r/g, '').split('\\n')) {
  if (!original.trim()) { lineas.push(''); continue; }
  const l = original.replace(/(\\s*#[\\p{L}_][\\p{L}\\p{N}_]*)+\\s*$/u, '').trim();  // hashtags al final (#1 se respeta)
  if (!l || esExtra(l)) {
    if (empezo) break;      // primer extra despues del contenido: de aca para abajo no va
    continue;               // extras antes del contenido: se saltean
  }
  lineas.push(l);
  empezo = true;
}
const texto = lineas.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();

const parrafos = esc(texto)
  .split(/\\n{2,}/)
  .filter(p => p.trim())
  .map(p => '<p style="margin:0 0 18px;font-family:' + SANS + ';font-size:16px;line-height:26px;color:' + C.texto + ';">' +
    p.replace(/\\n/g, '<br>') + '</p>')
  .join('');

// Titulo del mail (y del asunto) = el titulo del episodio en Spotify. Si faltara, el del video.
// Si termina con algo entre parentesis, eso va abajo en cursiva (como el mail de referencia)
const titulo = String(ep.titulo || v.titulo || '').trim();
const partes = titulo.match(/^(.+?)\\s*(\\([^()]+\\))\\s*$/);
const tituloHtml = partes
  ? esc(partes[1]) + '<br><em style="font-family:' + SERIF + ';font-style:italic;">' + esc(partes[2]) + '</em>'
  : esc(titulo);

// Texto que se ve al lado del asunto en la bandeja: primera linea de la descripcion sin links
const primera = texto.split('\\n').find(l => l.trim() && !/https?:\\/\\//.test(l)) || titulo;
const preencabezado = esc(primera.trim().slice(0, 110));
const relleno = '&#847;&zwnj;&nbsp;'.repeat(60);

const foto = v.miniatura || ep.imagen_spotify;

const linea = ancho => '<td style="border-top:1px solid ' + C.linea + ';width:' + ancho + 'px;font-size:0;line-height:0;">&nbsp;</td>';

const boton = (url, texto, relleno) =>
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>' +
  '<td align="center" style="' + (relleno
    ? 'background:' + C.olivaOscuro + ';'
    : 'border:1.5px solid ' + C.olivaOscuro + ';') + 'border-radius:4px;">' +
  '<a href="' + esc(url) + '" target="_blank" style="display:block;padding:' + (relleno ? '16px' : '15px') +
  ' 10px;font-family:' + SANS + ';font-size:15px;font-weight:bold;text-decoration:none;color:' +
  (relleno ? C.crema : C.olivaOscuro) + ';">' + texto + ' &rarr;</a></td></tr></table>';

// La tarjeta del mail (va en la campana y, igual, en la vista previa del correo de aprobacion)
const tarjeta =
  '<table role="presentation" class="contenedor" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:600px;background:' + C.tarjeta + ';border-radius:18px;overflow:hidden;">' +

  // Encabezado oliva: "Puertas y Portales · Nuevo episodio" + titulo grande
  '<tr><td class="px" style="background:' + C.oliva + ';padding:40px 48px 36px;">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>' + linea(36) +
  '<td style="padding-left:12px;font-family:' + SANS + ';font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:' + C.crema + ';">Puertas y Portales &middot; Nuevo episodio</td>' +
  '</tr></table>' +
  '<h1 class="h1" style="margin:20px 0 0;font-family:' + SERIF + ';font-weight:normal;font-size:44px;line-height:46px;color:' + C.crema + ';">' + tituloHtml + '</h1>' +
  '</td></tr>' +

  // Miniatura (lleva a YouTube)
  (foto
    ? '<tr><td align="center" class="px" style="padding:36px 48px 20px;"><a href="' + esc(v.url) + '" target="_blank" style="text-decoration:none;">' +
      '<img src="' + esc(foto) + '" width="504" alt="' + esc(titulo) + '" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:14px;margin:0 auto;"></a></td></tr>'
    : '') +

  // Botones: YouTube (lleno) y Spotify (borde)
  '<tr><td class="px" style="padding:' + (foto ? '0' : '36px') + ' 48px 32px;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>' +
  '<td class="btn-mitad" width="50%" style="padding-right:6px;">' + boton(v.url, 'Ver en YouTube', true) + '</td>' +
  '<td class="btn-mitad" width="50%" style="padding-left:6px;">' + boton(ep.url_spotify, 'Escuchar en Spotify', false) + '</td>' +
  '</tr></table></td></tr>' +

  // Texto (descripcion de YouTube)
  (parrafos ? '<tr><td class="px" style="padding:0 48px 10px;">' + parrafos + '</td></tr>' : '') +

  // Divisor + firma
  '<tr><td class="px" style="padding:0 48px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>' +
  '<td style="border-top:1px solid ' + C.divisor + ';font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>' +
  '<tr><td align="center" class="px" style="padding:24px 48px 36px;">' +
  '<p style="margin:0;font-family:' + SERIF + ';font-style:italic;font-size:30px;line-height:34px;color:' + C.olivaOscuro + ';">Flor</p></td></tr>' +

  // Pie: darse de baja
  '<tr><td align="center" style="background:' + C.oliva + ';padding:20px 30px;font-family:' + SANS + ';font-size:12px;line-height:19px;color:' + C.suave + ';">' +
  '<a href="{{ unsubscribe }}" target="_blank" style="color:' + C.suave + ';text-decoration:underline;">Darme de baja</a></td></tr>' +
  '</table>';

const envoltorio = contenido =>
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:' + C.fondo + ';">' +
  '<tr><td align="center" style="padding:28px 12px;">' + contenido + '</td></tr></table>';

const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title>' +
  '<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">' +
  '<style>@media only screen and (max-width:620px) { ' +
  '.contenedor { width:100% !important; } ' +
  '.px { padding-left:24px !important; padding-right:24px !important; } ' +
  '.h1 { font-size:34px !important; line-height:38px !important; } ' +
  '.btn-mitad { display:block !important; width:100% !important; padding:0 0 10px 0 !important; } ' +
  '}</style></head>' +
  '<body style="margin:0;padding:0;background:' + C.fondo + ';">' +
  '<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:' + C.fondo + ';">' + preencabezado + relleno + '</div>' +
  envoltorio(tarjeta) +
  '</body></html>';

// Avisos para Flor en el correo de aprobacion (no van en el mail de la lista)
const aviso_dudoso = (d.dudoso
  ? '<p style="background:#fff4e5;border:1px solid #f0a020;padding:10px;border-radius:6px;"><b>Ojo:</b> había más de un video de YouTube posible ese día (' +
    d.otros_videos.map(esc).join(', ') + '). Fijate que el elegido sea el correcto antes de aprobar.</p>'
  : '') +
  (!parrafos
    ? '<p style="background:#fff4e5;border:1px solid #f0a020;padding:10px;border-radius:6px;"><b>Ojo:</b> la descripción de YouTube no tenía texto sobre el episodio (solo links, redes o hashtags), así que el mail va sin texto. Si querés agregarle uno, editá el borrador en Brevo antes de aprobar.</p>'
    : '');

return { json: {
  asunto: ('🎙️ Nuevo episodio - ' + titulo).replace(/[{}]/g, ''),
  nombre_campana: 'Podcast - ' + titulo + ' (' + ep.fecha + ')',
  html,
  vista_previa: envoltorio(tarjeta).replace('{{ unsubscribe }}', '#'),   // en el correo de aprobacion no aplica
  titulo_html: esc(ep.titulo),
  video_titulo_html: esc(v.titulo),
  aviso_dudoso
} };`
    }
  }
});

// ============ 7. Brevo: borrador de campana (SIN reintentos: no duplicar borradores) ============
const crear_campana = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'crear_campana',
    parameters: {
      method: 'POST',
      url: 'https://api.brevo.com/v3/emailCampaigns',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ name: $json.nombre_campana, subject: $json.asunto, sender: { id: $('configuracion').first().json.remitente_id }, htmlContent: $json.html, recipients: { listIds: [ $('configuracion').first().json.lista_id ] }, inlineImageActivation: false }) }}"),
      options: { timeout: 30000 }
    },
    credentials: CRED_BREVO
  }
});

// Solo avanza la corrida que tenia el episodio en 'preparando' (si otra lo tomo, esta para)
const marcar_esperando_aprobacion = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'marcar_esperando_aprobacion',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLA,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'episodio_id', condition: 'eq', keyValue: expr("{{ $('decidir').item.json.fila.episodio_id }}") },
        { keyName: 'estado', condition: 'eq', keyValue: 'preparando' }
      ] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          estado: 'esperando_aprobacion',
          campana_id: expr("{{ $('crear_campana').item.json.id }}"),
          nota: expr("Esperando aprobacion desde el {{ $now.setZone('America/Montevideo').toFormat('dd/MM HH:mm') }}")
        },
        matchingColumns: [],
        schema: [S_ESTADO, S_CAMPANA, S_NOTA]
      },
      options: {}
    }
  }
});

const verificar_dueno = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'verificar_dueno',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const filas = $input.all().filter(i => i.json && i.json.id);
const campana = $('crear_campana').first().json.id;
if (filas.length === 0) {
  throw new Error('Otra ejecucion ya habia tomado este episodio (la fila no estaba en preparando). No pido aprobacion para no duplicar. El borrador ' + campana + ' quedo sin usar en Brevo: se puede borrar.');
}
if (filas.length > 1) {
  throw new Error('Hay ' + filas.length + ' filas para el mismo episodio en episodios_podcast. Deja una sola. No pido aprobacion. Borrador ' + campana + ' sin usar en Brevo.');
}
return [filas[0]];`
    }
  }
});

// ============ 8. Aprobacion de Flor por correo ============
const pedir_aprobacion = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'pedir_aprobacion',
    ...REINTENTOS,
    parameters: {
      resource: 'message',
      operation: 'sendAndWait',
      sendTo: expr("{{ $('configuracion').first().json.correo_aprobacion }}"),
      subject: expr("¿Mando el aviso del episodio nuevo? {{ $('decidir').item.json.episodio.titulo }}"),
      message: expr("Hola Flor 👋<br><br>Salió un episodio nuevo del podcast: <b>{{ $('armar_mail').item.json.titulo_html }}</b><br>Video de YouTube que elegí: <a href=\"{{ $('decidir').item.json.video.url }}\">{{ $('armar_mail').item.json.video_titulo_html }}</a>{{ $('armar_mail').item.json.aviso_dudoso }}<br><br>Este es el mail que va a recibir la lista <b>{{ $('configuracion').first().json.lista_nombre }}</b>:<br><br>{{ $('armar_mail').item.json.vista_previa }}<br>• Si está todo bien, tocá <b>Aprobar y enviar</b> y sale a la lista.<br>• Si algo no te gusta, tocá <b>No enviar</b>: no se manda nada y el borrador queda guardado en Brevo para que lo edites.<br><br>Si no respondés en {{ Math.round($('configuracion').first().json.minutos_aprobacion / 60) }} horas, no se envía."),
      responseType: 'approval',
      approvalOptions: { values: { approvalType: 'double', approveLabel: 'Aprobar y enviar', buttonApprovalStyle: 'primary', disapproveLabel: 'No enviar', buttonDisapprovalStyle: 'secondary' } },
      options: {
        limitWaitTime: { values: { limitType: 'afterTimeInterval', resumeAmount: expr("{{ $('configuracion').first().json.minutos_aprobacion }}"), resumeUnit: 'minutes' } },
        appendAttribution: false
      }
    },
    credentials: CRED_GMAIL
  }
});

const aprobo = ifElse({
  version: 2.2,
  config: {
    name: 'aprobo',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.data && $json.data.approved === true }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

// ---- Aprobado: compare-and-set a 'enviando' y recien ahi se envia ----
const marcar_enviando = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'marcar_enviando',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLA,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'episodio_id', condition: 'eq', keyValue: expr("{{ $('decidir').item.json.fila.episodio_id }}") },
        { keyName: 'estado', condition: 'eq', keyValue: 'esperando_aprobacion' },
        { keyName: 'campana_id', condition: 'eq', keyValue: expr("{{ $('crear_campana').item.json.id }}") }
      ] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          estado: 'enviando',
          nota: expr("Aprobado el {{ $now.setZone('America/Montevideo').toFormat('dd/MM HH:mm') }}, enviando campana {{ $('crear_campana').item.json.id }}")
        },
        matchingColumns: [],
        schema: [S_ESTADO, S_NOTA]
      },
      options: {}
    }
  }
});

const puede_enviar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'puede_enviar',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const filas = $input.all().filter(i => i.json && i.json.id);
const campana = $('crear_campana').first().json.id;
if (filas.length !== 1) {
  throw new Error('NO se envio la campana ' + campana + ': el episodio ya no estaba esperando aprobacion con esta campana (posible doble aprobacion o se cambio la tabla). Revisar Brevo y la tabla episodios_podcast antes de hacer nada.');
}
return [filas[0]];`
    }
  }
});

// SIN reintentos. Si falla, se pregunta a Brevo como quedo la campana (no se reenvia nunca solo).
const enviar_campana = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'enviar_campana',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: expr("https://api.brevo.com/v3/emailCampaigns/{{ $('crear_campana').item.json.id }}/sendNow"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 60000 }
    },
    credentials: CRED_BREVO
  }
});

const verificar_campana = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'verificar_campana',
    ...REINTENTOS,
    parameters: {
      method: 'GET',
      url: expr("https://api.brevo.com/v3/emailCampaigns/{{ $('crear_campana').item.json.id }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: {}
    },
    credentials: CRED_BREVO
  }
});

const confirmar_estado = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'confirmar_estado',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const c = $input.first().json;
if (!['sent', 'in_process', 'queued'].includes(c.status)) {
  throw new Error('Brevo NO envio la campana ' + c.id + ' (estado: ' + c.status + '). No se reintento solo para no duplicar: revisala en Brevo. La fila quedo en enviando.');
}
return $input.all();`
    }
  }
});

const marcar_enviado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'marcar_enviado',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLA,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'episodio_id', condition: 'eq', keyValue: expr("{{ $('decidir').item.json.fila.episodio_id }}") }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          estado: 'enviado',
          nota: expr("Enviado el {{ $now.setZone('America/Montevideo').toFormat('dd/MM HH:mm') }} a {{ $('configuracion').first().json.lista_nombre }} (campana {{ $('crear_campana').item.json.id }})")
        },
        matchingColumns: [],
        schema: [S_ESTADO, S_NOTA]
      },
      options: {}
    }
  }
});

const confirmar_envio = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'confirmar_envio',
    ...REINTENTOS,
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: expr("{{ $('configuracion').first().json.correo_aprobacion }}"),
      subject: expr("Listo: salió el aviso de {{ $('decidir').item.json.episodio.titulo }}"),
      emailType: 'html',
      message: expr("El mail del episodio <b>{{ $('armar_mail').item.json.titulo_html }}</b> salió a la lista <b>{{ $('configuracion').first().json.lista_nombre }}</b>. ✅"),
      options: { appendAttribution: false }
    },
    credentials: CRED_GMAIL
  }
});

// ---- No aprobado (rechazo) o vencido: no se envia nada ----
const marcar_no_enviado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'marcar_no_enviado',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLA,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'episodio_id', condition: 'eq', keyValue: expr("{{ $('decidir').item.json.fila.episodio_id }}") }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          estado: expr("{{ $('pedir_aprobacion').item.json.data && $('pedir_aprobacion').item.json.data.approved === false ? 'rechazado' : 'vencido' }}"),
          nota: expr("{{ $('pedir_aprobacion').item.json.data && $('pedir_aprobacion').item.json.data.approved === false ? 'Flor eligio No enviar' : 'Paso el tiempo sin respuesta' }}. Borrador en Brevo: campana {{ $('crear_campana').item.json.id }}")
        },
        matchingColumns: [],
        schema: [S_ESTADO, S_NOTA]
      },
      options: {}
    }
  }
});

// Si fue rechazo: avisa al admin. Si vencio: avisa al admin Y a Flor (que no crea que salio).
const avisar_no_enviado = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'avisar_no_enviado',
    ...REINTENTOS,
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: expr("{{ $('pedir_aprobacion').item.json.data && $('pedir_aprobacion').item.json.data.approved === false ? $('configuracion').first().json.correo_admin : $('configuracion').first().json.correo_admin + ',' + $('configuracion').first().json.correo_aprobacion }}"),
      subject: expr("No se envió el aviso de {{ $('decidir').item.json.episodio.titulo }}"),
      emailType: 'html',
      message: expr("El aviso del episodio <b>{{ $('armar_mail').item.json.titulo_html }}</b> NO se envió. Motivo: {{ $('pedir_aprobacion').item.json.data && $('pedir_aprobacion').item.json.data.approved === false ? 'Flor eligió No enviar' : 'pasó el tiempo para aprobar sin respuesta (los botones del correo ya no funcionan)' }}.<br><br>El borrador quedó guardado en Brevo (campaña {{ $('crear_campana').item.json.id }}). Si querés mandarlo igual, se puede enviar desde Brevo a mano."),
      options: { appendAttribution: false }
    },
    credentials: CRED_GMAIL
  }
});

// ============ 9. Alertas al admin (falta YouTube, trabados, abandonados, pulso) ============
const alertar_admin = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'alertar_admin',
    ...REINTENTOS,
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: expr("{{ $('configuracion').first().json.correo_admin }}"),
      subject: expr("{{ $('decidir').item.json.alerta_asunto }}"),
      emailType: 'html',
      message: expr("{{ $('decidir').item.json.alerta_mensaje }}"),
      options: { appendAttribution: false }
    },
    credentials: CRED_GMAIL
  }
});

// ============ Armado ============
export default workflow('aviso-nuevo-episodio', 'aviso_nuevo_episodio')
  .add(cada_hora)
  .to(configuracion)
  .to(buscar_episodios_spotify)
  .to(buscar_videos_youtube)
  .to(leer_tabla)
  .to(decidir)
  .to(guardar_estado)
  .to(que_hacer
    .onCase(0, armar_mail
      .to(crear_campana)
      .to(marcar_esperando_aprobacion)
      .to(verificar_dueno)
      .to(pedir_aprobacion)
      .to(aprobo
        .onTrue(marcar_enviando
          .to(puede_enviar)
          .to(enviar_campana
            .to(marcar_enviado)
            .to(confirmar_envio)))
        .onFalse(marcar_no_enviado.to(avisar_no_enviado))))
    .onCase(1, alertar_admin))
  .add(enviar_campana.onError(verificar_campana.to(confirmar_estado).to(marcar_enviado)));
