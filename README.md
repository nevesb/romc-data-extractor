# ROMC Data Extractor

Toolkit to extract game data from **Ragnarok M Classic Global** (Android client via LDPlayer) and load it into a local MongoDB database. Includes a [Next.js web app (RuneAtlas)](web/runeatlas) to browse items, monsters, skills, formulas, and buffs.

**What gets extracted:** items, monsters, skills, classes, formulas, icons, buffs, and rewards.

---

## Easy Run

If you want to set up everything in one go (Python, Docker, extraction, MongoDB load, and web app):

```powershell
# Windows (PowerShell)
.\setup.ps1
```

```bash
# Linux / macOS
./setup.sh
```

You can also run individual steps:

```bash
./setup.sh python    # only set up Python venv
./setup.sh docker    # only start MongoDB
./setup.sh extract   # set up Python + extract from LDPlayer
./setup.sh load      # set up Python + Docker + load data into MongoDB
./setup.sh web       # only start the web app
```

The same steps work with `setup.ps1 -Step <step>` on PowerShell.

> If you prefer to run each step manually, follow the detailed guide below.

---

## Prerequisites

| Tool | Why |
|---|---|
| **Python 3.10+** | Runs the extractor |
| **Java Runtime (JRE)** | Needed by `unluac` to decompile Lua chunks |
| **LDPlayer 9** | Android emulator to run the ROMC client |
| **Docker** | Runs the local MongoDB instance |
| **Node.js 20+** | Runs the web app |
| **Git** | Clone this repo |

---

## Quick Start

### 1. Clone and set up Python

```bash
git clone https://github.com/nevesb/romc-data-extractor.git
cd romc-data-extractor

python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt

# Linux / macOS
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Install and configure LDPlayer

1. Download and install [LDPlayer 9](https://www.ldplayer.net/).
2. Inside LDPlayer, open the Google Play Store and install **Ragnarok M Classic Global**.
3. Launch the game at least once and let it download all the patches/assets.
4. Enable ADB in LDPlayer: **Settings > Other Settings > ADB debugging > Open local connection**.

> By default, LDPlayer exposes ADB at `127.0.0.1:5555`. The `adb` binary lives at
> `C:\LDPlayer\LDPlayer9\adb.exe` (Windows).

Verify the connection:

```bash
"C:\LDPlayer\LDPlayer9\adb.exe" devices
# Should show: emulator-5554  device  (or similar)
```

### 3. Copy the encryption DLL

The extractor needs `slua_encrypt.dll` from the game client to decrypt Lua tables. If it's not already in the repo:

```bash
# From the Windows PC client:
copy "C:\Program Files (x86)\XD\Ragnarok M Classic Global\ro_win_Data\Plugins\x86_64\slua_encrypt.dll" src\third_party\slua\

# Or pull it from LDPlayer via ADB:
adb pull /data/app/<package-folder>/lib/arm64/libslua_encrypt.so src/third_party/slua/
```

### 4. Extract data from LDPlayer via ADB

The all-in-one pipeline pulls files from the emulator, runs every extractor module, and exports JSONL files ready for MongoDB.

The `--package` flag is optional — the pipeline auto-detects between `com.gravity.romcg` and `com.gravityus.romgzeny.aos`:

```bash
# Windows (PowerShell)
$env:PYTHONPATH="src"
python -m romc_data_extractor.ldplayer_pipeline `
    --adb-path "C:\LDPlayer\LDPlayer9\adb.exe" `
    --tag 20250205 `
    --modules items monsters skills classes formulas icons buffs rewards

# Windows (cmd)
set PYTHONPATH=src
python -m romc_data_extractor.ldplayer_pipeline ^
    --adb-path "C:\LDPlayer\LDPlayer9\adb.exe" ^
    --tag 20250205 ^
    --modules items monsters skills classes formulas icons buffs rewards
```

Replace `20250205` with today's date (or any tag you like) to version your snapshots.

This produces:
- `exports/datasets/<tag>/` — structured JSON files
- `exports/mongo/<tag>/` — one `.jsonl` file per collection, ready for `mongoimport`

> **Tip:** If you already pulled the game files locally, use the direct CLI instead:
> ```bash
> python -m romc_data_extractor.cli --game-root "C:\Users\you\romc-android" --output data --modules items monsters skills classes formulas icons buffs rewards
> ```

### 5. Start MongoDB with Docker

```bash
cp .env.example .env   # adjust credentials if needed
docker compose up -d
```

This starts a **MongoDB 7.0** container on port `27017` with user `romc` / password `romc`.

### 6. Load extracted data into MongoDB

```bash
# Windows (PowerShell)
$env:PYTHONPATH="src"
python -m romc_data_extractor.mongo_loader `
    --mongo-uri "mongodb://romc:romc@localhost:27017" `
    --database romc `
    --dataset exports/mongo/20250205 `
    --drop-first

# Windows (cmd)
set PYTHONPATH=src
python -m romc_data_extractor.mongo_loader ^
    --mongo-uri "mongodb://romc:romc@localhost:27017" ^
    --database romc ^
    --dataset exports/mongo/20250205 ^
    --drop-first
```

You can limit which collections to import with `--collections items monsters`.

### 7. Run the web app (RuneAtlas)

The web interface lives inside this repo at `web/runeatlas/`:

```bash
cd web/runeatlas
cp .env.example .env
npm install
npm run dev
```

Open **http://localhost:3000** to browse items, monsters, skills, formulas, and buffs.

---

## Project Structure

```
romc-data-extractor/
├── src/
│   └── romc_data_extractor/     # Main Python package
│       ├── cli.py               # CLI entrypoint
│       ├── ldplayer_pipeline.py  # ADB pull + extract + mongo export
│       ├── mongo_loader.py      # JSONL → MongoDB importer
│       ├── config.py            # Game path configuration
│       ├── context.py           # Extraction context (translations, metadata)
│       ├── translation.py       # Multi-language translation system
│       ├── lua_table.py         # Lua table parser
│       ├── lua_decoder.py       # Lua decoding
│       ├── unity_utils.py       # UnityPy integration
│       ├── rom_des.py           # DES decryption
│       └── processors/          # Per-domain extractors
│           ├── items.py
│           ├── monsters.py
│           ├── skills.py
│           ├── classes.py
│           ├── formulas.py
│           ├── assets.py        # Icon extraction
│           ├── buffs.py
│           └── rewards.py
├── src/third_party/
│   ├── slua/slua_encrypt.dll    # Game encryption DLL (copy from client)
│   └── unluac/*.jar             # Lua decompiler
├── web/runeatlas/               # Next.js web app
├── docker-compose.yml           # MongoDB 7.0 container
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment template
├── setup.ps1                    # One-click setup (Windows/PowerShell)
├── setup.sh                     # One-click setup (Linux/macOS)
└── README.md
```

## Available Modules

| Module | Output | Description |
|---|---|---|
| `items` | `items.json` | Equipment, headgears, cards, consumables, furniture |
| `monsters` | `monsters.json` | Monsters with attributes, races, rewards |
| `skills` | `skills.json` | Skill definitions with translated descriptions |
| `classes` | `classes.json` | Job/class definitions |
| `formulas` | `formula_definitions.json`, `formula_usages.json` | Lua damage formulas from CommonFun |
| `icons` | `icon_manifest.json` + `icons/*.png` | Item/skill icon sprites |
| `buffs` | `buffs.json` | Buff/status effect definitions |
| `rewards` | `rewards.json` | Reward/loot drop definitions |

---

## License

This project is provided for educational and community purposes. Game assets and data belong to their respective owners (Gravity, XD Inc.).
