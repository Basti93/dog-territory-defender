## ADDED Requirements

### Requirement: Household is the unit of sharing
The system SHALL group one or more players into a household that owns exactly one dog, one Home Range, one set of Territories and one Den. A household SHALL be created only by an operator command run on the server host; no network endpoint SHALL create households. Players, including the first one, SHALL join through a single-use invite code that expires within 24 hours. The number of players per household SHALL be limited by server configuration (default 4).

#### Scenario: Second player joins with an invite code
- **WHEN** a player enters a valid, unexpired, unused invite code and a display name
- **THEN** the system SHALL create a player and a device token for them in that household, mark the code as used, and the new device SHALL receive the household's full current state

#### Scenario: No network path creates a household
- **WHEN** any unauthenticated or authenticated request tries to create a household over the network
- **THEN** the server SHALL answer 401 or 404 as for any other unknown route and create nothing

#### Scenario: Invite code reuse or expiry
- **WHEN** an invite code that has already been used or has expired is submitted
- **THEN** the system SHALL refuse it without revealing whether the code ever existed, and repeated failures from one client SHALL be rate-limited

#### Scenario: Household is full
- **WHEN** a valid code is submitted for a household already at its player limit
- **THEN** the join SHALL be refused with a friendly message and no player SHALL be created

### Requirement: Per-device bearer authentication behind a replaceable seam
Every API call except invite join and the minimal health check SHALL require a per-device bearer token. The server SHALL store only a hash of each token, and a device's token SHALL be revocable without affecting other devices. Routes SHALL obtain the caller's identity only through a single authentication interface so that another identity provider can replace the token scheme without changing routes, commands or tables.

#### Scenario: Revoked or unknown token
- **WHEN** a request carries a revoked or unknown token
- **THEN** the server SHALL answer 401 and perform no action

#### Scenario: Tenant isolation
- **WHEN** an authenticated device requests any data
- **THEN** the server SHALL return only rows of that device's own household

### Requirement: Offline-first with a local source of truth
The app SHALL keep its local SQLite database as the source of truth and SHALL remain fully playable with no network or server. Changes SHALL be queued in a persistent outbox and delivered when the server is reachable, oldest first. The app SHALL NOT show offline banners, queue counts, or any copy implying the player is behind or at fault.

#### Scenario: Walk finished without connectivity
- **WHEN** a walk is finished while the server is unreachable
- **THEN** the walk SHALL be saved, painted and rewarded locally exactly as without sync, and SHALL be delivered automatically at a later sync

#### Scenario: Server unreachable during startup
- **WHEN** the app starts and the server cannot be reached
- **THEN** every screen SHALL behave as it does without a household, and no error SHALL be shown to the player

#### Scenario: Sync only in the foreground
- **WHEN** the app is in the background
- **THEN** it SHALL NOT perform sync work, and it SHALL sync on its next foreground

### Requirement: Idempotent commands
Every state-changing request SHALL carry a client-generated identifier. The server SHALL execute a command with a given identifier at most once per household and SHALL return the stored original result for any repeat.

#### Scenario: Retry after lost response
- **WHEN** a client resends a walk or upgrade command whose first response was lost
- **THEN** the server SHALL return the first result and SHALL NOT award, spend or paint a second time

### Requirement: Server-authoritative economy
Treats, XP, Level, building levels, the manual-log quota and territory assignment SHALL be changed only by the server, in response to commands, using the same formulas and balance configuration as the single-player game. The app MAY show an optimistic local result immediately and SHALL replace its local Den state with the server's state whenever the server's revision is newer.

#### Scenario: Two players spend from one balance
- **WHEN** both players issue an upgrade that the shared balance can pay for only once
- **THEN** the server SHALL accept the first command it receives and reject the second with an insufficient-treats result, and the second device SHALL show its Den as it now is with a gentle explanation naming the partner's action, never an error tone

#### Scenario: Single-device play matches single-player
- **WHEN** one device finishes the same walks in the same order with and without sync
- **THEN** the treats, XP and Level SHALL be identical

#### Scenario: Passive treats accrue on the server
- **WHEN** a household's Den is read or changed
- **THEN** the server SHALL first apply passive accrual from the stored last-tick time using the shared formula

### Requirement: Walks are append-only
A walk SHALL be identified by a client-generated id and SHALL be stored at most once. Deleting a walk SHALL hide it for the household but SHALL NOT remove painted cells from the Home Range.

#### Scenario: Duplicate walk upload
- **WHEN** the same walk is uploaded twice
- **THEN** exactly one walk SHALL exist and the Home Range and Den SHALL change only once

#### Scenario: Deleted walk keeps its ground
- **WHEN** a player deletes a synced walk
- **THEN** the walk SHALL disappear from the household's history and every cell it painted SHALL remain in the Range

### Requirement: Home Range merges without conflict
Home Range cells SHALL merge independently of arrival order. A cell's `visits` SHALL equal the number of distinct local calendar days (in the household's timezone) on which any household member walked it, plus any founding-import baseline. `lastTracked` and `lastRefreshed` SHALL be the latest of all contributing timestamps. A device applying server cells SHALL keep the maximum of its local and the server's `visits`, `lastTracked` and `lastRefreshed`.

#### Scenario: Both players walk one street on one day
- **WHEN** two household members walk the same cell on the same local day
- **THEN** that cell's `visits` SHALL increase by exactly one for that day

#### Scenario: Two phones walk the same street on different days while offline
- **WHEN** each phone paints the same cell on a different day and both later sync in either order
- **THEN** the cell SHALL end with two distinct visit days regardless of order

#### Scenario: Range never shrinks
- **WHEN** any merge, replay or walk deletion occurs
- **THEN** no cell SHALL be removed and no cell field SHALL decrease

### Requirement: Territories are resolved once, by the server
The server SHALL assign new cells to Territories, create Territories and merge Territories using the same rules as single-player play, so two phones can never create two Territories for the same ground. A Territory's name SHALL come from the walking device's suggestion, falling back to the standard fallback name.

#### Scenario: Both phones discover the same ground offline
- **WHEN** both phones walk the same unclaimed street while offline and later sync
- **THEN** exactly one Territory SHALL cover that ground

### Requirement: Change feed by cursor
The server SHALL record every accepted change as an append-only event with an increasing sequence number. A client SHALL fetch events after its last applied sequence number, optionally waiting up to 25 seconds for new ones, and applying an event SHALL be idempotent. A client SHALL be able to rebuild all household state from a snapshot.

#### Scenario: Partner's walk reaches the other phone
- **WHEN** one player finishes and syncs a walk while the other app is in the foreground
- **THEN** the other device SHALL receive the walk, Range changes and Den changes through its next pull, without rerunning rewards locally

#### Scenario: Duplicate event delivery
- **WHEN** the same event is applied twice
- **THEN** local state SHALL be identical to applying it once

### Requirement: Founding import
The first device of a household SHALL be able to upload its existing local data once so that no existing play is lost. Imported cells SHALL carry their existing `visits` as a baseline, and imported walks SHALL NOT be re-rewarded.

#### Scenario: Owner founds the household with existing progress
- **WHEN** the founding device imports its walks, Range, Territories, Den and dog
- **THEN** the household SHALL show the same Range, Level and treats as that device had, and a second import SHALL be refused

#### Scenario: Joining on a device with local data
- **WHEN** a device that already holds local game data joins an existing household
- **THEN** the app SHALL ask for confirmation, offer to share a backup first, and only then replace local data with the household's

### Requirement: Partner events on the Doorstep, cooperative and guilt-free
The Doorstep's "while you were out" strip MAY include one line about another household member's walk within the last 48 hours, phrased only with the partner's name, the dog's name and a coarse part of the day (this morning, this afternoon, this evening, yesterday). No event line SHALL contain distances, durations, counts, rankings or comparisons between players, SHALL mention that the viewing player has not walked, or SHALL appear for walks older than 48 hours. The line SHALL count toward the strip's existing line cap.

#### Scenario: Partner walked this morning
- **WHEN** another member's walk of this morning has been received and the strip has room
- **THEN** it SHALL show a line like "Lisa was out with Buddy this morning"

#### Scenario: Nothing recent
- **WHEN** the partner's latest walk is older than 48 hours
- **THEN** the strip SHALL show no partner line and no "quiet" message

### Requirement: Household play preserves the anti-snowball invariants
Joining a household SHALL NOT grant any new bonus. Beginner's Luck and any account-age rule SHALL use the household's creation date. The once-per-cell-per-day visit credit and the manual-log quotas SHALL apply to the household as a whole. No capped percentage bonus SHALL depend on household size.

#### Scenario: Second player joins after day 30
- **WHEN** a player joins a household older than 30 days
- **THEN** no new Beginner's Luck window SHALL start

#### Scenario: Manual-log quota is shared
- **WHEN** one member has used the day's two manual logs
- **THEN** the other member's manual logs SHALL be refused for that day with the usual friendly quota message

### Requirement: Nearby endpoint contract
The server SHALL expose an authenticated nearby endpoint whose item shape is fixed from the first version and whose items are always flagged as simulated (`kind` = `bot`). The endpoint SHALL NOT return real households and its contract SHALL contain no field able to carry another real household's coordinates. Until the neighbour-dogs capability is enabled the list SHALL be empty. Households SHALL be non-discoverable by default.

#### Scenario: Nearby request before neighbours exist
- **WHEN** an authenticated device requests nearby households and neighbour dogs are disabled
- **THEN** the server SHALL return an empty list in the agreed shape, and the app SHALL render nothing for an empty list

#### Scenario: Cross-household data requires fuzz
- **WHEN** a future change exposes any real household's location-derived data to another household
- **THEN** it SHALL apply the 100 metre start-point fuzz and coarse rounding and SHALL expose no raw coordinates

### Requirement: Personal stats stay local
Per-player stats and achievements SHALL remain on the player's own device in this version. A household member's walks SHALL count for the shared Den and Range but SHALL NOT change another member's local stats or achievements.

#### Scenario: Partner walks do not change my badges
- **WHEN** a partner's walk is received from the server
- **THEN** the receiving device's personal stats and achievements SHALL be unchanged

### Requirement: Privacy and erasure
The system SHALL store only a display name, a device label and game data per player, SHALL record each player's consent to sharing within the household at join time, and SHALL keep coordinates, tokens and invite codes out of logs. Access logs MAY contain client IP addresses and SHALL be retained for no longer than about 14 days. A player SHALL be able to leave a household, and a household SHALL be erasable in full, including all walk routes.

#### Scenario: Player leaves
- **WHEN** a player leaves
- **THEN** their device tokens SHALL be revoked and their display name anonymised

#### Scenario: Household erased
- **WHEN** a household erasure is requested by an authenticated member
- **THEN** every row of that household SHALL be deleted

#### Scenario: Backup never contains credentials
- **WHEN** the app exports a Backup file while joined to a household
- **THEN** the file SHALL NOT contain the device token or server credentials

### Requirement: Backup and Restore coexist with sync
File Backup SHALL keep working. Restore SHALL be unavailable while a device is joined to a household, with an explanation that leaving the household comes first, because restoring over synced state would fork history.

#### Scenario: Restore while joined
- **WHEN** a joined player opens Restore
- **THEN** the app SHALL explain that they must leave the household first and SHALL NOT replace data

### Requirement: Operable and portable by default
The server SHALL read all configuration from environment variables, keep no state outside PostgreSQL, expose a liveness and a readiness endpoint, log structured JSON to standard output, apply versioned SQL migrations at start, and run from one container image on any container host. On the home server it SHALL obey the owner's shared server rules: its own folder, compose project name, database and network, ports 7000-7099 bound to 127.0.0.1 only, total memory limit of at most about 2 GiB, its own Tailscale sidecar node as the only entry (with Funnel enabled on that node only, never on the host node), daily database dumps to its own folder with 14-day rotation, and secrets only in a mode-600 environment file.

#### Scenario: Health checks
- **WHEN** the database is unreachable
- **THEN** the liveness endpoint SHALL still answer success and the readiness endpoint SHALL answer failure

#### Scenario: Restore on another host
- **WHEN** a database dump is restored into a fresh PostgreSQL and the same image is started with its connection string
- **THEN** the service SHALL serve the same household data without code changes

#### Scenario: Only the intended door is public
- **WHEN** the home deployment is running with defaults
- **THEN** the API SHALL be reachable from the internet only through the project's own sidecar node over HTTPS, the database and the readiness listener SHALL be reachable only from the host's loopback or the private container network, and the host Tailscale node's serve and Funnel configuration SHALL be unchanged

#### Scenario: Kill switch
- **WHEN** the operator stops the api container or removes Funnel from the sidecar's serve configuration
- **THEN** the service SHALL be unreachable from the internet, and the app SHALL continue to play offline

### Requirement: Hardened public exposure
Because the API is reachable from the public internet, the server SHALL accept unauthenticated requests only for the health endpoint and invite join, SHALL answer every other request without a valid token with the same 401 response (including requests to unknown paths), and SHALL NOT serve static files, directory listings or API documentation. Device tokens SHALL be 32 random bytes and stored only as hashes. Invite join attempts SHALL be limited to 5 per minute and 20 per day per client IP, with a global ceiling. Every token SHALL be rate limited, request bodies SHALL be size limited and accepted only as JSON, security headers SHALL be set, cross-origin access SHALL be disabled, and clients with repeated failed authentications SHALL be banned for an increasing time using a ban list stored in the database. Access logs SHALL be structured and include the client IP and the route template but never tokens, invite codes or coordinates. TLS SHALL be terminated by the sidecar. No administrative secret SHALL be accepted over the network.

#### Scenario: Unknown path without a token
- **WHEN** an unauthenticated client requests `/admin`, `/v1/anything` or `/`
- **THEN** the server SHALL answer 401 with the same body as for a missing token, revealing nothing about which routes exist

#### Scenario: Health is minimal
- **WHEN** anyone requests the public health endpoint
- **THEN** it SHALL return a fixed minimal body without version or dependency details, and readiness SHALL NOT be reachable through the public proxy

#### Scenario: Join brute force
- **WHEN** one IP submits more than 5 join attempts within a minute or more than 20 within a day
- **THEN** further attempts SHALL be answered 429 with Retry-After, without revealing whether any code was valid

#### Scenario: Repeated bad tokens
- **WHEN** a client IP fails authentication 10 times within 10 minutes
- **THEN** that IP SHALL be refused for a period that increases with repeats, the ban SHALL survive a server restart, and the sidecar's own address SHALL never be banned

#### Scenario: Oversized or non-JSON body
- **WHEN** a request body exceeds its route's limit or is not `application/json`
- **THEN** the server SHALL refuse it (413 or 415) before parsing it

#### Scenario: Stolen token
- **WHEN** the operator revokes a device
- **THEN** that device's token SHALL stop working immediately and the other devices of the household SHALL be unaffected

### Requirement: Shared game code has one definition
Economy formulas, balance configuration, grid maths and territory clustering used by the server SHALL be the same source files the app uses, and an automated check SHALL fail if any of them gains a dependency on React Native, Expo, localisation or app storage.

#### Scenario: Purity check
- **WHEN** a shared file imports a forbidden module
- **THEN** the app's test run SHALL fail
