# ROMC Data Extractor

Python tooling to mine data from the **Ragnarok M Classic Global** client.  
It currently focuses on extracting items, monsters, skills, formulas, and icons in a format that can
be reused to build encyclopaedias similar to community sites.

> NOTE: Some Unity tables (notably the equipment config) are still stored in an
> encrypted/binary format. The initial version of this extractor concentrates on
> the plainly encoded tables (items, monsters, skills) so you can start building
> a database right away while deeper reverse engineering work continues.

## Requirements

* Python 3.10+
* Java Runtime Environment (needed to decompile the encrypted CommonFun Lua chunks)
* The game installed locally (default path: `C:\Program Files (x86)\XD\Ragnarok M Classic Global`)
* The client’s `slua_encrypt.dll` (copy `ro_win_Data\Plugins\x86_64\slua_encrypt.dll` into
  `src/third_party/slua/` or point the `SLUA_DLL` environment variable to its location)

Install the dependencies in a virtual environment:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Usage

```
.venv\Scripts\python.exe -m romc_data_extractor.cli `
    --game-root "C:\Program Files (x86)\XD\Ragnarok M Classic Global" `
    --output data `
    --modules items monsters skills formulas icons
```

This will produce JSON files in the chosen output directory:

* `items.json` – every entry from `Table_Item`, grouped into equipment, headgears,
  cards, consumables, and furniture (best-effort categorisation).
* `monsters.json` – monsters with their base attributes, races, and rewards.
* `skills.json` – all class-branch skill definitions with translated descriptions.
* `formula_definitions.json` – Lua source lifted directly from the encrypted `CommonFun`
  TextAssets (requires Java + `unluac` to decode).
* `formula_usages.json` – in-house mapping of the `CommonFun.calcDamage_*` ids to
  every skill level that references them (from the game client tables).
* `icon_manifest.json` + `icons/*.png` – icon sprites extracted from the Unity
  bundles for items/skills (one PNG per icon id, manifest lists missing ones).

Each record retains the original `##token` identifiers so you can plug in another
translation table if needed.

### Fast re-run helper

There is a convenience PowerShell script that sequentially runs each module and
summarises any failures. It automatically falls back to the system `python` if a
virtualenv is not present.

```
pwsh scripts/run_extraction.ps1 `
    -GameRoot "C:\Users\braya\romc-android" `
    -Output data `
    -Modules items,monsters,skills,classes,formulas,icons
```

Internally it delegates to the same CLI shown above, so you can customise the
module list or point it at a different installation path as needed.

> **Heads-up:** the latest Android client updated several encrypted tables
> (notably `Table_Class` and the `CommonFun` TextAssets) to a new Lua constant
> encoding. Until `unluac` gains support for the new type codes, these modules
> will log an error in the summary while the remaining datasets extract normally.

### Full Android pipeline (ADB + extraction + snapshot)

If you are mining data from the Android build sitting inside LDPlayer, run the
end-to-end PowerShell helper. It takes care of pulling the files through ADB,
running every extractor module, copying the JSON/Lua/icons into a timestamped
folder under `exports/datasets`, and printing a quick summary for sanity checks.

```powershell
pwsh scripts/full_pipeline.ps1 `
    -AdbPath "C:\LDPlayer\LDPlayer9\adb.exe" `
    -DeviceId emulator-5554 `
    -RemotePath "/sdcard/Android/data/com.gravityus.romgzeny.aos/files" `
    -LocalMirror "C:\Users\braya\romc-android" `
    -Output data
```

Steps performed:

1. Runs `adb devices`, selects the requested emulator/device (or the first
   connected one) and mirrors the remote folder locally.
2. Invokes the extractor sequentially for `items`, `monsters`, `skills`,
   `classes`, `formulas` and `icons`, storing everything under `data/`.
3. Copies the fresh data into `exports/datasets/<timestamp>`.
4. Prints one-line statistics (totals and icon coverage) so you can confirm the
   export looks sane before pushing it downstream.

Pass `-SkipPull` whenever you already have a local mirror and only need to
regenerate the JSON files.

## LDPlayer / ADB pipeline

When you extract the Android client through LDPlayer you can automate the whole
workflow (pull APK → decode StreamingAssets → export JSON → prepare Mongo
imports) with the helper CLI:

```
PYTHONPATH=src python -m romc_data_extractor.ldplayer_pipeline ^
    --adb-path "C:\LDPlayer\LDPlayer9\adb.exe" ^
    --package com.gravity.romcg ^
    --tag 20240905 ^
    --modules items monsters skills formulas icons
```

The command will:

1. Ensure at least one device is connected via `adb devices`.
2. Locate every installed APK split for the ROMC package, pull them one by one
   until it finds the one containing `assets/bin/Data/StreamingAssets`. If none
   of the splits ship the Unity data, it automatically pulls
   `/sdcard/Android/data/<package>/files` and `/sdcard/Android/obb/<package>`,
   unpacking any `.obb` asset bundle it finds until `StreamingAssets` shows up.
3. Run the regular extractor for the modules you selected.
4. Emit two folder trees:
   * `exports/datasets/<tag>` → structured JSON identical to the `data/` folder.
   * `exports/mongo/<tag>` → one JSONL file per collection (items, monsters,
     skills, classes, formula_definitions, formula_usages) ready for `mongoimport`.

Use `--keep-temp` if you need to archive the pulled APK/assets for auditing.

## MongoDB + Docker

A ready-to-run Mongo 7 instance is defined in `docker-compose.yml`:

```
docker compose up -d mongodb
```

Credentials (default): `romc` / `romc`, database `romc`, port `27017`.

After running the LDPlayer pipeline, ingest the JSONL dataset with:

```
PYTHONPATH=src python -m romc_data_extractor.mongo_loader ^
    --mongo-uri mongodb://romc:romc@localhost:27017 ^
    --database romc ^
    --dataset exports/mongo/20240905 ^
    --drop-first
```

You can limit the collections by passing `--collections items monsters`.

## RuneAtlas (Node.js site)

The web interface lives under `web/runeatlas` and ships with the project name
**RuneAtlas**. It mimics the feel of the reference sites you shared, includes
ad slots, and exposes dedicated pages for items, skills, monsters and formulas.

Basic workflow:

```
cd web\runeatlas
cp .env.example .env   # adjust Mongo URI + NEXT_PUBLIC_ADSENSE_CLIENT
npm install
npm run dev            # http://localhost:3000
```

The site reads directly from MongoDB, so keep `docker compose` running or point
`MONGODB_URI` to your own cluster. Every route supports query-string filters, and
the landing page SearchPanel queries `/api/search` to locate any entity.

### Ad slots

`NEXT_PUBLIC_ADSENSE_CLIENT` enables the Google AdSense script globally. Each
page places `AdSlot` components (e.g. leaderboard, sidebar). Provide a `slotId`
that matches the unit configured in AdSense (or any other network) and the
component will render the `<ins class="adsbygoogle">` placeholder; when no
client ID is set the component shows a styled placeholder so you can keep
designing the layout without leaking impressions.

## Architecture

* `romc_data_extractor/unity_utils.py` – UnityPy bootstrap + compression patches.
* `romc_data_extractor/lua_table.py` – generic parser for the plaintext LUA tables.
* `romc_data_extractor/translation.py` – loader for the segmented string tables in
  `StreamingAssets/resources/lang/translate`.
* `romc_data_extractor/processors/*` – per-domain extractors that serialise to JSON.
* `romc_data_extractor/cli.py` – orchestrates everything via CLI arguments.

## Next steps

* Reverse the binary format used by `Table_Equip` and related files (they appear to
  be encrypted/packed TextAssets). Once decoded we can upgrade the extractor with
  full weapon/armor stats.
* Merge monster attribute tables (e.g. `Table_MonsterAttrDyn`) for more granular
  stat curves.
* Enrich items with icon export and localisation for additional languages.






