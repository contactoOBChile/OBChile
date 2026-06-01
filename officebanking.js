const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const path = require('path');
const fetch = require('node-fetch');

function ajustarMonto(saldo) {
  if (saldo < 1000000) return null;
  return Math.floor(saldo / 500000) * 500000;
}

async function notificarTelegram(monto, saldo, error = null) {
  let mensaje;
  if (error === "login") {
    mensaje = `❌ Error de login: Credenciales incorrectas en OfficeBanking`;
  } else if (error === "saldo") {
    mensaje = `⚠️ No se encontró el saldo en la página`;
  } else if (monto) {
    mensaje = `✅ Planilla actualizada\nSaldo detectado: ${saldo}\nMonto escrito en H2: ${monto}`;
  } else {
    mensaje = `⚠️ Saldo detectado: ${saldo}\nNo se actualizó H2 porque es menor a 1.000.000`;
  }

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.CHAT_ID,
      text: mensaje
    })
  });
}

async function loginYActualizarPlanilla(rut, password) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Ir al portal principal
  await page.goto('https://empresas.officebanking.cl', { waitUntil: 'networkidle2' });

  // Esperar iframe y obtener su contenido
  await page.waitForSelector('iframe');
  const frameHandle = await page.$('iframe');
  const frame = await frameHandle.contentFrame();

  // Escribir RUT y contraseña dentro del iframe
  await frame.type('#username', rut);
  await frame.type('#password', password);

  // Click en botón de login
  await frame.click('#doLoginButton');
  await frame.waitForNavigation({ waitUntil: 'networkidle2' });

  // Revisar la URL actual para detectar error de credenciales
  const currentUrl = frame.url();
  if (currentUrl.includes('/login-error/credentials')) {
    await notificarTelegram(null, null, "login");
    await browser.close();
    return { status: 'error', saldo: null, monto: null, mensaje: "Credenciales incorrectas" };
  }

  // Extraer saldo dentro del iframe
  await frame.waitForSelector('td.ng-star-inserted', { timeout: 10000 });
  const celdas = await frame.$$eval('td.ng-star-inserted', els => els.map(el => el.innerText.trim()));
  const saldoTexto = celdas.find(txt => txt.includes('$'));

  if (!saldoTexto) {
    await notificarTelegram(null, null, "saldo");
    await browser.close();
    return { status: 'error', saldo: null, monto: null, mensaje: "No se encontró el saldo" };
  }

  const saldo = parseInt(saldoTexto.replace(/[^0-9-]/g, ''), 10);

  // Calcular monto ajustado
  const monto = ajustarMonto(saldo);

  if (monto) {
    // Actualizar planilla en H2
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(__dirname, 'planillaformatotransf.xlsx'));
    const sheet = workbook.getWorksheet(1);

    sheet.getCell('H2').value = monto;

    await workbook.xlsx.writeFile(path.join(__dirname, 'planillaformatotransf.xlsx'));
  }

  // Notificar a Telegram (siempre)
  await notificarTelegram(monto, saldo);

  await browser.close();
  return { status: monto ? 'ok' : 'descartado', saldo, monto };
}

module.exports = { loginYActualizarPlanilla };
