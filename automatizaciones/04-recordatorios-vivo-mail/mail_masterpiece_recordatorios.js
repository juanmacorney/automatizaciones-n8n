// Fuente de mail_masterpiece_recordatorios (n8n id ID_FLUJO_MAIL). Sincronizado con n8n el 2026-11-11. Versión activa c7139e1a (errores sin ':'; antes 084d9686).
// Workflow settings (no van en este codigo): timezone America/Montevideo, errorWorkflow ID_FLUJO_ERRORES (error_trigger).
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
// modo_prueba = true manda todo por el camino real pero a la lista de prueba (lista_id_prueba) y con claves PRUEBA|.
// OJO: la lista de prueba 38 se borro de Brevo el 2026-11-11. Para volver a probar hay que crear una lista nueva y poner su id/nombre aca.
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
          { id: 'c1', name: 'lista_id_real', value: 37, type: 'number' },
          { id: 'c2', name: 'lista_nombre_real', value: 'Masterpiece', type: 'string' },
          { id: 'c3', name: 'lista_id_prueba', value: 38, type: 'number' },
          { id: 'c4', name: 'lista_nombre_prueba', value: 'tmp_prueba_masterpiece', type: 'string' },
          { id: 'c5', name: 'remitente_id', value: 1, type: 'number' },
          { id: 'c7', name: 'correo_alertas', value: 'correo@ejemplo.com', type: 'string' },
          { id: 'c8', name: 'zoom', value: 'https://zoom.us/j/ID_REUNION', type: 'string' },
          { id: 'c9', name: 'modo_prueba', value: false, type: 'boolean' },
          {
            id: 'c10',
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
  output: [{ tipo: 'una_hora_antes', fecha_vivo: '2026-11-18', modo_prueba: false }]
});

// ---------- Lecturas ----------
// Semanas sin vivo: hoja de Google "Masterpiece - semanas sin vivo" (pestana pausas, columnas fecha y motivo), compartible con la asistente.
// Las fechas llegan como numero de serie de Google (UNFORMATTED_VALUE + SERIAL_NUMBER).
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
  output: [{ clave: '2026-11-18|dia_anterior', estado: 'enviado' }]
});

// ---------- Decision ----------
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
if (tipo !== 'dia_anterior' && tipo !== 'una_hora_antes') throw falla('Tipo de mail desconocido: ' + tipo);
const ZONA = 'America/Montevideo';
const fecha = cfg.fecha_vivo;
const dia = DateTime.fromISO(fecha, { zone: ZONA });
if (!dia.isValid) throw falla('No pude calcular la fecha del vivo (' + fecha + ')');

// Guardas de fecha y hora: nunca avisar a destiempo (por ejemplo si n8n estuvo caido y el disparo llega tarde)
if (!prueba && dia.weekday !== 3) throw falla('El vivo caeria el ' + dia.toFormat('dd/MM/yyyy') + ' y no es miercoles. No mando nada: revisar el horario del disparador.');
const ahora = DateTime.now().setZone(ZONA);
const minutos = ahora.hour * 60 + ahora.minute;
const ventana = tipo === 'dia_anterior' ? [17 * 60, 19 * 60] : [10 * 60, 10 * 60 + 30];
if (!prueba && (minutos < ventana[0] || minutos > ventana[1])) throw falla('El mail ' + tipo + ' se disparo a las ' + ahora.toFormat('HH:mm') + ' (hora Uruguay), fuera de su horario. No mando nada para no avisar a destiempo.');

// Dias sin vivo: hoja de Google "Masterpiece - semanas sin vivo", pestana pausas (la carga la asistente).
// Se pone la FECHA EXACTA del vivo que no se hace (un miercoles): ese dia no sale ningun recordatorio.
// Google entrega las fechas como numero de serie; tambien se aceptan textos 2026-12-30 y 30/12/2026.
// Si una fecha no se entiende, o si en la semana de este vivo hay cargado un dia que no es miercoles
// (probable error de carga), se frena (no se manda nada) y llega la alerta.
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
// En modo prueba la clave lleva el prefijo PRUEBA| para no mezclarse con los envios reales
const clave = (prueba ? 'PRUEBA|' : '') + fecha + '|' + tipo;
const previo = envios.find(e => e.clave === clave);

let accion = 'enviar';
let motivo = 'Todo en orden, se envia.';
if (pausa) {
  accion = 'pausado';
  motivo = 'Dia sin vivo' + (pausa.motivo ? ' (' + pausa.motivo + ')' : '') + ': no se manda nada.';
} else if (!prueba && previo && (previo.estado === 'enviado' || previo.estado === 'enviando')) {
  accion = 'ya_enviado';
  motivo = 'Este mail ya figura como ' + previo.estado + ' (campana ' + previo.campana_id + '): no se manda de nuevo.';
}

// El mail de 1 hora antes comprueba que el de ayer haya salido de verdad
let alerta_asunto = '';
let alerta_mensaje = '';
if (tipo === 'una_hora_antes' && !prueba && !pausa) {
  const ayer = envios.find(e => e.clave === fecha + '|dia_anterior');
  if (!ayer || ayer.estado !== 'enviado') {
    alerta_asunto = 'Ojo: el mail de ayer de Masterpiece no figura como enviado';
    alerta_mensaje = 'El recordatorio del dia anterior (martes 17:00) para el vivo de hoy (' + fecha + ') <b>no figura como enviado</b> (' + (ayer ? 'estado: ' + ayer.estado : 'no hay registro en la tabla envios_masterpiece') + ').<br><br>Revisa las campanas en Brevo y la hoja de dias sin vivo. El mail de hoy (1 hora antes) sale igual.';
  }
}

// En modo prueba todo corre igual que en real, pero hacia la lista de prueba (solo el admin)
return [{ json: {
  accion, motivo, tipo, fecha_vivo: fecha, clave, modo_prueba: prueba,
  lista_id: prueba ? cfg.lista_id_prueba : cfg.lista_id_real,
  lista_nombre: prueba ? cfg.lista_nombre_prueba : cfg.lista_nombre_real,
  alerta_asunto, alerta_mensaje
} }];`
    },
    position: [1120, 120]
  },
  output: [{ accion: 'enviar', tipo: 'una_hora_antes', fecha_vivo: '2026-11-18', modo_prueba: false, lista_id: 37, lista_nombre: 'Masterpiece', alerta_asunto: '', alerta_mensaje: '' }]
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

// ---------- Validar lista y armar el mail ----------
const leerLista = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'leer_lista_brevo',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      method: 'GET',
      url: expr("https://api.brevo.com/v3/contacts/lists/{{ $('decidir').first().json.lista_id }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: {}
    },
    credentials: { httpHeaderAuth: newCredential('brevo', 'ID_CRED_BREVO') },
    position: [1568, 240]
  },
  output: [{ id: 37, name: 'Masterpiece', uniqueSubscribers: 4, totalBlacklisted: 0 }]
});

const validarLista = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'validar_lista',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const falla = m => new Error(String(m).replace(/([0-9]):([0-9])/g, '$1.$2').replace(/:/g, ' -')); // n8n corta el texto del error en cada ':' y la alerta llegaria incompleta
const d = $('decidir').first().json;
const l = $input.first().json;
if (!l || Number(l.id) !== Number(d.lista_id)) throw falla('Brevo no devolvio la lista ' + d.lista_id + '. No mando nada.');
if (l.name !== d.lista_nombre) throw falla('La lista ' + d.lista_id + ' en Brevo se llama "' + l.name + '" y esperaba "' + d.lista_nombre + '". No mando nada.');
const bloqueados = Number(l.totalBlacklisted || 0);
const activos = Number(l.uniqueSubscribers) - bloqueados;
if (!(activos >= 1)) throw falla('La lista "' + l.name + '" no tiene contactos activos en Brevo (' + l.uniqueSubscribers + ' en total, ' + bloqueados + ' bloqueados). No mando nada.');
return [{ json: { lista_id: l.id, lista_nombre: l.name, suscriptores: l.uniqueSubscribers, bloqueados, activos } }];`
    },
    position: [1792, 240]
  },
  output: [{ lista_id: 37, lista_nombre: 'Masterpiece', suscriptores: 4, bloqueados: 0, activos: 4 }]
});

const armarMail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'armar_mail',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const falla = m => new Error(String(m).replace(/([0-9]):([0-9])/g, '$1.$2').replace(/:/g, ' -')); // n8n corta el texto del error en cada ':' y la alerta llegaria incompleta
const d = $('decidir').first().json;
const cfg = $('configuracion').first().json;
const ZOOM = cfg.zoom;
const LOGO = 'https://img.mailinblue.com/8953507/images/content_library/original/6acd2b0ca728cf3ad85f5d5a.jpeg';
const SANS = 'Arial, Helvetica, sans-serif';
const SERIF = "Georgia, 'Times New Roman', serif";

// Textos fijos de cada mail
const TEXTOS = {
  dia_anterior: {
    nombre: 'Recordatorio dia anterior',
    asunto: '¡Nos vemos mañana! ✨ Vivo de Masterpiece',
    vista: 'Mañana a las 11:00 nos vemos en el Zoom de siempre',
    sobre: 'Recordatorio de vivo',
    titulo: '¡Nos vemos mañana!',
    saludo: 'Holaaa artistass 🙌',
    cuerpo: 'Mañana tenemos el vivo de Masterpiece con Flor. Traé tus dudas, avances y todo lo que quieras trabajar. Si no llegás a conectarte, la grabación queda subida en Circle.',
    cierre: '¡Nos vemos mañana! ✨',
    caja: 'Mañana · 11 AM'
  },
  una_hora_antes: {
    nombre: 'Recordatorio 1 hora antes',
    asunto: '¡Nos vemos en una hora! ✨ Vivo de Masterpiece',
    vista: 'Hoy a las 11:00 en el Zoom de siempre',
    sobre: 'Vivo de hoy',
    titulo: '¡Hooooy nos vemos!',
    saludo: 'Holaaa hermosasss 🙌',
    cuerpo: 'En una hora arrancamos el vivo de Masterpiece con Flor. Traé tus dudas, avances y todo lo que quieras trabajar. Si no llegás a conectarte, la grabación queda subida en Circle.',
    cierre: '¡Nos vemos en una hora! ✨',
    caja: 'Hoy · 11 AM'
  }
};
const T = TEXTOS[d.tipo];
if (!T) throw falla('No tengo texto para el tipo de mail: ' + d.tipo);

// Horas de otros paises: se calculan con la fecha real del vivo (11:00 hora Uruguay), asi los cambios de horario (verano/invierno) salen solos
const vivo = DateTime.fromISO(d.fecha_vivo + 'T11:00:00', { zone: 'America/Montevideo' });
if (!vivo.isValid) throw falla('No pude calcular la hora del vivo para la fecha ' + d.fecha_vivo);
const hora = zona => {
  const h = vivo.setZone(zona);
  if (!h.isValid) throw falla('No pude calcular la hora para ' + zona);
  return h.setLocale('en').toFormat('h:mm a');
};

const estiloP = 'font-family:' + SANS + '; font-size:16px; line-height:26px; color:#4A3A2C;';
const tabla =
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FBF7F0; border:1px solid #E6D8C3;">' +
  '<tr><td style="padding:0;"><img src="' + LOGO + '" alt="Masterpiece – Tu obra maestra" width="600" style="display:block; width:100%; height:auto; border:0;"></td></tr>' +
  '<tr><td align="center" style="padding:36px 40px 0 40px;"><p style="margin:0; font-family:' + SANS + '; font-size:12px; letter-spacing:3px; text-transform:uppercase; color:#A0612B;">' + T.sobre + '</p></td></tr>' +
  '<tr><td align="center" style="padding:12px 40px 0 40px;"><h1 style="margin:0; font-family:' + SERIF + '; font-size:30px; line-height:38px; font-weight:normal; color:#6B3410;">' + T.titulo + '</h1></td></tr>' +
  '<tr><td align="center" style="padding:20px 0 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="60" style="border-top:1px solid #C9A47E; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:24px 48px 0 48px;">' +
  '<p style="margin:0 0 16px 0; ' + estiloP + '">' + T.saludo + '</p>' +
  '<p style="margin:0 0 16px 0; ' + estiloP + '">' + T.cuerpo + '</p>' +
  '<p style="margin:0; ' + estiloP + '">' + T.cierre + '</p></td></tr>' +
  '<tr><td align="center" style="padding:28px 48px 0 48px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1E6D4; border-radius:6px;"><tr><td align="center" style="padding:20px;">' +
  '<p style="margin:0; font-family:' + SERIF + '; font-size:20px; line-height:28px; color:#6B3410;">' + T.caja + '</p>' +
  '<p style="margin:4px 0 0 0; font-family:' + SANS + '; font-size:13px; line-height:20px; color:#8A6A4E;">Hora Uruguay | Argentina</p></td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:20px 48px 0 48px;"><p style="margin:0; font-family:' + SANS + '; font-size:14px; line-height:25px; color:#4A3A2C;">' +
  '🇨🇱 Chile: <strong>' + hora('America/Santiago') + '</strong> &nbsp;·&nbsp; 🇨🇴 Colombia: <strong>' + hora('America/Bogota') + '</strong><br>' +
  '🇲🇽 México: <strong>' + hora('America/Mexico_City') + '</strong> &nbsp;·&nbsp; 🇪🇸 Barcelona: <strong>' + hora('Europe/Madrid') + '</strong></p></td></tr>' +
  '<tr><td align="center" style="padding:28px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#7A3E12" style="border-radius:4px;"><a href="' + ZOOM + '" target="_blank" style="display:inline-block; padding:15px 36px; font-family:' + SANS + '; font-size:15px; font-weight:bold; letter-spacing:1px; color:#FBF7F0; text-decoration:none; border-radius:4px;">ENTRAR AL ZOOM</a></td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:14px 48px 0 48px;"><p style="margin:0; font-family:' + SANS + '; font-size:13px; line-height:20px; color:#8A6A4E;">O copiá este link:<br><a href="' + ZOOM + '" target="_blank" style="color:#7A3E12; text-decoration:underline;">' + ZOOM + '</a></p></td></tr>' +
  '<tr><td align="center" style="padding:36px 48px 40px 48px;"><p style="margin:0; font-family:' + SERIF + '; font-size:18px; line-height:24px; color:#6B3410;">Dani ✨</p><p style="margin:4px 0 0 0; font-family:' + SANS + '; font-size:13px; line-height:20px; color:#8A6A4E;">Equipo Flor Corney</p></td></tr>' +
  '</table>';

// Brevo exige un link de baja en las campanas enviadas por API
const baja = '<p style="margin:16px 0 0 0; text-align:center; font-family:' + SANS + '; font-size:12px; line-height:18px; color:#8A6A4E;"><a href="{{ unsubscribe }}" target="_blank" style="color:#8A6A4E; text-decoration:underline;">Darme de baja</a></p>';

const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + T.asunto + '</title></head>' +
  '<body style="margin:0; padding:24px 12px; background-color:#ffffff;"><div style="max-width:600px; margin:0 auto;">' + tabla + baja + '</div></body></html>';

const nombre = 'Masterpiece - ' + T.nombre + ' (' + d.fecha_vivo + ')' + (d.modo_prueba ? ' [prueba]' : '');

// footer vacio: reemplaza el pie por defecto de Brevo (donde sale "Sent with Brevo"). Confirmado por el admin que ya no sale.
return [{ json: { cuerpo: {
  name: nombre,
  subject: T.asunto,
  previewText: T.vista,
  sender: { id: cfg.remitente_id },
  htmlContent: html,
  footer: '<div style="font-size:1px; line-height:1px;">&nbsp;</div>',
  recipients: { listIds: [d.lista_id] },
  inlineImageActivation: false
} } }];`
    },
    position: [2016, 240]
  },
  output: [{ cuerpo: { name: 'x', subject: 'x', htmlContent: '<p>x</p>' } }]
});

// ---------- Enviar: registrar, enviar, comprobar, registrar ----------
const crearCampana = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'crear_campana',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      method: 'POST',
      url: 'https://api.brevo.com/v3/emailCampaigns',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.cuerpo) }}'),
      options: { timeout: 30000 }
    },
    credentials: { httpHeaderAuth: newCredential('brevo', 'ID_CRED_BREVO') },
    position: [2240, 240]
  },
  output: [{ id: 40 }]
});

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
          campana_id: expr("{{ $('crear_campana').first().json.id }}"),
          nota: expr("Enviando a {{ $('decidir').first().json.lista_nombre }} desde {{ $now.toFormat('dd/MM HH:mm') }}")
        },
        matchingColumns: [],
        schema: [
          { id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'fecha_vivo', displayName: 'fecha_vivo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'campana_id', displayName: 'campana_id', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'nota', displayName: 'nota', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    },
    position: [2688, 384]
  },
  output: [{ id: 1 }]
});

const enviarCampana = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'enviar_campana',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr("https://api.brevo.com/v3/emailCampaigns/{{ $('crear_campana').first().json.id }}/sendNow"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 60000 }
    },
    credentials: { httpHeaderAuth: newCredential('brevo', 'ID_CRED_BREVO') },
    position: [2912, 384]
  },
  output: [{}]
});

const esperarBrevo = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'esperar_brevo',
    parameters: { resume: 'timeInterval', amount: 5, unit: 'seconds' },
    position: [3136, 384]
  },
  output: [{}]
});

const verificarCampana = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'verificar_campana',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      method: 'GET',
      url: expr("https://api.brevo.com/v3/emailCampaigns/{{ $('crear_campana').first().json.id }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: {}
    },
    credentials: { httpHeaderAuth: newCredential('brevo', 'ID_CRED_BREVO') },
    position: [3360, 384]
  },
  output: [{ id: 40, status: 'queued' }]
});

const confirmarEstado = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'confirmar_estado',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const falla = m => new Error(String(m).replace(/([0-9]):([0-9])/g, '$1.$2').replace(/:/g, ' -')); // n8n corta el texto del error en cada ':' y la alerta llegaria incompleta
const c = $input.first().json;
const buenos = ['sent', 'archive', 'queued', 'in_process', 'inProcess'];
if (!buenos.includes(c.status)) throw falla('Brevo NO envio la campana ' + c.id + ' (estado: ' + c.status + '). No se reintento solo para no mandar dos veces: revisarla en Brevo. En la tabla envios_masterpiece quedo como enviando.');
return $input.all();`
    },
    position: [3584, 384]
  },
  output: [{ id: 40, status: 'queued' }]
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
          nota: expr("Enviado el {{ $now.toFormat('dd/MM HH:mm') }} a {{ $('decidir').first().json.lista_nombre }} (campana {{ $('crear_campana').first().json.id }}, estado Brevo: {{ $('confirmar_estado').first().json.status }})")
        },
        matchingColumns: [],
        schema: [
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'nota', displayName: 'nota', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    },
    position: [3808, 384]
  },
  output: [{ id: 1 }]
});

export default workflow('mail-masterpiece-recordatorios', 'mail_masterpiece_recordatorios')
  .add(martes).to(tipoMartes).to(configuracion)
  .add(miercoles).to(tipoMiercoles).to(configuracion)
  .add(configuracion).to(leerPausas).to(leerEnvios).to(decidir)
  .add(decidir).to(hayAlerta.onTrue(alertarEnvioFaltante))
  .add(decidir).to(
    debeEnviar.onTrue(
      leerLista.to(validarLista).to(armarMail).to(crearCampana)
        .to(registrarEnviando).to(enviarCampana).to(esperarBrevo).to(verificarCampana).to(confirmarEstado).to(registrarEnviado)
    )
  );
