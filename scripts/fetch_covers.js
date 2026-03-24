// Script om boekomslagen op te halen via Google Books API
// en op te slaan in Baserow cover_url veld.
//
// Gebruik:
//   npm install
//   node scripts/fetch_covers.js
//
// Vereisten: .env bestand met BASEROW_TOKEN en BASEROW_TABLE_BOEKEN

import 'dotenv/config';

const BASEROW_API = 'https://api.baserow.io/api';
const TOKEN = process.env.BASEROW_TOKEN;
const TABLE_BOEKEN = process.env.BASEROW_TABLE_BOEKEN;
const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

if (!TOKEN || !TABLE_BOEKEN) {
  console.error('Fout: BASEROW_TOKEN en BASEROW_TABLE_BOEKEN zijn verplicht in .env');
  process.exit(1);
}

// Wacht even tussen API calls om rate limits te respecteren
function wacht(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Haal cover URL op via Google Books (geeft null terug als niet gevonden)
async function haalCoverUrl(isbn) {
  if (!isbn) return null;
  const schoonIsbn = isbn.replace(/[\s-]/g, '');
  if (!/^[0-9]{9,13}$/.test(schoonIsbn)) return null;

  try {
    const url = `${GOOGLE_BOOKS_API}?q=isbn:${schoonIsbn}&fields=items(volumeInfo/imageLinks)`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const links = data?.items?.[0]?.volumeInfo?.imageLinks;
    if (!links) return null;
    // Voorkeur: medium cover, anders small of thumbnail
    const coverUrl = links.medium || links.small || links.thumbnail || null;
    // Vervang http door https en verwijder curl parameter voor schonere URL
    return coverUrl ? coverUrl.replace('http://', 'https://').replace('&edge=curl', '') : null;
  } catch {
    return null;
  }
}

// Haal alle boeken op uit Baserow (gepagineerd)
async function haalAlleBoeken() {
  const boeken = [];
  let url = `${BASEROW_API}/database/rows/table/${TABLE_BOEKEN}/?size=100&user_field_names=true`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Token ${TOKEN}` },
    });
    if (!res.ok) {
      console.error(`Baserow fout: ${res.status}`);
      break;
    }
    const data = await res.json();
    boeken.push(...data.results);
    url = data.next ? data.next.replace('http://', 'https://') : null;
  }

  return boeken;
}

// Sla cover URL op in Baserow
async function slaOpInBaserow(boekId, coverUrl) {
  const res = await fetch(`${BASEROW_API}/database/rows/table/${TABLE_BOEKEN}/${boekId}/?user_field_names=true`, {
    method: 'PATCH',
    headers: {
      Authorization: `Token ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cover_url: coverUrl }),
  });
  if (!res.ok) {
    console.error(`  Fout bij opslaan voor boek ${boekId}: ${res.status}`);
    return false;
  }
  return true;
}

// Hoofdprogramma
async function main() {
  console.log('Boeken ophalen uit Baserow...');
  const boeken = await haalAlleBoeken();
  console.log(`${boeken.length} boeken gevonden.`);

  const zonderCover = boeken.filter((b) => !b.cover_url && b.ISBN);
  console.log(`${zonderCover.length} boeken zonder cover maar met ISBN.\n`);

  let gevonden = 0;
  let nietGevonden = 0;

  for (let i = 0; i < zonderCover.length; i++) {
    const boek = zonderCover[i];
    process.stdout.write(`[${i + 1}/${zonderCover.length}] ${boek.titel} (${boek.ISBN})... `);

    const coverUrl = await haalCoverUrl(boek.ISBN);

    if (coverUrl) {
      await slaOpInBaserow(boek.id, coverUrl);
      console.log('✓');
      gevonden++;
    } else {
      console.log('geen cover gevonden');
      nietGevonden++;
    }

    // 300ms pauze tussen calls (Google Books: max ~1000/dag gratis)
    await wacht(300);
  }

  console.log(`\nKlaar! ${gevonden} covers opgeslagen, ${nietGevonden} niet gevonden.`);
  console.log('Boeken zonder ISBN worden overgeslagen — voeg cover_url handmatig toe in Baserow.');
}

main();
