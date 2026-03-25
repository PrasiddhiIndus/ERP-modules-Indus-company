# Troubleshooting: App works on one laptop but not fetching data on another

If the website runs on one laptop but **does not fetch data** (login fails, lists empty, or "Cannot load data") on another, use this checklist.

---

## "Failed to fetch" or "TypeError: Failed to fetch" on login

If you see **Failed to fetch** when clicking Login (and no VPN, same code as the working laptop):

1. **Create `.env`** in the project root (same folder as `package.json`). Copy from `.env.example`:
   ```bash
   copy .env.example .env
   ```
   (On Mac/Linux: `cp .env.example .env`.)
2. Open `.env` and set **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** (copy from the working laptop if needed).
3. **Restart the dev server** — Vite only reads `.env` at startup:
   ```bash
   npm run dev
   ```
4. Hard refresh the page (Ctrl+Shift+R). Try login again.

If it still fails, see **§1 Environment variables** and **§3 Network, firewall, VPN** below.

---

## "Failed to fetch" but it works with VPN (India / region-specific)

If **login or data fetch fails without VPN but works when you turn on a VPN**, the cause is usually **ISP or regional connectivity** to Supabase, not your code or `.env`.

Supabase has reported [network connectivity issues for some users in India](https://status.supabase.com/): some ISPs there do not serve correct DNS for Supabase, so the browser cannot reach `*.supabase.co`.

**Workarounds (no code changes needed):**

1. **Use a VPN** (you’ve confirmed this works.)
2. **Switch to a different DNS** on this PC so you don’t need a VPN:
   - **Cloudflare:** [1.1.1.1](https://1.1.1.1) — set your system or router DNS to `1.1.1.1` and `1.0.0.1`
   - **Google:** [Public DNS](https://developers.google.com/speed/public-dns) — `8.8.8.8` and `8.8.4.4`
   - **Quad9:** [quad9.net](https://quad9.net/) — `9.9.9.9`

   On **Windows:** Settings → Network & Internet → your connection → Edit DNS → set the addresses above.

For official updates, check **[Supabase Status](https://status.supabase.com/)**.

---

## 1. Environment variables (most common)

The app needs Supabase URL and key from a **`.env`** file. Vite reads `.env` only when you **start** the dev server.

**On the laptop where it’s not working:**

1. In the project root, confirm there is a **`.env`** file (same folder as `package.json`).
2. Open `.env` and ensure these two lines exist (use the same values as on the working laptop):
   ```env
   VITE_SUPABASE_URL=https://wbyzhknaqcjqqtwopupl.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```
3. Copy the **exact** values from the working laptop’s `.env` if needed. Do not add quotes around the values.
4. **Restart the dev server** after changing `.env`:
   - Stop it (Ctrl+C), then run again:
   ```bash
   npm run dev
   ```
5. Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R).

If `.env` is missing or wrong, the app will show **"Environment not configured"** or fail to reach Supabase.

---

## 2. How you open the app (URL / port)

- Use the **same URL** as on the working laptop when possible (e.g. `http://localhost:5173`).
- If you open the app using another URL (e.g. `http://192.168.1.10:5173` or another machine’s IP):
  - In **Supabase Dashboard** → **Authentication** → **URL Configuration**, add that URL to:
    - **Site URL** (if it’s the main entry)
    - **Redirect URLs** (e.g. `http://192.168.1.10:5173/**`).
  - Otherwise login or redirects may fail and it can look like “data not loading”.

---

## 3. Network, firewall, VPN

- The app talks to `https://wbyzhknaqcjqqtwopupl.supabase.co`. If that is blocked, nothing will load.
- **On the laptop where it fails:**
  - If it **works with VPN** but not without: see the section above (**"Failed to fetch" but it works with VPN**) — use VPN or switch to Cloudflare/Google/Quad9 DNS.
  - Try another network (e.g. mobile hotspot) to see if it’s network-specific.
  - If you use a VPN and it *breaks* connectivity, try turning it off; if it *fixes* connectivity (e.g. in India), keep using VPN or change DNS as above.
  - Check **firewall / antivirus**: allow the browser and/or Node for `localhost` and ensure outbound HTTPS is not blocked.
- In the browser, open **Developer Tools (F12)** → **Console**. Look for errors like:
  - `Failed to fetch`
  - `NetworkError`
  - `CORS` errors  
  Those indicate a connectivity or CORS issue (see next section).

---

## 4. Supabase CORS / allowed origins

- In **Supabase Dashboard** → **Authentication** → **URL Configuration**, the **Site URL** and **Redirect URLs** must include the URL you use to open the app (e.g. `http://localhost:5173` or `http://192.168.x.x:5173`).
- If you use a new origin (different host or port), add it there; otherwise auth and API calls can be blocked and data will not load.

---

## 5. Browser and cache

- Try another browser or an **incognito/private** window on the same laptop.
- Clear **site data** for this app (e.g. in Chrome: Application → Storage → Clear site data) and try again.
- Disable **browser extensions** that block requests (ad blockers, privacy tools) for this site and retry.

---

## 6. Quick checks on the machine where it fails

1. **Console:** F12 → Console. Note any red errors when you load the app or try to log in.
2. **Network:** F12 → Network. Reload, try login. Check if requests to `supabase.co` are sent and whether they return 200 or an error (403, 404, CORS, etc.).
3. **App message:** If the app shows **“Cannot load data”** with a short message, that text is the first hint (e.g. “Environment not configured” → fix `.env` and restart dev server; “Network error” → check internet/firewall/VPN).

---

## Summary

| Symptom | Likely cause | Action |
|--------|----------------|--------|
| "Environment not configured" or placeholder Supabase | Missing or wrong `.env` | Add/copy `.env`, restart `npm run dev` |
| Works on one PC, not on another | Different `.env` or no restart after adding `.env` | Same `.env` on both, restart dev server on the failing PC |
| Login fails or redirects wrong | URL not allowed in Supabase | Add current URL to Site URL and Redirect URLs in Supabase |
| "Failed to fetch" / "Network error" | Network, firewall, or VPN | Try other network, disable VPN, check firewall/antivirus |
| Works with VPN, fails without (e.g. India) | ISP/DNS not resolving Supabase | Use VPN or switch DNS to Cloudflare (1.1.1.1), Google (8.8.8.8), or Quad9 (9.9.9.9) — see section above |
| CORS errors in console | Origin not allowed | Add that origin in Supabase URL configuration |

If you’ve done the above and it still doesn’t fetch data, share the **exact message** shown in the app and one or two **Console** errors from the laptop where it fails.
