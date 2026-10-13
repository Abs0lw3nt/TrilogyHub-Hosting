# Trilogy Hub Server - hosting kit

[Trilogy Hub](https://trilogy-hub.com) is a multiplayer platform for **GTA: San Andreas - The Definitive Edition**.
Players join servers through the Trilogy Hub launcher, and every server runs its gameplay as Lua resources.

This repository contains everything a hosting provider needs to run Trilogy Hub servers on Linux or Windows.
The server program itself is not stored here: `start.js` downloads the latest **signed** build from the
[official releases](https://github.com/Abs0lw3nt/TrilogyHub-Releases/releases) on the first start, and from then on
the server keeps itself up to date.

| File | Purpose |
|---|---|
| `start.js` | Starter: downloads and verifies the server program, applies panel settings, starts the server |
| `start.sh` / `start.bat` | Shortcuts for `node start.js` on Linux / Windows |
| `server-config.example.json` | Full configuration with default values |
| `pterodactyl/egg-trilogy-hub.json` | Ready-made Pterodactyl egg ([guide](pterodactyl/README.md)) |

## System requirements

| | |
|---|---|
| OS | **Linux x64** with glibc 2.28 or newer (Debian 10+, Ubuntu 20.04+, RHEL / Rocky / Alma 8+) or **Windows x64** (Windows 10, Windows Server 2016 or newer). ARM is not supported. |
| Node.js | 18 or newer, only to run `start.js`. The server program has its own runtime built in. |
| RAM | About 75 MB for an idle server with the default resources. Plan more for many players and large scripts. |
| CPU | The game loop runs on one core. One vCPU per server is enough for a typical server. |
| Disk | About 100 MB for the server program, plus the same again for the backup kept during an update. |
| Network | **One port, TCP and UDP**, the same number (default `7777`). Outbound HTTPS to `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com` and `trilogy-hub.com` (downloads, updates, server list). |

The server does not need a database, a GPU or the game files.

## Quick start (Linux)

```bash
sudo mkdir -p /opt/trilogyhub && sudo chown "$USER" /opt/trilogyhub
cd /opt/trilogyhub
curl -fsSLO https://raw.githubusercontent.com/Abs0lw3nt/TrilogyHub-Hosting/main/start.js
TH_PORT=7777 node start.js
```

On the first start the server:

1. downloads `TrilogyHubServer` (`TrilogyHubServer.exe` on Windows) and checks its Ed25519 signature and SHA-256,
2. creates `server-config.json`, `admins.xml` and `resources/` with the starter resources,
3. prints `Server is listening on port 7777 - players can join.`

Open the port for both protocols, for example `ufw allow 7777/tcp && ufw allow 7777/udp`.

On Windows, put `start.js` and `start.bat` into an empty folder and run `start.bat`.

### Running as a service (systemd)

```ini
[Unit]
Description=Trilogy Hub server
After=network-online.target

[Service]
WorkingDirectory=/opt/trilogyhub
ExecStart=/usr/bin/node start.js
Restart=always
User=trilogyhub

[Install]
WantedBy=multi-user.target
```

`systemctl stop` sends SIGTERM, and the server shuts down cleanly.

### Several servers on one machine

Each server needs its own folder and its own port. Copy `start.js` into a new folder and start it with a different `TH_PORT`.

## Configuration

Settings live in `server-config.json` in the server folder. See `server-config.example.json` for every key.

| Key | Meaning |
|---|---|
| `title`, `subtitle` | Name (3-40 characters) and description (up to 80) on the server list |
| `port` | Game port, TCP and UDP |
| `public_port` | External port, if the host maps a different external port to `port` |
| `max_slots` | Player limit |
| `server_key` | Connects the server to the Trilogy Hub server list (see below) |
| `password` | Server password, empty = open server |
| `auto_update` | `true` (default) = the server updates itself |
| `disabled_resources` | Resources that do not start with the server |
| `voice` | Voice chat settings (mode, range, quality) |

### Panel settings (environment variables)

`start.js` writes these values into `server-config.json` before every start, so a control panel can manage them.
Empty or unset variables change nothing.

| Variable | Key |
|---|---|
| `TH_PORT` | `port` |
| `TH_MAX_SLOTS` | `max_slots` |
| `TH_SERVER_KEY` | `server_key` |

### Server list and `server_key`

The customer creates the server in the Trilogy Hub launcher (**Servers > Create server**). The launcher gives the
server its `server_key`, and **Prepare a hosting package (FTP)** exports a `server-config.json` that already contains
it. Upload that file, or paste the key into the panel (`TH_SERVER_KEY`). Without a key the server still works, but it
does not appear on the public list. The key is a secret: only the server owner should see it.

## Updates

- The server checks for a new version every 15 minutes.
- Every release is signed. A file without a valid signature is rejected.
- A new version is installed when the server is empty. When players stay online, it waits up to 2 hours and
  counts down in the chat.
- If the new version crashes right after the start, the server goes back to the previous one by itself.
- Updates restart the server inside the same process tree: the panel does not see a stop.

To turn updates off, set `"auto_update": false`. To force a fresh download, delete `TrilogyHubServer` and start the
server again.

The files in this repository are updated automatically with every Trilogy Hub release.

## Console

Commands are typed into the server console (a terminal, or the console of the panel):

`help`, `players`, `resources`, `start <resource>`, `stop <resource>`, `restart <resource>`, `say <text>`,
`kick <nick> [reason]`, `reload admins`, `shutdown`.

## Files in the server folder

| Path | |
|---|---|
| `server-config.json` | Configuration |
| `admins.xml` | Admin permissions (by player Client ID) |
| `resources/` | Lua resources. Customers upload their scripts here, for example over SFTP or FTP. |
| `logs/latest.log` | Current log. Older logs are deleted after 7 days. |
| `.th-update/`, `.th-runtime/` | Working files of the updater. Do not delete them while the server runs. |

## Documentation

- Lua API for server scripts: https://trilogy-hub.com/en/docs/
- Running your own server: https://trilogy-hub.com/en/servers/
- Pterodactyl: [pterodactyl/README.md](pterodactyl/README.md)

## Contact

kontakt@trilogy-hub.com - Discord: https://discord.gg/E9sNnfpC4A
