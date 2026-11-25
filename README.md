# Tech Case: Muziekcatalogus & Licensing

## Context

Team Rockstars beheert een muziekcatalogus en de licentie- en rechtenadministratie die daarbij hoort. Björk, Beyoncé, Goldband, Radiohead, dat werk. Het klinkt leuker dan het is, want die administratie is in de loop van de jaren over allerlei systemen en exports verspreid geraakt en niemand heeft ooit tijd gehad om dat op te ruimen.

In `/data` staat wat we terug hebben kunnen halen, verdeeld over drie soorten bronnen:

* **Catalogus:** een export uit de productiedatabase, deels hersteld uit een onderbroken back-up.
* **Rechten:** een tabel met de licentie- en royaltyafspraken per track.
* **Archiefstukken:** ingescande licentieovereenkomsten, handboeken, rapporten en interviews, opgeslagen als afbeeldingen.

Er zit van alles in wat niet klopt of gewoon ontbreekt. Dat hebben we zo gelaten, want zo krijg je het in de praktijk ook aangeleverd.

## De opdracht

Bouw een werkend prototype dat vragen over de catalogus en de licentievoorwaarden kan beantwoorden, met onderbouwing uit de data zelf.

Hoe je dat doet mag je zelf bepalen. Welke bronnen je pakt, welke technologie je kiest, hoe je de boel aan elkaar knoopt. Daar zit voor ons ook de waarde van deze opdracht: we willen zien hoe jij tot een aanpak komt.

Kies minstens twee vragen uit de tabel hieronder en beantwoord die met je prototype. Verzin daarnaast zelf nog minstens één vraag die jij interessant vindt, en beantwoord die ook.

| # | Vraag |
|---|-------|
| 1 | Welk royaltypercentage geldt er nu voor Björk-tracks in de Benelux? En zeggen alle bronnen daar hetzelfde over? |
| 2 | Welke tracks in de catalogus hebben een licentie die in 2025 afloopt, en wat staat er in de bijbehorende contractdocumenten over verlengen? |
| 3 | Mag 'Halo' van Beyoncé gebruikt worden in een festival-aftermovie die online gepubliceerd wordt? Zo ja, onder welke voorwaarden en tegen welk tarief? |
| 4 | Het radiostation wil de meest gedraaide tracks van 2024 opnieuw programmeren. Welke daarvan mogen niet, of alleen onder bijzondere voorwaarden, uitgezonden worden? |
| 5 | Bij welke artiesten is de data zo tegenstrijdig of incompleet dat je geen kloppende royaltyberekening kunt maken? En hoe groot is dat probleem? |

Verder een paar dingen die wel echt moeten:

* Je oplossing moet aanroepbaar zijn als applicatie, dus via een API, CLI of een interface. Een notebook is niet genoeg.
* Er moet een LLM in zitten. Lokaal (Ollama, llama.cpp) of via een cloud-API (OpenAI, Anthropic) maakt ons niet uit, maar schrijf op wat je gekozen hebt en waarom.
* Je moet het lokaal kunnen draaien tijdens de verdediging. We willen het live zien werken.
* Reken op ongeveer 4 uur. Dat is te weinig om alles te doen, dus kies. Een klein stuk dat goed in elkaar zit vinden we beter dan veel code die het meestal wel doet.

## Wat we van je terugkrijgen

Je codebase, met een indeling die past bij de keuzes die je gemaakt hebt.

En een kort logboek (mag in de README) waarin je iets zegt over:

* welke bronnen je gebruikt hebt, en welke je hebt laten liggen
* welk LLM je gekozen hebt en waarom
* je belangrijkste ontwerpkeuzes en de afwegingen daarbij
* wat er niet af is gekomen, en waar het misgaat of zwak is
* wat je zou doen om dit richting productie te brengen

## Waar we naar kijken

* ontwerpkeuzes in de architectuur
* datakwaliteit, analyse en inzicht
* kwaliteit van code
* gebruik van generatieve AI
* hoe je je keuzes onderbouwt

We nemen je oplossing door tijdens een live demo op je eigen machine. Daarbij vragen we door op je keuzes, ook op de stukken die een AI-assistent voor je heeft geschreven. Zorg dus dat je kunt uitleggen wat er staat.

## Prototype draaien

```text
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

Zet in `.env`:

```text
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_REASONING_EFFORT=low
```

| | |
|---|---|
| CLI | `.venv\Scripts\python.exe agent.py "Je vraag"` |
| Web | `.venv\Scripts\python.exe app.py` → http://127.0.0.1:8000 |
| Tests | `.venv\Scripts\python.exe -m pytest test_tools.py -v` |

### Railway

Branch `railway-deploy`. Deploy from GitHub; set variables:

```text
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_REASONING_EFFORT=low
```

Start command (also in `Procfile` / `railway.toml`): `uvicorn app:app --host 0.0.0.0 --port $PORT`.  
Health: `GET /health`. Chat turns can take ~30–60s (PDF vision); raise the service HTTP timeout if streams cut off. `db/` and `results/` are ephemeral on Railway unless you attach a volume.

De agent zoekt in de catalogus en de rechten-CSV (`find_tracks`, `find_licenses`) en leest een PDF in één keer (`read_document`). Per chatbeurt is er 30 seconden zoektijd; daarna antwoordt hij met wat hij heeft. Lange lijsten gaan naar `results/`, het chatverloop naar `db/agent.sqlite`, en elke webbeurt naar `traces/chat_*.json`. Ontwerpkeuzes staan in `DECISION_LOG.md`.
