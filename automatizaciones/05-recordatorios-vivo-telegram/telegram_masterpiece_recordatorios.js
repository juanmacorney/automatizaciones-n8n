// Fuente de telegram_masterpiece_recordatorios (n8n id ID_FLUJO_TELEGRAM). SINCRONIZADO con n8n; PUBLICADO 2026-11-11, modo real. Versión activa 8857eea9 (errores sin ':'; antes 99b71fa0).
// Destino: grupo con temas "Masterpiece" (-100XXXXXXXXXX), tema "Admin, links." (2). Prueba: grupo "prueba bot" (-XXXXXXXXXX).
// Workflow settings (no van en este codigo): timezone America/Montevideo, errorWorkflow ID_FLUJO_ERRORES (error_trigger).
// Hermano de mail_masterpiece_recordatorios: MISMAS guardas de fecha/hora y MISMA hoja de pausas.
// OJO: si cambias la logica de pausas o de horarios en uno, cambiala tambien en el otro (decidir esta copiado).
import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

// ---------- Disparadores (hora Uruguay) ----------
const martes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'martes_17hs',
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 17 * * 2' }] } },
    position: [0, 0]
  },
  output: [{}]
});

const miercoles = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'miercoles_10hs',
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 10 * * 3' }] } },
    position: [0, 240]
  },
  output: [{}]
});

const tipoMartes = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'tipo_dia_anterior',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: { assignments: [{ id: 't1', name: 'tipo', value: 'dia_anterior', type: 'string' }] },
      options: {}
    },
    position: [224, 0]
  },
  output: [{ tipo: 'dia_anterior' }]
});

const tipoMiercoles = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'tipo_una_hora_antes',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: { assignments: [{ id: 't2', name: 'tipo', value: 'una_hora_antes', type: 'string' }] },
      options: {}
    },
    position: [224, 240]
  },
  output: [{ tipo: 'una_hora_antes' }]
});

// ---------- Configuracion fija ----------
// modo_prueba = true: manda al grupo de prueba (chat_id_prueba), sin guardas de horario, con claves PRUEBA|.
// chat_id_real = grupo "Admin, links". Si esta vacio o mal, no se manda nada y llega la alerta.
const configuracion = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'configuracion',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'c1', name: 'chat_id_real', value: '-100XXXXXXXXXX', type: 'string' }, // grupo con temas "Masterpiece"
          { id: 'c2', name: 'chat_id_prueba', value: '-XXXXXXXXXX', type: 'string' }, // grupo "prueba bot" (solo el admin)
          // Tema (seccion) del grupo: "admin, links" dentro del grupo con temas "Masterpiece". En modo real es OBLIGATORIO.
          // Vacio en prueba = el grupo de prueba no tiene temas.
          { id: 'c7', name: 'tema_id_real', value: '2', type: 'string' }, // tema "Admin, links." (link t.me/c/4308820644/2/227)
          { id: 'c8', name: 'tema_id_prueba', value: '', type: 'string' },
          { id: 'c3', name: 'correo_alertas', value: 'correo@ejemplo.com', type: 'string' },
          { id: 'c4', name: 'zoom', value: 'https://zoom.us/j/ID_REUNION', type: 'string' },
          { id: 'c5', name: 'modo_prueba', value: false, type: 'boolean' },
          {
            id: 'c6',
            name: 'fecha_vivo',
            value: expr("{{ ($json.tipo === 'dia_anterior' ? $now.plus({ days: 1 }) : $now).toFormat('yyyy-MM-dd') }}"),
            type: 'string'
          }
        ]
      },
      options: {}
    },
    position: [448, 120]
  },
  output: [{ tipo: 'una_hora_antes', fecha_vivo: '2026-11-18', modo_prueba: true, chat_id_prueba: '-100123' }]
});

// ---------- Lecturas ----------
// Misma hoja de pausas que los mails: "Masterpiece - semanas sin vivo" (pestana pausas, columnas fecha y motivo).
const leerPausas = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'leer_pausas',
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      documentId: { __rl: true, mode: 'id', value: 'ID_HOJA_PAUSAS', cachedResultName: 'Masterpiece - semanas sin vivo' },
      sheetName: { __rl: true, mode: 'name', value: 'pausas' },
      options: { outputFormatting: { values: { general: 'UNFORMATTED_VALUE', date: 'SERIAL_NUMBER' } } }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets flor', 'ID_CRED_SHEETS') },
    position: [672, 120]
  },
  output: [{ row_number: 2, fecha: 46386, motivo: 'Feriado' }]
});

// Misma tabla que los mails (envios_masterpiece). Las claves de Telegram terminan en |telegram, asi no se mezclan.
const leerEnvios = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'leer_envios',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: 'ID_TABLA_ENVIOS' },
      matchType: 'allConditions',
      filters: {
        conditions: [
          { keyName: 'fecha_vivo', condition: 'eq', keyValue: expr("{{ $('configuracion').first().json.fecha_vivo }}") }
        ]
      },
      returnAll: true
    },
    position: [896, 120]
  },
  output: [{ clave: '2026-11-18|dia_anterior|telegram', estado: 'enviado' }]
});

// ---------- Decision (copiada de mail_masterpiece_recordatorios, adaptada a Telegram) ----------
const decidir = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'decidir',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const falla = m => new Error(String(m).replace(/([0-9]):([0-9])/g, '$1.$2').replace(/:/g, ' -')); // n8n corta el texto del error en cada ':' y la alerta llegaria incompleta
const cfg = $('configuracion').first().json;
const prueba = cfg.modo_prueba === true;
const tipo = cfg.tipo;
if (tipo !== 'dia_anterior' && tipo !== 'una_hora_antes') throw falla('Tipo de mensaje desconocido: ' + tipo);

// A donde va: el chat id sale de configuracion, nunca de otro lado
const chatId = String(prueba ? cfg.chat_id_prueba : cfg.chat_id_real).trim();
if (!/^-?[0-9]+$/.test(chatId)) throw falla('Falta el chat id ' + (prueba ? 'del grupo de PRUEBA' : 'del grupo "Admin, links"') + ' en el nodo configuracion (vale "' + chatId + '"). No mando nada.');

const ZONA = 'America/Montevideo';
const fecha = cfg.fecha_vivo;
const dia = DateTime.fromISO(fecha, { zone: ZONA });
if (!dia.isValid) throw falla('No pude calcular la fecha del vivo (' + fecha + ')');

// Guardas de fecha y hora: nunca avisar a destiempo (por ejemplo si n8n estuvo caido y el disparo llega tarde)
if (!prueba && dia.weekday !== 3) throw falla('El vivo caeria el ' + dia.toFormat('dd/MM/yyyy') + ' y no es miercoles. No mando nada: revisar el horario del disparador.');
const ahora = DateTime.now().setZone(ZONA);
const minutos = ahora.hour * 60 + ahora.minute;
const ventana = tipo === 'dia_anterior' ? [17 * 60, 19 * 60] : [10 * 60, 10 * 60 + 30];
if (!prueba && (minutos < ventana[0] || minutos > ventana[1])) throw falla('El Telegram ' + tipo + ' se disparo a las ' + ahora.toFormat('HH:mm') + ' (hora Uruguay), fuera de su horario. No mando nada para no avisar a destiempo.');

// Dias sin vivo: hoja de Google "Masterpiece - semanas sin vivo", pestana pausas (la carga la asistente).
// Se pone la FECHA EXACTA del vivo que no se hace (un miercoles): ese dia no sale ningun recordatorio.
const aFecha = v => {
  if (typeof v === 'number' && isFinite(v)) return DateTime.fromISO('1899-12-30', { zone: ZONA }).plus({ days: Math.floor(v) });
  const t = String(v).trim();
  let m = t.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})/);
  if (m) return DateTime.fromObject({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }, { zone: ZONA });
  m = t.match(/^([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{4})$/);
  if (m) return DateTime.fromObject({ year: Number(m[3]), month: Number(m[2]), day: Number(m[1]) }, { zone: ZONA });
  return null;
};
const pausas = $('leer_pausas').all().map(i => i.json).filter(f => f && f.fecha !== undefined && f.fecha !== null && String(f.fecha).trim() !== '');
const semanaVivo = dia.startOf('week').toISODate();
let pausa = null;
for (const f of pausas) {
  const d = aFecha(f.fecha);
  if (!d || !d.isValid) throw falla('En la hoja "Masterpiece - semanas sin vivo" (fila ' + f.row_number + ') hay una fecha que no entiendo: "' + f.fecha + '". Escribila como 30/12/2026. Por seguridad no mando nada hasta que se corrija.');
  if (d.toISODate() === fecha) { pausa = f; continue; }
  if (d.weekday !== 3 && d.startOf('week').toISODate() === semanaVivo) throw falla('En la hoja "Masterpiece - semanas sin vivo" (fila ' + f.row_number + ') esta cargado el ' + d.toFormat('dd/MM/yyyy') + ', que no es miercoles (los vivos son los miercoles). No se si querian pausar el vivo del ' + dia.toFormat('dd/MM/yyyy') + ', asi que por seguridad no mando nada. Corregir la fecha (poner la del miercoles) o borrar la fila.');
}

const envios = $('leer_envios').all().map(i => i.json).filter(f => f && f.clave);
const clave = (prueba ? 'PRUEBA|' : '') + fecha + '|' + tipo + '|telegram';
const previo = envios.find(e => e.clave === clave);

let accion = 'enviar';
let motivo = 'Todo en orden, se envia.';
if (pausa) {
  accion = 'pausado';
  motivo = 'Dia sin vivo' + (pausa.motivo ? ' (' + pausa.motivo + ')' : '') + ': no se manda nada.';
} else if (!prueba && previo && (previo.estado === 'enviado' || previo.estado === 'enviando')) {
  accion = 'ya_enviado';
  motivo = 'Este Telegram ya figura como ' + previo.estado + ': no se manda de nuevo.';
}

// El de 1 hora antes comprueba que el de ayer haya salido de verdad
let alerta_asunto = '';
let alerta_mensaje = '';
if (tipo === 'una_hora_antes' && !prueba && !pausa) {
  const ayer = envios.find(e => e.clave === fecha + '|dia_anterior|telegram');
  if (!ayer || ayer.estado !== 'enviado') {
    alerta_asunto = 'Ojo: el Telegram de ayer de Masterpiece no figura como enviado';
    alerta_mensaje = 'El recordatorio de Telegram del dia anterior (martes 17:00) para el vivo de hoy (' + fecha + ') <b>no figura como enviado</b> (' + (ayer ? 'estado: ' + ayer.estado : 'no hay registro en la tabla envios_masterpiece') + ').<br><br>Revisa el grupo "Admin, links" y la hoja de dias sin vivo. El mensaje de hoy (1 hora antes) sale igual.';
  }
}

return [{ json: {
  accion, motivo, tipo, fecha_vivo: fecha, clave, modo_prueba: prueba,
  chat_id: chatId, destino: prueba ? 'grupo de prueba' : 'Admin, links',
  alerta_asunto, alerta_mensaje
} }];`
    },
    position: [1120, 120]
  },
  output: [{ accion: 'enviar', tipo: 'una_hora_antes', fecha_vivo: '2026-11-18', clave: 'PRUEBA|2026-11-18|una_hora_antes|telegram', modo_prueba: true, chat_id: '-100123', destino: 'grupo de prueba', alerta_asunto: '', alerta_mensaje: '' }]
});

const hayAlerta = ifElse({
  version: 2.2,
  config: {
    name: 'hay_alerta',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { id: 'a1', leftValue: expr('{{ $json.alerta_asunto }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [1344, 0]
  }
});

const alertarEnvioFaltante = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'alertar_envio_faltante',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: expr("{{ $('configuracion').first().json.correo_alertas }}"),
      subject: expr("{{ $('decidir').first().json.alerta_asunto }}"),
      emailType: 'html',
      message: expr("{{ $('decidir').first().json.alerta_mensaje }}"),
      options: { appendAttribution: false }
    },
    credentials: { gmailOAuth2: newCredential('Gmail flor', 'ID_CRED_GMAIL') },
    position: [1568, 0]
  },
  output: [{ id: 'x' }]
});

const debeEnviar = ifElse({
  version: 2.2,
  config: {
    name: 'debe_enviar',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          { id: 'e1', leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'enviar' }
        ],
        combinator: 'and'
      },
      options: {}
    },
    position: [1344, 240]
  }
});

// ---------- Armar el mensaje (textos fijos del PDF) ----------
const armarMensaje = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'armar_mensaje',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const falla = m => new Error(String(m).replace(/([0-9]):([0-9])/g, '$1.$2').replace(/:/g, ' -')); // n8n corta el texto del error en cada ':' y la alerta llegaria incompleta
const d = $('decidir').first().json;
const cfg = $('configuracion').first().json;
const ZOOM = String(cfg.zoom || '').trim();
if (!/^https:[/][/]/.test(ZOOM)) throw falla('El link de Zoom en configuracion no es valido ("' + ZOOM + '"). No mando nada.');

// Tema (seccion) del grupo donde va el mensaje. En modo real es obligatorio: sin tema caeria en el general del grupo.
const tema = String((d.modo_prueba ? cfg.tema_id_prueba : cfg.tema_id_real) || '').trim();
if (!d.modo_prueba && !tema) throw falla('Falta el numero del tema "admin, links" (tema_id_real) en configuracion. Sin eso el mensaje caeria en el tema general del grupo. No mando nada.');
if (tema && !/^[0-9]+$/.test(tema)) throw falla('El numero de tema en configuracion no es valido ("' + tema + '"). No mando nada.');

// Textos fijos (PDF "Mensajes a automatizar - Masterpiece", seccion 4)
const TEXTOS = {
  dia_anterior: [
    '¡Hola, hermosas! 🌟',
    'Mañana miércoles a las 11:00 (hora Uruguay | Argentina) nos vemos en el vivo de Masterpiece con Flor 💛',
    'Les dejo el link de Zoom para que lo tengan a mano:',
    ZOOM,
    '¡Vengan con sus dudas y avances, las esperamos! 🫶'
  ],
  una_hora_antes: [
    '¡Buen día, artistassss! ☀️',
    'En una hora (11:00, hora Uruguay | Argentina) arrancamos el vivo de Masterpiece con Flor 💛',
    'Acá está el link de Zoom:',
    ZOOM,
    '¡Preparen el cafecito, las esperamos! 🫶'
  ]
};
const lineas = TEXTOS[d.tipo];
if (!lineas) throw falla('No tengo texto para el tipo de mensaje: ' + d.tipo);

// parse_mode HTML: se escapan los caracteres especiales por las dudas
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texto = lineas.map(esc).join(String.fromCharCode(10));
return [{ json: { texto, chat_id: d.chat_id, tema_id: tema } }];`
    },
    position: [1568, 240]
  },
  output: [{ texto: 'hola', chat_id: '-100123' }]
});

// ---------- Registrar, enviar, confirmar, registrar ----------
const registrarEnviando = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'registrar_enviando',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: 'ID_TABLA_ENVIOS' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          clave: expr("{{ $('decidir').first().json.clave }}"),
          tipo: expr("{{ $('decidir').first().json.tipo }}"),
          fecha_vivo: expr("{{ $('decidir').first().json.fecha_vivo }}"),
          estado: 'enviando',
          nota: expr("Telegram enviando a {{ $('decidir').first().json.destino }} desde {{ $now.toFormat('dd/MM HH:mm') }}")
        },
        matchingColumns: [],
        schema: [
          { id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'fecha_vivo', displayName: 'fecha_vivo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'nota', displayName: 'nota', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    },
    position: [1792, 240]
  },
  output: [{ id: 1 }]
});

const enviarTelegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'enviar_telegram',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("{{ $('armar_mensaje').first().json.chat_id }}"),
      text: expr("{{ $('armar_mensaje').first().json.texto }}"),
      additionalFields: {
        appendAttribution: false,
        parse_mode: 'HTML',
        // Solo se manda si hay tema; sin tema (grupo de prueba) queda vacio
        message_thread_id: expr("{{ $('armar_mensaje').first().json.tema_id ? Number($('armar_mensaje').first().json.tema_id) : undefined }}")
      }
    },
    credentials: { telegramApi: newCredential('Telegram flor', 'ID_CRED_TELEGRAM') },
    position: [2016, 240]
  },
  output: [{ ok: true, result: { message_id: 10, chat: { id: -100123 } } }]
});

const confirmarEnvio = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'confirmar_envio',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const falla = m => new Error(String(m).replace(/([0-9]):([0-9])/g, '$1.$2').replace(/:/g, ' -')); // n8n corta el texto del error en cada ':' y la alerta llegaria incompleta
const r = $input.first().json;
const d = $('decidir').first().json;
const msg = r && r.result;
if (!r || r.ok !== true || !msg || !msg.message_id) throw falla('Telegram no confirmo el envio al ' + d.destino + ' (respuesta: ' + JSON.stringify(r).slice(0, 300) + '). En la tabla envios_masterpiece quedo como enviando.');
if (String(msg.chat && msg.chat.id) !== String(d.chat_id)) throw falla('Telegram respondio con otro chat (' + (msg.chat && msg.chat.id) + ') y esperaba ' + d.chat_id + '. Revisar.');
const tema = $('armar_mensaje').first().json.tema_id;
if (tema && String(msg.message_thread_id) !== String(tema)) throw falla('El mensaje salio, pero NO en el tema esperado (' + tema + '): quedo en ' + (msg.message_thread_id || 'el tema general') + '. Revisar tema_id_real en configuracion.');
return [{ json: { message_id: msg.message_id, chat_id: msg.chat.id, chat_titulo: msg.chat.title || '' } }];`
    },
    position: [2240, 240]
  },
  output: [{ message_id: 10, chat_id: -100123, chat_titulo: 'x' }]
});

const registrarEnviado = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'registrar_enviado',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: 'ID_TABLA_ENVIOS' },
      matchType: 'allConditions',
      filters: {
        conditions: [
          { keyName: 'clave', condition: 'eq', keyValue: expr("{{ $('decidir').first().json.clave }}") }
        ]
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          estado: 'enviado',
          campana_id: expr("{{ $('confirmar_envio').first().json.message_id }}"),
          nota: expr("Telegram enviado el {{ $now.toFormat('dd/MM HH:mm') }} a {{ $('decidir').first().json.destino }} ({{ $('confirmar_envio').first().json.chat_titulo }}), mensaje id {{ $('confirmar_envio').first().json.message_id }} (va en campana_id)")
        },
        matchingColumns: [],
        schema: [
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'campana_id', displayName: 'campana_id', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'nota', displayName: 'nota', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    },
    position: [2464, 240]
  },
  output: [{ id: 1 }]
});

export default workflow('telegram-masterpiece-recordatorios', 'telegram_masterpiece_recordatorios')
  .add(martes).to(tipoMartes).to(configuracion)
  .add(miercoles).to(tipoMiercoles).to(configuracion)
  .add(configuracion).to(leerPausas).to(leerEnvios).to(decidir)
  .add(decidir).to(hayAlerta.onTrue(alertarEnvioFaltante))
  .add(decidir).to(
    debeEnviar.onTrue(
      armarMensaje.to(registrarEnviando).to(enviarTelegram).to(confirmarEnvio).to(registrarEnviado)
    )
  );
