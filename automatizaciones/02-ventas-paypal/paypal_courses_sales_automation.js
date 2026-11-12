// paypal_courses_sales_automation v1 (2026-11-10) - copia de stripe_courses_sales_automation pero con PayPal.
// AJUSTES DEL FLUJO (se ponen aparte en n8n, el SDK no los guarda aca):
//   errorWorkflow = ID_FLUJO_ERRORES (error_trigger) · timezone = America/Montevideo · executionOrder = v1
//
// Camino real: PayPal avisa "pago completado" (PAYMENT.CAPTURE.COMPLETED, firma verificada por el nodo)
//   → se relee el pago en PayPal (fuente de verdad) → se lee la orden (nombre, email, producto)
//   → anti-duplicado en la tabla pagos_paypal → Brevo / bienvenida / vivos segun el curso + finanzas.
// Camino de prueba: prueba_manual → datos_prueba (un pago REAL de PayPal + email del admin).
//   En modo prueba: Brevo va a la lista 36 (PRUEBA), el email va al admin, las filas dicen PRUEBA.
// Pagos de "enviar dinero" (persona a persona) NO disparan este aviso: se cargan a mano.
import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// ============ IDs fijos (no son secretos) ============
const CRED_PAYPAL_TRIGGER = { payPalApi: { id: 'ID_CRED_PAYPAL', name: 'PayPal flor' } };
const CRED_PAYPAL_API = { oAuth2Api: { id: 'ID_CRED_PAYPAL_API', name: 'PayPal flor api' } };
const CRED_BREVO = { httpHeaderAuth: { id: 'ID_CRED_BREVO', name: 'brevo' } };
const CRED_GMAIL = { gmailOAuth2: { id: 'ID_CRED_GMAIL', name: 'Gmail flor' } };
const CRED_SHEETS = { googleSheetsOAuth2Api: { id: 'ID_CRED_SHEETS', name: 'Google Sheets flor' } };
const TABLA = { __rl: true, mode: 'id', value: 'ID_TABLA_PAGOS_PAYPAL' };
// Lista de PRUEBA de Brevo = 36 (en modo prueba todo va ahi). Alertas al admin.
const CORREO_ALERTAS = 'correo@ejemplo.com';
const REINTENTOS = { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 };

// Columnas (el SDK no acepta funciones auxiliares: van escritas una por una)
const C_PAGO = { id: 'pago_id', displayName: 'pago_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const C_CURSO = { id: 'curso', displayName: 'curso', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const C_FECHA = { id: 'fecha', displayName: 'fecha', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const C_PRUEBA = { id: 'es_prueba', displayName: 'es_prueba', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true };
const F_FECHA = { id: 'Fecha', displayName: 'Fecha', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_CLIENTA = { id: 'Clienta / Marca', displayName: 'Clienta / Marca', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_CATEGORIA = { id: 'Categoría', displayName: 'Categoría', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_PRODUCTO = { id: 'Producto o detalle', displayName: 'Producto o detalle', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_MONEDA = { id: 'Moneda', displayName: 'Moneda', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_IMPORTE = { id: 'Importe cobrado', displayName: 'Importe cobrado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_MEDIO = { id: 'Medio de cobro', displayName: 'Medio de cobro', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const F_NOTAS = { id: 'Notas', displayName: 'Notas', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const V_FECHA = { id: 'Fecha inscripción', displayName: 'Fecha inscripción', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const V_NOMBRE = { id: 'Nombre', displayName: 'Nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const V_MAIL = { id: 'Mail', displayName: 'Mail', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };
const V_VIVOS = { id: 'Vivos restantes', displayName: 'Vivos restantes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true };

// ============ 1. Disparos ============
const pago_paypal = trigger({
  type: 'n8n-nodes-base.payPalTrigger',
  version: 1,
  config: {
    name: 'pago_paypal',
    parameters: { events: ['PAYMENT.CAPTURE.COMPLETED'] },
    credentials: CRED_PAYPAL_TRIGGER
  }
});

const id_desde_paypal = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'id_desde_paypal',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [
        { id: 'p1', name: 'pago_id', value: expr('{{ $json.resource.id }}'), type: 'string' },
        { id: 'p2', name: 'es_prueba', value: false, type: 'boolean' }
      ] },
      options: {}
    }
  }
});

const prueba_manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'prueba_manual' } });

// Para probar: un pago REAL ya cobrado (solo se lee) + el email del admin.
// curso_prueba vacio = usa el producto real del pago; con texto = simula ese curso.
const datos_prueba = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'datos_prueba',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [
        { id: 't1', name: 'pago_id', value: 'ID_PAGO_PAYPAL_EJEMPLO', type: 'string' },
        { id: 't2', name: 'es_prueba', value: true, type: 'boolean' },
        { id: 't3', name: 'email_prueba', value: CORREO_ALERTAS, type: 'string' },
        { id: 't4', name: 'curso_prueba', value: '', type: 'string' }
      ] },
      options: {}
    }
  }
});

// ============ 2. Leer el pago en PayPal (fuente de verdad) ============
const leer_captura = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'leer_captura',
    ...REINTENTOS,
    parameters: {
      method: 'GET',
      url: expr('https://api-m.paypal.com/v2/payments/captures/{{ $json.pago_id }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'oAuth2Api',
      options: {}
    },
    credentials: CRED_PAYPAL_API
  }
});

const validar_captura = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'validar_captura',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const cap = $input.first().json;
if (!cap || !cap.id) throw new Error('PayPal no devolvio el pago (respuesta vacia).');
if (cap.status !== 'COMPLETED') throw new Error('El pago ' + cap.id + ' de PayPal no esta COMPLETED (esta ' + cap.status + '). No se proceso: revisarlo a mano en PayPal.');
const orden = cap.supplementary_data && cap.supplementary_data.related_ids && cap.supplementary_data.related_ids.order_id;
if (!orden) throw new Error('El pago ' + cap.id + ' de PayPal no tiene orden asociada (no vino de un boton o link de pago). No se agrego a listas ni a finanzas: cargarlo a mano.');
return [{ json: { ...cap, order_id: orden } }];`
    }
  }
});

const leer_orden = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'leer_orden',
    ...REINTENTOS,
    parameters: {
      method: 'GET',
      url: expr('https://api-m.paypal.com/v2/checkout/orders/{{ $json.order_id }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'oAuth2Api',
      options: {}
    },
    credentials: CRED_PAYPAL_API
  }
});

// ============ 3. Preparar los datos (todo determinista) ============
const preparar_datos = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'preparar_datos',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const ZONA = 'America/Montevideo';
const prueba = $('datos_prueba').isExecuted ? $('datos_prueba').first().json : null;
const cap = $('validar_captura').first().json;
const ord = $input.first().json;
const pu = (ord.purchase_units || [])[0] || {};
const payer = ord.payer || {};
const src = (ord.payment_source && ord.payment_source.paypal) || {};
const nombreDe = n => n ? [n.given_name, n.surname].filter(Boolean).join(' ').trim() : '';

let name = nombreDe(payer.name) || nombreDe(src.name) || (pu.shipping && pu.shipping.name && pu.shipping.name.full_name) || '';
let email = String(payer.email_address || src.email_address || '').trim().toLowerCase();
const items = (pu.items || []).map(i => i && i.name).filter(Boolean);
let producto = items.length ? items.join(' + ') : String(pu.description || '');

if (prueba) {
  email = prueba.email_prueba;
  name = 'PRUEBA ' + (name || 'sin nombre');
  if (prueba.curso_prueba) producto = prueba.curso_prueba;
}
if (!email) throw new Error('El pago ' + cap.id + ' de PayPal no trae email de la compradora. Revisarlo a mano en PayPal.');
if (!name) name = email;

// Sin tildes y en minusculas: "Método Imán" y "metodo iman" son lo mismo
const curso = producto.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
const fecha = DateTime.fromISO(cap.create_time, { zone: 'utc' }).setZone(ZONA).toFormat('yyyy-MM-dd');
const precio = Number(cap.amount && cap.amount.value);
const moneda = String((cap.amount && cap.amount.currency_code) || '').toUpperCase();
const pago_id = prueba ? cap.id + '-prueba-' + (curso || 'sin-curso') : cap.id;

return [{ json: { pago_id, email, name, producto, curso, fecha, precio, moneda, es_prueba: !!prueba } }];`
    }
  }
});

// ============ 4. Anti-duplicado (PayPal puede mandar el mismo aviso dos veces) ============
const buscar_pago = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'buscar_pago',
    alwaysOutputData: true,
    ...REINTENTOS,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLA,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'pago_id', condition: 'eq', keyValue: expr('{{ $json.pago_id }}') }] },
      returnAll: true
    }
  }
});

const es_nuevo = ifElse({
  version: 2.2,
  config: {
    name: 'es_nuevo',
    executeOnce: true,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ !$json.pago_id }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const registrar_pago = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'registrar_pago',
    ...REINTENTOS,
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: TABLA,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          pago_id: expr("{{ $('preparar_datos').first().json.pago_id }}"),
          curso: expr("{{ $('preparar_datos').first().json.producto }}"),
          fecha: expr("{{ $('preparar_datos').first().json.fecha }}"),
          es_prueba: expr("{{ $('preparar_datos').first().json.es_prueba }}")
        },
        matchingColumns: [],
        schema: [C_PAGO, C_CURSO, C_FECHA, C_PRUEBA]
      },
      options: {}
    }
  }
});

const datos_pago = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'datos_pago',
    parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('preparar_datos').first().json }];` }
  }
});

// ============ 5. Finanzas (todo pago se anota) ============
const planilla_finanzas = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'planilla_finanzas',
    ...REINTENTOS,
    parameters: {
      operation: 'append',
      documentId: { __rl: true, value: 'ID_HOJA_A', mode: 'list', cachedResultName: 'Sistema financiero BOT', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/ID_HOJA_A/edit?usp=drivesdk' },
      sheetName: { __rl: true, value: 1846493477, mode: 'list', cachedResultName: 'INGRESOS', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/ID_HOJA_A/edit#gid=1846493477' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          'Fecha': expr('{{ $json.fecha }}'),
          'Clienta / Marca': expr('{{ $json.name }}'),
          'Categoría': 'Programas',
          'Producto o detalle': expr('{{ $json.producto }}'),
          'Moneda': expr('{{ $json.moneda }}'),
          'Importe cobrado': expr('{{ $json.precio }}'),
          'Medio de cobro': 'PayPal',
          'Notas': expr("{{ $json.es_prueba ? 'PRUEBA - borrar' : '' }}")
        },
        matchingColumns: [],
        schema: [F_FECHA, F_CLIENTA, F_CATEGORIA, F_PRODUCTO, F_MONEDA, F_IMPORTE, F_MEDIO, F_NOTAS],
        attemptToConvertTypes: false,
        convertFieldsToString: false
      },
      options: {}
    },
    credentials: CRED_SHEETS
  }
});

// ============ 6. Segun el curso ============
// curso ya viene sin tildes y en minusculas (preparar_datos)
const OPC_REGLA = { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 };
const segun_curso = switchCase({
  version: 3.4,
  config: {
    name: 'segun_curso',
    parameters: {
      rules: { values: [
        { renameOutput: true, outputKey: 'vende_artista', conditions: { options: OPC_REGLA, combinator: 'and', conditions: [{ id: 'r1', leftValue: expr('{{ $json.curso }}'), rightValue: 'artista', operator: { type: 'string', operation: 'contains' } }] } },
        { renameOutput: true, outputKey: 'metodo_iman', conditions: { options: OPC_REGLA, combinator: 'and', conditions: [{ id: 'r2', leftValue: expr('{{ $json.curso }}'), rightValue: 'iman', operator: { type: 'string', operation: 'contains' } }] } },
        { renameOutput: true, outputKey: 'colabora_marcas', conditions: { options: OPC_REGLA, combinator: 'and', conditions: [{ id: 'r3', leftValue: expr('{{ $json.curso }}'), rightValue: 'marcas', operator: { type: 'string', operation: 'contains' } }] } },
        { renameOutput: true, outputKey: 'podcashter', conditions: { options: OPC_REGLA, combinator: 'and', conditions: [{ id: 'r4', leftValue: expr('{{ $json.curso }}'), rightValue: 'podcashter', operator: { type: 'string', operation: 'contains' } }] } }
      ] },
      options: { allMatchingOutputs: true, fallbackOutput: 'extra', renameFallbackOutput: 'curso_desconocido' }
    }
  }
});

// Brevo: en modo prueba todo va a la lista 36 (PRUEBA)
const brevo_artista = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'brevo_artista',
    ...REINTENTOS,
    parameters: {
      method: 'POST', url: 'https://api.brevo.com/v3/contacts',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ email: $json.email, listIds: [ $json.es_prueba ? 36 : 29 ], updateEnabled: true }) }}'),
      options: {}
    },
    credentials: CRED_BREVO
  }
});

const brevo_iman = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'brevo_iman',
    ...REINTENTOS,
    parameters: {
      method: 'POST', url: 'https://api.brevo.com/v3/contacts',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ email: $json.email, listIds: [ $json.es_prueba ? 36 : 22 ], updateEnabled: true }) }}'),
      options: {}
    },
    credentials: CRED_BREVO
  }
});

const brevo_marcas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'brevo_marcas',
    ...REINTENTOS,
    parameters: {
      method: 'POST', url: 'https://api.brevo.com/v3/contacts',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ email: $json.email, listIds: [ $json.es_prueba ? 36 : 33 ], updateEnabled: true }) }}'),
      options: {}
    },
    credentials: CRED_BREVO
  }
});

const brevo_podcashter = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'brevo_podcashter',
    ...REINTENTOS,
    parameters: {
      method: 'POST', url: 'https://api.brevo.com/v3/contacts',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ email: $json.email, listIds: [ $json.es_prueba ? 36 : 35 ], updateEnabled: true }) }}'),
      options: {}
    },
    credentials: CRED_BREVO
  }
});

const HTML_BIENVENIDA = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenida a Método Imán</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .stack { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
    .stack-gap { padding: 0 0 18px 0 !important; }
    .saludo { font-size: 42px !important; line-height: 44px !important; }
    .hero-td { height: 300px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#B5B42C;">

<div style="display:none; max-height:0; overflow:hidden; opacity:0;">
  Empieza tu viaje en Método Imán. Acá tenés todo claro y a mano.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#B5B42C;">
<tr>
<td align="center" style="padding:24px 10px 32px 10px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">

    <!-- Logo -->
    <tr>
      <td class="pad" style="padding:6px 28px 22px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle">
              <img src="https://static.wixstatic.com/media/9df753_50910aaedbc54f85a96d171a4a53555a~mv2.png" width="170" alt="Flor Corney" style="display:block; width:170px; height:auto; border:0;">
            </td>
            <td align="right" valign="middle">
              <img src="https://static.wixstatic.com/media/9df753_1b9abd7f5ce1468aa916248c4311ed32~mv2.png" width="64" alt="" style="display:block; width:64px; height:auto; border:0;">
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Hero: foto de fondo + título -->
    <tr>
      <td class="hero-td" background="https://static.wixstatic.com/media/9df753_813c9c3e66764f11ac483128fe36d206~mv2.jpg" bgcolor="#3B2A14" valign="bottom" height="360"
          style="height:360px; background-color:#3B2A14; background-image:url('https://static.wixstatic.com/media/9df753_813c9c3e66764f11ac483128fe36d206~mv2.jpg'); background-size:cover; background-position:center; border-radius:18px 18px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="pad" style="padding:0 32px 30px 32px;">
              <img src="https://static.wixstatic.com/media/9df753_32da7c97334843aeaabb6b29fc4f2ac1~mv2.png" width="300" alt="Método Imán" style="display:block; width:300px; max-width:100%; height:auto; border:0;">
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Cuerpo -->
    <tr>
      <td style="background-color:#F6EA9C;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

          <!-- Saludo -->
          <tr>
            <td class="pad" style="padding:36px 40px 6px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top">
                    <h1 class="saludo" style="margin:0 0 16px 0; font-family:'Instrument Serif', Georgia, 'Times New Roman', serif; font-style:italic; font-weight:normal; font-size:50px; line-height:52px; color:#6B2D0A;">
                      Holaa {{ $json.name }}!
                    </h1>
                  </td>
                  <td valign="top" align="right" width="74">
                    <img src="https://static.wixstatic.com/media/9df753_c621f3361a2846758182c6f09f6cca2e~mv2.png" width="64" alt="" style="display:block; width:64px; height:auto; border:0;">
                  </td>
                </tr>
              </table>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:27px; color:#5A2A0C;">
                <strong>Felicidadess, empieza tu viaje en Método Imán</strong> y este mensaje es para dejarte todo claro y a mano.
              </p>
            </td>
          </tr>

          <!-- Formulario -->
          <tr>
            <td class="pad" style="padding:30px 40px 10px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#6B2D0A; border-radius:22px;">
                <tr>
                  <td style="padding:24px 24px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:24px; color:#FFF6C9;">
                    <p style="margin:0 0 18px 0;">
                      Quiero conocerte mejor, por favor <strong style="color:#FFFFFF;">rellená este forms de inscripción.</strong>
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color:#FFE600; border-radius:8px;">
                          <a href="https://forms.gle/FORMULARIO_EJEMPLO" target="_blank" style="display:inline-block; padding:12px 22px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#3A1A06; text-decoration:none;">
                            Completar el forms
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Compromiso -->
          <tr>
            <td class="pad" style="padding:30px 40px 6px 40px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#5A2A0C;">
              <p style="margin:0 0 12px 0; font-family:'Instrument Serif', Georgia, serif; font-style:italic; font-size:34px; line-height:38px; color:#6B2D0A;">
                ¡Sacale todo el jugo a este compromiso!
              </p>
              <p style="margin:0;">
                Las clases están en orden para que puedas perfectamente <strong>autogestionar tu proceso</strong>. Si bien el material puedes verlo a tu ritmo, te invito a comprometerte <strong>dedicando un tiempo concreto por semana</strong> al método para que los avances sean progresivos y rápidos.
              </p>
            </td>
          </tr>

          <!-- Telegram -->
          <tr>
            <td class="pad" style="padding:28px 40px 6px 40px;">
              <p style="margin:0 0 16px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#5A2A0C;">
                Por favor, <strong>entrá a los dos grupos</strong> (desde la app de Telegram):
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Comunidad -->
                  <td class="stack stack-gap" width="50%" valign="top" style="padding:0 6px 0 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#3F7A4F; border-radius:16px;">
                      <tr>
                        <td style="padding:22px 22px 24px 22px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:21px; color:#F6EA9C;">
                          <img src="https://static.wixstatic.com/media/9df753_cb768f233367403a8f295e397d0de49c~mv2.png" width="28" alt="" style="display:block; width:28px; height:auto; border:0; margin:0 0 10px 0; transform:rotate(14deg);">
                          <p style="margin:0 0 6px 0; font-size:18px; line-height:22px; font-weight:bold; color:#FFFFFF;">Grupo de la comunidad</p>
                          <p style="margin:0 0 18px 0;">Para compartir ejercicios, avances y preguntas.</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background-color:#F6EA9C; border-radius:8px;">
                                <a href="https://t.me/+ENLACE_INVITACION" target="_blank" style="display:inline-block; padding:10px 18px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#2C5438; text-decoration:none;">
                                  Unirme
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Comunicados -->
                  <td class="stack" width="50%" valign="top" style="padding:0 0 0 6px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#6B2D0A; border-radius:16px;">
                      <tr>
                        <td style="padding:22px 22px 24px 22px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:21px; color:#F6EA9C;">
                          <img src="https://static.wixstatic.com/media/9df753_cb768f233367403a8f295e397d0de49c~mv2.png" width="19" alt="" style="display:block; width:19px; height:auto; border:0; margin:4px 0 14px 6px; transform:rotate(-20deg);">
                          <p style="margin:0 0 6px 0; font-size:18px; line-height:22px; font-weight:bold; color:#FFFFFF;">Grupo de comunicados</p>
                          <p style="margin:0 0 18px 0;">Solo info y avisos de Flor Corney. <strong style="color:#FFE600;">Acá recibís los links de Zoom de los vivos: últimos sábados de cada mes.</strong></p>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background-color:#FFE600; border-radius:8px;">
                                <a href="https://t.me/+ENLACE_INVITACION" target="_blank" style="display:inline-block; padding:10px 18px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#3A1A06; text-decoration:none;">
                                  Unirme
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Comunidad y Circle -->
          <tr>
            <td class="pad" style="padding:30px 40px 40px 40px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#5A2A0C;">
              <p style="margin:0 0 16px 0;">
                Este es un <strong>espacio de comunidad</strong>, donde podés compartir los ejercicios, tus avances, hacer preguntas o pedir un consejo. Vas a encontrarte con un grupo en el que cada una está en una etapa diferente: algunas vienen "más avanzadas" en cuanto a clases y otras empezando. ¡Esa también es la riqueza del grupo y de tener diferentes visiones! Esperamos leerte y recibirte.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #D9C96A;">
                <tr>
                  <td style="padding:18px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#5A2A0C;">
                    <strong>La plataforma está en Circle:</strong> descargá la app de Circle en tu celular para una experiencia cómoda y a mano.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>

    <!-- Cierre -->
    <tr>
      <td class="pad" style="background-color:#6B2D0A; padding:40px 40px 42px 40px; border-radius:0 0 18px 18px;">
        <img src="https://static.wixstatic.com/media/9df753_1b9abd7f5ce1468aa916248c4311ed32~mv2.png" width="80" alt="" style="display:block; width:80px; height:auto; border:0; margin:0 0 14px 0;">
        <p style="margin:0 0 22px 0; font-family:'Instrument Serif', Georgia, serif; font-style:italic; font-size:34px; line-height:38px; color:#F6EA9C;">
          Un placer que seas parte, nos veremos pronto y ¡feliz transformación!
        </p>
        <img src="https://static.wixstatic.com/media/9df753_50910aaedbc54f85a96d171a4a53555a~mv2.png" width="150" alt="Flor Corney" style="display:block; width:150px; height:auto; border:0;">
      </td>
    </tr>

    <!-- Pie -->
    <tr>
      <td class="pad" align="center" style="padding:22px 40px 0 40px; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#FFFFFF;">
        Recibís este email porque te inscribiste en Método Imán.<br>
        <a href="https://www.florcorney.com" target="_blank" style="color:#FFFFFF;">florcorney.com</a>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>
</body>
</html>`;

const email_bienvenida_iman = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'email_bienvenida_iman',
    ...REINTENTOS,
    parameters: {
      sendTo: expr('{{ $json.email }}'),
      subject: expr("{{ $json.es_prueba ? '[PRUEBA] ' : '' }}Bienvenida a Método imán ⭐"),
      message: expr(HTML_BIENVENIDA),
      options: { appendAttribution: false }
    },
    credentials: CRED_GMAIL
  }
});

const vivos = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'vivos',
    ...REINTENTOS,
    parameters: {
      operation: 'append',
      documentId: { __rl: true, value: 'ID_HOJA_B', mode: 'list', cachedResultName: 'Vivos método imán BOT', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/ID_HOJA_B/edit?usp=drivesdk' },
      sheetName: { __rl: true, value: 'gid=0', mode: 'list', cachedResultName: 'Hoja 1', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/ID_HOJA_B/edit#gid=0' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          'Fecha inscripción': expr('{{ $json.fecha }}'),
          'Nombre': expr('{{ $json.name }}'),
          'Mail': expr('{{ $json.email }}'),
          'Vivos restantes': '6'
        },
        matchingColumns: [],
        schema: [V_FECHA, V_NOMBRE, V_MAIL, V_VIVOS],
        attemptToConvertTypes: false,
        convertFieldsToString: false
      },
      options: {}
    },
    credentials: CRED_SHEETS
  }
});

// ============ 7. Curso no reconocido: nadie se queda sin acceso sin que se sepa ============
const alerta_curso_desconocido = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'alerta_curso_desconocido',
    ...REINTENTOS,
    parameters: {
      sendTo: CORREO_ALERTAS,
      subject: expr("{{ $json.es_prueba ? '[PRUEBA] ' : '' }}⚠️ Pago de PayPal sin curso reconocido"),
      message: expr(`<p>Entró un pago por PayPal de <b>{{ $json.name }}</b> ({{ $json.precio }} {{ $json.moneda }}) el {{ $json.fecha }}.</p>
<p>Producto: <b>{{ $json.producto || '(sin nombre de producto)' }}</b></p>
<p>No coincide con ningún curso (artista, imán, marcas, podcashter), así que <b>NO se agregó a ninguna lista de Brevo ni recibió bienvenida</b>. Sí quedó anotado en finanzas.</p>
<p>Qué hacer: darle acceso a mano. Si es un curso nuevo, avisar para sumarlo a la automatización.</p>
<p>Id del pago en PayPal: {{ $json.pago_id }}</p>`),
      options: { appendAttribution: false }
    },
    credentials: CRED_GMAIL
  }
});

// ============ Armado ============
export default workflow('paypal-courses', 'paypal_courses_sales_automation')
  .add(pago_paypal)
  .to(id_desde_paypal)
  .to(leer_captura)
  .add(prueba_manual)
  .to(datos_prueba)
  .to(leer_captura)
  .add(leer_captura)
  .to(validar_captura)
  .to(leer_orden)
  .to(preparar_datos)
  .to(buscar_pago)
  .to(es_nuevo.onTrue(registrar_pago.to(datos_pago)))
  .add(datos_pago)
  .to(planilla_finanzas)
  .add(datos_pago)
  .to(segun_curso
    .onCase(0, brevo_artista)
    .onCase(1, [brevo_iman, email_bienvenida_iman, vivos])
    .onCase(2, brevo_marcas)
    .onCase(3, brevo_podcashter)
    .onCase(4, alerta_curso_desconocido));
