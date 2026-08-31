# Server hardening runbook

Written after a scan of the production host found nine services listening on
`0.0.0.0` and no firewall running.

The repository half of this is already done — every port either compose file
publishes now binds to `127.0.0.1`, and the console sends a full set of security
headers. Everything below has to be run **on the server**, because it concerns
services this repository does not own.

Work top to bottom. Each step says what it fixes and how to check it worked.

---

## Before you start: the Docker trap

Docker writes its own `iptables` rules and inserts them **ahead of** ufw's. A
published container port is therefore reachable from the internet even when
`ufw status` shows it denied — the firewall reports success and the port stays
open.

So for anything in a `docker-compose.yml`, **the bind address is the control**,
not the firewall. That part is already committed:

```yaml
- "127.0.0.1:3307:3306"   # not "3307:3306"
```

It takes effect on the next `docker compose up -d`. ufw below is for the
services that are *not* containers.

---

## 1. Ollama — open to the internet, no authentication

`11434` answers anyone on the internet with your model list, and will run
inference for them at your expense. Ollama has no auth of its own, so the only
control is the bind address.

```bash
systemctl edit ollama
```

Add:

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
```

Then:

```bash
systemctl restart ollama
ss -tlnp | grep 11434          # expect 127.0.0.1:11434, not *:11434
```

Do this one first. It is the only service on the list that hands a stranger free
compute.

---

## 2. The two databases

`3306` (mariadbd, on the host) and `3307` (the console's MySQL, in Docker).

**3307** is handled by the compose change — redeploy and confirm.

**3306** is a host service. Edit `/etc/mysql/mariadb.conf.d/50-server.cnf`:

```ini
bind-address = 127.0.0.1
```

```bash
systemctl restart mariadb
ss -tlnp | grep 3306           # expect 127.0.0.1 only
```

If anything genuinely needs remote database access, it should reach it over an
SSH tunnel, not an open port.

---

## 3. The legacy api-server on 5000

`/home/deploy/tenderlogix-autocad/artifacts/api-server`, running 58 days,
listening on `*:5000`, and served over **plain HTTP on the bare IP** by four
duplicate nginx blocks.

Two problems: the port is directly reachable, and the vhost in front of it has
no TLS at all — which is a standing injection window of exactly the kind that
produced the captcha.

- If it is still needed: bind it to `127.0.0.1:5000` and give its vhost a
  certificate, or serve it under a subdomain that already has one.
- If it is not: stop it and delete the four `server_name 74.208.182.201`
  blocks.

Decide which. Leaving a plain-HTTP vhost on the public IP undoes part of the
work below.

---

## 4. rpcbind and cockpit

```bash
systemctl disable --now rpcbind rpcbind.socket   # unless NFS is in use
systemctl disable --now cockpit.socket           # or restrict 9090 to your IP
```

`rpcbind` on a public interface is a well-known reflection-amplification source
and this host has no apparent need for it.

---

## 5. The firewall

There is none. Add one — **allow SSH before enabling it**, and keep a second
terminal open until you have confirmed you can still log in.

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

Then, from a **second** terminal, confirm you can still `ssh` in before closing
the first. Every rule above is reversible; being locked out is not.

---

## 6. nginx: HSTS on every TLS vhost

The app now sends HSTS itself, but nginx answers the `http -> https` redirects
and its own error pages without ever reaching the app. Add to each `listen 443`
block:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

`always` matters — without it the header is skipped on error responses, which
are exactly the ones an attacker can provoke.

```bash
nginx -t && systemctl reload nginx
```

`nginx -t` first, every time. A reload with a bad config takes the site down.

Do **not** add `preload` to HSTS yet. It submits the domain to a list compiled
into browsers and is effectively irreversible; it is worth doing, but only once
every subdomain is known to be HTTPS-only.

---

## 7. nginx version

`nginx/1.20.1`, released 2021. Update it, and stop it announcing itself:

```nginx
server_tokens off;
```

---

## Verifying

From a machine that is **not** the server:

```bash
# Every one of these should now fail to connect.
for p in 3000 3100 3306 3307 5000 8090 9090 11434 111; do
  timeout 4 bash -c "</dev/tcp/74.208.182.201/$p" 2>/dev/null \
    && echo "$p STILL OPEN" || echo "$p closed"
done

# And the headers should be present on both consoles.
curl -sI https://host.preckon.com | grep -iE 'strict-transport|content-security|x-frame'
curl -sI https://app.preckon.com  | grep -iE 'strict-transport|content-security|x-frame'
```

Expect `closed` on all nine and three headers on each host.

---

## What this does and does not fix

**Does.** It closes the injection window that produced the captcha, removes a
database and an unauthenticated inference server from the public internet, and
stops the console being framed or its assets sniffed.

**Does not.** It is not a response to a compromise. Nothing here establishes
whether anything reached those open ports while they were open. If that question
matters — and with an open MySQL it reasonably might — it needs its own look at
the auth logs, the database's own logs, and the `audit_chain`, which is a
separate piece of work from shutting the doors.
