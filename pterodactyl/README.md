# Trilogy Hub on Pterodactyl

`egg-trilogy-hub.json` is a ready-made egg for Pterodactyl Panel 1.x (PTDL_v2).

## What the egg does

| | |
|---|---|
| Installation | Downloads `start.js`, `start.sh` and the default `server-config.json` from this repository. Container: `ghcr.io/parkervcp/installers:debian`. |
| Docker image | `ghcr.io/parkervcp/yolks:nodejs_22` |
| Startup | `TH_PORT={{SERVER_PORT}} node start.js` |
| First start | Downloads the signed server program from the official releases (about 45 MB) |
| Ready when | The console prints `players can join` |
| Stop | `shutdown` |

## 1. Import the egg

1. Download [`egg-trilogy-hub.json`](egg-trilogy-hub.json).
2. In the admin area open **Nests**. Create a nest (for example *Trilogy Hub*) or use an existing one.
3. Click **Import Egg**, choose the file and the nest, then click **Import**.

## 2. Create a server

1. **Servers > Create New**, choose the nest and the **Trilogy Hub** egg.
2. Allocation: one port. Trilogy Hub uses this port for **both TCP and UDP**. Allocations in Pterodactyl are
   forwarded for both protocols, so nothing else is needed in the panel. Make sure the node firewall allows TCP and UDP
   on that port.
3. Resources: 256 MB RAM and 1 GB disk are enough to start. The server uses about 75 MB of RAM when idle.
4. Variables:

   | Variable | Default | |
   |---|---|---|
   | Player slots (`TH_MAX_SLOTS`) | `32` | Player limit, written into `server-config.json` on every start |
   | Server key (`TH_SERVER_KEY`) | empty | `server_key` from the Trilogy Hub launcher. Empty keeps the key from `server-config.json`. |

5. Create the server. The installation takes a few seconds.

The port is always taken from the allocation and written into `server-config.json` on every start, so customers
cannot break it by editing the file.

## 3. First start

Start the server. The console shows:

```
[start] brak TrilogyHubServer - pobieram najnowszy serwer
[start] pobrano serwer 2.0.26 (GitHub), podpis i suma sprawdzone
...
Server is listening on port 7777 - players can join.
```

(The two `[start]` lines are Polish: "downloading the latest server" and "downloaded, signature and checksum verified".)

The panel marks the server as running when `players can join` appears.

## 4. For customers

- **Server on the public list:** create the server in the Trilogy Hub launcher (**Servers > Create server**) and paste
  its `server_key` into the *Server key* variable, or upload the `server-config.json` from **Prepare a hosting
  package (FTP)** in the launcher.
- **Name, description, password, voice chat:** edit `server-config.json` in the file manager, then restart.
- **Scripts:** upload resources into `resources/` (file manager or SFTP), then type `restart <resource>` in the console.
- **Admins:** `admins.xml`, then `reload admins` in the console.

## Updates

The server updates itself (see the main [README](../README.md#updates)). A reinstall from the panel downloads fresh
`start.js` files and deletes the server program, so the next start gets the latest release. `server-config.json`,
`admins.xml`, `resources/` and the logs are kept.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `nie udalo sie pobrac serwera` ("could not download the server") | The node has no outbound HTTPS to GitHub. Allow `github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com`. |
| Players see "server not responding" | The port is not reachable over TCP or UDP. Check the node firewall. |
| The server is not on the list | The `server_key` is missing or wrong. Check the console: the server prints why the list refused it. |
| `The same server_key also reports from another address` | The same server runs somewhere else too (for example on the customer's PC). Only one copy may run. |
