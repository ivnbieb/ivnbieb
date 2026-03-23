// Vercel serverless function: boeken ophalen uit Baserow
// Read token zit in Vercel env vars, nooit in de frontend.

import { setCors } from './_cors.js';

const BASEROW_API = 'https://api.baserow.io/api';
const TOKEN = process.env.BASEROW_TOKEN_READONLY;
const TABLE_BOEKEN = process.env.BASEROW_TABLE_BOEKEN;

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ fout: 'Alleen GET toegestaan' });
    return;
  }

  // Enkel boek ophalen (voor lenen.html)
  const { id } = req.query;
  if (id) {
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ fout: 'Ongeldig boek ID' });
      return;
    }
    try {
      const boekRes = await fetch(
        `${BASEROW_API}/database/rows/table/${TABLE_BOEKEN}/${id}/?user_field_names=true`,
        { headers: { Authorization: `Token ${TOKEN}` } }
      );
      if (!boekRes.ok) {
        res.status(boekRes.status).json({ fout: 'Boek niet gevonden' });
        return;
      }
      const boek = await boekRes.json();
      res.status(200).json(boek);
    } catch (err) {
      console.error('api/catalogus fout:', err.message);
      res.status(500).json({ fout: 'Kan boek niet ophalen' });
    }
    return;
  }

  // Alle boeken ophalen (voor index.html)
  try {
    const boeken = [];
    let url = `${BASEROW_API}/database/rows/table/${TABLE_BOEKEN}/?size=200&user_field_names=true`;

    while (url) {
      const pageRes = await fetch(url, {
        headers: { Authorization: `Token ${TOKEN}` },
      });
      if (!pageRes.ok) {
        const body = await pageRes.text();
        throw new Error(`Baserow fout: ${pageRes.status} - ${body}`);
      }
      const data = await pageRes.json();
      boeken.push(...data.results);
      url = data.next || null;
    }

    res.status(200).json({ boeken });
  } catch (err) {
    console.error('api/catalogus fout:', err.message);
    res.status(500).json({ fout: 'Kan catalogus niet laden' });
  }
}
