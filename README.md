# LeadSum - Meta Ads Lead & Campaign Intelligence

Dashboard avanzata per il monitoraggio e il riepilogo in tempo reale di tutte le metriche e contatti delle campagne **Meta Ads** (Facebook & Instagram).

---

## 🎯 Metriche Chiave Tracciate

1. **Contatti Totali Ricevuti (Lead)**:
   - Breakdown tra Moduli nativi Facebook/IG, Chat WhatsApp / Messenger / Direct e conversioni Pixel Web.
2. **Costo Medio per Contatto (CPL)**:
   - Calcolo istantaneo del CPL medio con indicatore di performance rispetto alla soglia target.
3. **Spesa Giornaliera**:
   - Spesa di Oggi in tempo reale, Spesa di Ieri, Spesa Media Giornaliera e Totale Periodo.
4. **Budget Giornaliero Attivo & Pacing**:
   - Rilevamento automatico e somma di tutti i budget attivi CBO (livello campagna) e ABO (livello gruppo inserzioni) con barra di pacing %.
5. **Configuratore Soglia Costo Inserzioni (XX €)**:
   - Impostazione di una soglia dinamica per evidenziare immediatamente le inserzioni con costo per lead o spesa oltre il limite desiderato.
   - Azione rapida per mettere in pausa con 1 click le inserzioni critiche.

---

## 🛠️ Installazione Locale

1. Clona la repository:
   ```bash
   git clone https://github.com/cvalese1301/LeadSum.git
   cd LeadSum
   ```

2. Crea il file `.env` partendo da `.env.example`:
   ```env
   META_ACCESS_TOKEN=tuo_meta_access_token
   META_AD_ACCOUNT_ID=act_tuo_ad_account_id
   PORT=4173
   ```

3. Avvia l'applicazione:
   ```bash
   node server.js
   ```

4. Apri nel browser: `http://localhost:4173`

---

## ☁️ Deploy su Render.com

1. Crea un nuovo **Web Service** su [Render.com](https://render.com).
2. Connetti la repository GitHub `https://github.com/cvalese1301/LeadSum`.
3. Configura le impostazioni:
   - **Environment**: `Node`
   - **Build Command**: *(lascia vuoto)*
   - **Start Command**: `node server.js`
4. Nella sezione **Environment Variables**, aggiungi:
   - `META_ACCESS_TOKEN`: il tuo access token Meta
   - `META_AD_ACCOUNT_ID`: il tuo account id (es. `act_123456789`)
   - `PORT`: `4173`

---

## ⚠️ Note di sicurezza

Questo progetto è pensato per uso interno. Tieni il repository privato se contiene log, configurazioni o dettagli operativi sensibili.

Non committare mai:

- `.env`
- access token
- app secret
- page token
- screenshot che mostrano token o configurazioni private

## Note sui token

I token generati dal Graph API Explorer scadono rapidamente. Per un uso piu comodo, usa un long-lived user token e recupera da quello i page token aggiornati.

Se un token o un app secret viene condiviso per errore, rigeneralo dal pannello Meta.
