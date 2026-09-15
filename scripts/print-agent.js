/**
 * Agent d'impression du poste caisse.
 *
 * Un navigateur ne pilote pas une imprimante thermique. Ce petit programme tourne sur le
 * PC de la caisse, réclame les bons au serveur et les envoie en ESC/POS sur le réseau local.
 *
 *   PRINT_AGENT_URL=https://coco.example.com \
 *   PRINT_AGENT_TOKEN=dev_… \
 *   node scripts/print-agent.js
 *
 * Sans imprimante sous la main, `PRINT_AGENT_OUTPUT=texte` écrit les bons dans la console :
 * c'est la façon de vérifier la mise en page avant d'acheter le matériel.
 */

const net = require('node:net');

const BASE = (process.env.PRINT_AGENT_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TOKEN = process.env.PRINT_AGENT_TOKEN;
const MODE = process.env.PRINT_AGENT_OUTPUT || 'imprimante';
const INTERVAL = Number(process.env.PRINT_AGENT_INTERVAL || 3000);

if (!TOKEN) {
  console.error("PRINT_AGENT_TOKEN est requis : c'est le jeton du poste caisse, remis à l'enrôlement.");
  process.exit(1);
}

// --- ESC/POS ------------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

// Les imprimantes thermiques ne parlent pas UTF-8. On sélectionne la page de codes 850,
// la plus largement supportée, et on convertit les caractères français correspondants.
const CP850 = {
  é: 0x82,
  è: 0x8a,
  ê: 0x88,
  ë: 0x89,
  à: 0x85,
  â: 0x83,
  ä: 0x84,
  ç: 0x87,
  î: 0x8c,
  ï: 0x8b,
  ô: 0x93,
  ö: 0x94,
  ù: 0x97,
  û: 0x96,
  ü: 0x81,
  É: 0x90,
  È: 0xd4,
  Ê: 0xd2,
  À: 0xb7,
  Ç: 0x80,
  Ô: 0xe2,
  '«': 0xae,
  '»': 0xaf,
  '°': 0xf8,
  '·': 0xfa,
  '’': 0x27,
  '—': 0x2d,
  '–': 0x2d,
};

function encodeText(text) {
  const bytes = [];
  for (const character of text) {
    if (CP850[character] !== undefined) {
      bytes.push(CP850[character]);
      continue;
    }
    const code = character.charCodeAt(0);
    // Un caractère hors table sort en point d'interrogation plutôt qu'en octet illisible.
    bytes.push(code < 128 ? code : 0x3f);
  }
  return Buffer.from(bytes);
}

const STYLES = {
  titre: { size: 0x11, bold: true, center: true },
  entete: { size: 0x00, bold: true, center: true },
  article: { size: 0x01, bold: true, center: false },
  detail: { size: 0x00, bold: false, center: false },
  note: { size: 0x00, bold: true, center: false },
  trait: { size: 0x00, bold: false, center: false },
};

function encodeTicket(job) {
  const chunks = [Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x74, 0x02])];
  for (const line of job.lines) {
    const style = STYLES[line.style] || STYLES.detail;
    chunks.push(Buffer.from([ESC, 0x61, style.center ? 0x01 : 0x00]));
    chunks.push(Buffer.from([GS, 0x21, style.size]));
    chunks.push(Buffer.from([ESC, 0x45, style.bold ? 0x01 : 0x00]));
    chunks.push(encodeText(line.text), Buffer.from('\n'));
  }
  // Marge avant coupe : sans elle, la dernière ligne reste coincée dans le mécanisme.
  chunks.push(Buffer.from([GS, 0x21, 0x00]), Buffer.from('\n\n\n\n'));
  chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
  return Buffer.concat(chunks);
}

function sendToPrinter(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 8000 });
    socket.on('connect', () => socket.end(payload));
    socket.on('close', () => resolve());
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Imprimante ${host}:${port} ne répond pas`));
    });
    socket.on('error', (error) => reject(error));
  });
}

// --- Boucle ------------------------------------------------------------------------------

async function report(id, result, error) {
  await fetch(`${BASE}/api/print-jobs/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-token': TOKEN },
    body: JSON.stringify({ result, error }),
  }).catch(() => undefined);
}

async function tick() {
  const response = await fetch(`${BASE}/api/print-jobs`, { headers: { 'x-device-token': TOKEN } });
  if (!response.ok) {
    if (response.status === 401) console.error('Jeton de poste refusé : vérifiez PRINT_AGENT_TOKEN.');
    return;
  }
  const { jobs } = await response.json();
  for (const job of jobs) {
    try {
      if (MODE === 'texte' || !job.printerHost) {
        console.log(`\n--- ${job.stationName} · ${job.orderNumber} ---`);
        for (const line of job.lines) console.log(line.text);
        console.log('---\n');
      } else {
        await sendToPrinter(job.printerHost, job.printerPort || 9100, encodeTicket(job));
      }
      await report(job._id, 'printed');
      console.log(`Imprimé ${job.orderNumber} → ${job.stationName}`);
    } catch (error) {
      console.error(`Échec ${job.orderNumber} → ${job.stationName} : ${error.message}`);
      await report(job._id, 'failed', error.message);
    }
  }
}

async function main() {
  console.log(`Agent d'impression démarré sur ${BASE} (mode ${MODE}).`);
  for (;;) {
    // Une panne de réseau ne doit pas arrêter l'agent : il reprend au tour suivant.
    await tick().catch((error) => console.error('Relève impossible :', error.message));
    await new Promise((resolve) => setTimeout(resolve, INTERVAL));
  }
}

main();
