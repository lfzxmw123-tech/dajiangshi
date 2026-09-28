# LAN visual synchronization prototype

From `server`, run `npm ci` and `npm start`. Open the LAN URL printed by the server on each computer, for example `http://192.168.70.115:8098/`. Start a match in each browser. The root URL selects `?lan=1&mode=cs` automatically.

Port 8098 serves both the game and WebSocket connection. Allow Node.js on the Windows private-network firewall if other computers cannot connect. GitHub Pages does not run this Node server.

Other players appear as SWAT characters carrying rifles. Position, facing, idle/walk/run, reload, local death and shot flashes are synchronized. The current weapon is represented by a rifle for all remote players. Driving hides the remote on-foot avatar; vehicles are not shared.

This is a trusted LAN presentation test, not authoritative multiplayer combat: AI, hit detection, damage, health and waves remain local. Shots from a remote player do not damage you. All clients currently use the same spawn, so walk a few metres apart to see each other. Disconnected avatars are removed and clients retry their connection.

Validation: with the server running, execute `node lan-smoke.test.mjs` to exercise two connections, state broadcasts, disconnect cleanup, HTTP and scene byte-range requests.
