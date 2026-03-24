# IVN Bibliotheek — Architectuur

## Flowchart

```mermaid
flowchart TD
    A[Gebruiker scant NFC sticker] --> B[lenen.html?id=boekId]
    B --> C[GET /api/catalogus?id=boekId]
    C --> D[Baserow: haal boek op]
    D --> E{Status?}
    E -->|beschikbaar| F[Toon knop: Boek lenen]
    E -->|uitgeleend| G[Toon knop: Boek inleveren]

    F --> H[Gebruiker vult naam + e-mail in]
    H --> I[POST /api/boek\nactie: lenen]
    I --> J[Valideer input]
    J -->|ongeldig| K[Toon foutmelding]
    J -->|geldig| L[Baserow: check boekstatus]
    L -->|al uitgeleend| M[409 – niet beschikbaar]
    L -->|beschikbaar| N[Baserow: POST nieuwe rij in Uitleningen\nboek_id, lid_naam, lid_email, uitgeleend_op]
    N --> O[Baserow: PATCH Boeken\nstatus → uitgeleend]
    O --> P[✓ Succesbericht]

    G --> Q[Gebruiker vult naam + e-mail in]
    Q --> R[POST /api/boek\nactie: inleveren]
    R --> S[Valideer input]
    S -->|ongeldig| K
    S -->|geldig| T[Baserow: zoek open uitlening\nboek_id + lid_email + ingeleverd_op leeg]
    T -->|niet gevonden| U[404 – geen uitlening gevonden]
    T -->|gevonden| V[Baserow: PATCH Uitleningen\ningeleverd_op → vandaag]
    V --> W[Baserow: PATCH Boeken\nstatus → beschikbaar]
    W --> X[✓ Succesbericht]
```

---

## Sequence diagram — Lenen

```mermaid
sequenceDiagram
    actor Gebruiker
    participant HTML as lenen.html
    participant Catalogus as /api/catalogus
    participant Boek as /api/boek
    participant Baserow

    Gebruiker->>HTML: Opent pagina (NFC scan)
    HTML->>Catalogus: GET ?id=boekId
    Catalogus->>Baserow: GET /rows/table/Boeken/boekId
    Baserow-->>Catalogus: { titel, status: beschikbaar, ... }
    Catalogus-->>HTML: boekdata
    HTML-->>Gebruiker: Toont boek + knop "Lenen"

    Gebruiker->>HTML: Vult naam + e-mail in, klikt Lenen
    HTML->>Boek: POST { boekId, naam, email, actie: lenen }
    Boek->>Baserow: GET /rows/table/Boeken/boekId
    Baserow-->>Boek: { status: beschikbaar }
    Boek->>Baserow: POST /rows/table/Uitleningen
    Baserow-->>Boek: { id: 99 }
    Boek->>Baserow: PATCH /rows/table/Boeken/boekId { status: uitgeleend }
    Baserow-->>Boek: OK
    Boek-->>HTML: { ok: true, bericht: "..." }
    HTML-->>Gebruiker: Succesbericht
```

---

## Sequence diagram — Inleveren

```mermaid
sequenceDiagram
    actor Gebruiker
    participant HTML as lenen.html
    participant Catalogus as /api/catalogus
    participant Boek as /api/boek
    participant Baserow

    Gebruiker->>HTML: Opent pagina (NFC scan)
    HTML->>Catalogus: GET ?id=boekId
    Catalogus->>Baserow: GET /rows/table/Boeken/boekId
    Baserow-->>Catalogus: { titel, status: uitgeleend, ... }
    Catalogus-->>HTML: boekdata
    HTML-->>Gebruiker: Toont boek + knop "Inleveren"

    Gebruiker->>HTML: Vult naam + e-mail in, klikt Inleveren
    HTML->>Boek: POST { boekId, naam, email, actie: inleveren }
    Boek->>Baserow: GET /rows/table/Boeken/boekId
    Baserow-->>Boek: { status: uitgeleend }
    Boek->>Baserow: GET /rows/table/Uitleningen\n?boek_id=X&lid_email=Y&ingeleverd_op__empty=true
    Baserow-->>Boek: { results: [{ id: 99, ... }] }
    Boek->>Baserow: PATCH /rows/table/Uitleningen/99 { ingeleverd_op: vandaag }
    Baserow-->>Boek: OK
    Boek->>Baserow: PATCH /rows/table/Boeken/boekId { status: beschikbaar }
    Baserow-->>Boek: OK
    Boek-->>HTML: { ok: true, bericht: "..." }
    HTML-->>Gebruiker: Succesbericht
```

---

## Componenten

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|----------------------|
| `index.html` | GitHub Pages | Catalogusoverzicht tonen |
| `lenen.html` | GitHub Pages | Lenen en inleveren formulier |
| `/api/catalogus` | Vercel serverless | Boeken ophalen (readonly) |
| `/api/boek` | Vercel serverless | Lenen en inleveren verwerken |
| Baserow | Cloud | Database: Boeken + Uitleningen |

## Tokens

| Token | Gebruikt door | Rechten |
|-------|--------------|---------|
| `BASEROW_TOKEN_READONLY` | `/api/catalogus` | Alleen lezen op Boeken |
| `BASEROW_TOKEN` | `/api/boek` | Lezen + schrijven op Boeken + Uitleningen |
