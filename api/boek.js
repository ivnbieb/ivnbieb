// Vercel serverless function: lenen en inleveren
// Alle gevoelige tokens zitten in Vercel environment variables, nooit in de frontend.

import { setCors } from './_cors.js';

const BASEROW_API = 'https://api.baserow.io/api';
const TOKEN = process.env.BASEROW_TOKEN;
const TABLE_BOEKEN = process.env.BASEROW_TABLE_BOEKEN;
const TABLE_UITLENINGEN = process.env.BASEROW_TABLE_UITLENINGEN;

// Input validatie
function valideerEmail(email) {
  return typeof email === 'string' && /^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email);
}

function valideerNaam(naam) {
  return typeof naam === 'string' && naam.trim().length >= 2 && naam.trim().length <= 100;
}

function valideerBoekId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
}

function valideerActie(actie) {
  return actie === 'lenen' || actie === 'inleveren';
}

async function baserowGet(path) {
  const res = await fetch(`${BASEROW_API}${path}`, {
    headers: { Authorization: `Token ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Baserow GET fout: ${res.status}`);
  return res.json();
}

async function baserowPost(path, body) {
  const res = await fetch(`${BASEROW_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Baserow POST fout: ${res.status}`);
  return res.json();
}

async function baserowPatch(path, body) {
  const res = await fetch(`${BASEROW_API}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Token ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Baserow PATCH fout: ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  setCors(req, res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ fout: 'Alleen POST toegestaan' });
    return;
  }

  const { boekId, naam, email, actie } = req.body || {};

  // Valideer alle input
  if (!valideerBoekId(boekId)) {
    res.status(400).json({ fout: 'Ongeldig boek ID' });
    return;
  }
  if (!valideerNaam(naam)) {
    res.status(400).json({ fout: 'Naam is verplicht (2-100 tekens)' });
    return;
  }
  if (!valideerEmail(email)) {
    res.status(400).json({ fout: 'Ongeldig e-mailadres' });
    return;
  }
  if (!valideerActie(actie)) {
    res.status(400).json({ fout: 'Actie moet "lenen" of "inleveren" zijn' });
    return;
  }

  try {
    // Haal boek op
    const boek = await baserowGet(`/database/rows/table/${TABLE_BOEKEN}/${Number(boekId)}/?user_field_names=true`);

    // status is een Single Select object in Baserow: { value: 'beschikbaar' }
    const boekStatus = boek.status?.value || boek.status;

    if (actie === 'lenen') {
      if (boekStatus !== 'beschikbaar') {
        res.status(409).json({ fout: 'Dit boek is momenteel niet beschikbaar' });
        return;
      }

      // Maak uitlening aan
      await baserowPost(`/database/rows/table/${TABLE_UITLENINGEN}/?user_field_names=true`, {
        boek_id: Number(boekId),
        lid_naam: naam.trim(),
        lid_email: email.toLowerCase().trim(),
        uitgeleend_op: new Date().toISOString().slice(0, 10),
      });

      // Update boekstatus
      await baserowPatch(`/database/rows/table/${TABLE_BOEKEN}/${Number(boekId)}/?user_field_names=true`, {
        status: 'uitgeleend',
      });

      res.status(200).json({ ok: true, bericht: `"${boek.titel}" is voor jou gereserveerd. Veel leesplezier!` });

    } else {
      // inleveren: zoek open uitlening voor dit boek + email
      const uitleningen = await baserowGet(
        `/database/rows/table/${TABLE_UITLENINGEN}/?user_field_names=true&filter__boek_id__equal=${Number(boekId)}&filter__lid_email__equal=${encodeURIComponent(email.toLowerCase().trim())}&filter__ingeleverd_op__empty=true`
      );

      if (!uitleningen.results || uitleningen.results.length === 0) {
        res.status(404).json({ fout: 'Geen openstaande uitlening gevonden voor dit boek en e-mailadres' });
        return;
      }

      const uitlening = uitleningen.results[0];

      // Sluit uitlening
      await baserowPatch(`/database/rows/table/${TABLE_UITLENINGEN}/${uitlening.id}/?user_field_names=true`, {
        ingeleverd_op: new Date().toISOString().slice(0, 10),
      });

      // Update boekstatus
      await baserowPatch(`/database/rows/table/${TABLE_BOEKEN}/${Number(boekId)}/?user_field_names=true`, {
        status: 'beschikbaar',
      });

      res.status(200).json({ ok: true, bericht: `Bedankt voor het terugbrengen van "${boek.titel}"!` });
    }

  } catch (err) {
    console.error('api/boek fout:', err.message);
    res.status(500).json({ fout: 'Er ging iets mis. Probeer het opnieuw.' });
  }
}
