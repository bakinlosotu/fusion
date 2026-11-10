[README.md](https://github.com/user-attachments/files/34642206/README.md)
# Fusion

**One chat app for GPT, Gemini, Claude and Grok, powered by your own API keys.**

Fusion runs entirely in your browser. You add your own provider keys, pick a model, and chat. You can ask questions about your documents, draft replies to your emails, and pull in live web results. There is no backend, no account and no database: your keys, chats and documents never leave your device except to go straight to the provider you chose.

\---

## Features

* **Multi-model chat**: OpenAI (GPT), Google Gemini, Anthropic (Claude) and xAI (Grok). Switch models mid-conversation and the full history carries over.
* **Live model lists**: models are loaded from each provider using your key, so new models show up automatically. A custom model ID can also be typed in.
* **Chat with documents**: attach PDF, DOCX, TXT, MD, CSV or JSON files. Answers cite the file and page, e.g. `\[report.pdf, p. 4]`.
* **Email replies**:

  * *Paste email*: paste any email and get a draft reply (no setup).
  * *Gmail inbox*: read-only Gmail sign-in to pick an email and draft a reply.
  * Choose a tone (Brief, Friendly, Formal), then copy the draft or open it in Gmail compose. Fusion never sends email itself.
* **Web search**: Google Search via your free Gemini key, with Tavily's free tier as an automatic backup. Answers include source links.
* **Remembers your chats**: conversations and attached documents are saved in your browser (IndexedDB) and restored on reload.
* **Streaming replies** with Stop, Regenerate and Copy, Markdown and code blocks, light and dark mode, and a mobile layout.

\---

## How your keys are handled

|What|Where it lives|
|-|-|
|API keys|Your browser only. By default they're cleared when you close the tab; tick **Remember keys on this device** to keep them.|
|Chats and documents|Your browser's IndexedDB. **Settings → Clear all data** deletes everything.|
|Gmail access|A short-lived, read-only token held in memory. **Disconnect** revokes it.|
|Requests|Sent directly from your browser to the provider you selected. There is no Fusion server in between.|

You pay each provider directly for what you use. Set a monthly spending limit on every paid key.

\---

## Getting your keys

You need **at least one** model key. Everything else is optional.

|Key|Needed for|Cost|Where to get it|
|-|-|-|-|
|Google Gemini|Gemini models, web search|Free tier available|[aistudio.google.com/apikey](https://aistudio.google.com/apikey)|
|OpenAI|GPT models|Paid (prepaid credit required)|[platform.openai.com/api-keys](https://platform.openai.com/api-keys)|
|Anthropic|Claude models|Paid|[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)|
|xAI|Grok models|Paid|[console.x.ai](https://console.x.ai)|
|Tavily|Backup web search|Free tier, no card|[app.tavily.com](https://app.tavily.com)|
|Google OAuth Client ID|Gmail inbox (optional)|Free|See [Gmail setup](#gmail-setup-optional)|

Add keys in **Settings** and press **Test** on each one. A green "Connected" status means it works.

> \*\*Privacy note:\*\* prompts sent with a free-tier Gemini key may be used by Google to improve its products. Pick a different model if that matters for a given email or document.

\---

## Run locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/<your-username>/fusion.git
cd fusion
npm install
npm run dev
```

Open http://localhost:5173, then add your keys in Settings.

To build the production version:

```bash
npm run build     # outputs to dist/
npm run preview   # serves dist/ locally
```

\---

## Deploy on Render (free)

Fusion is a static site, so it needs no server or environment variables.

1. In [Render](https://render.com), choose **New → Static Site** and connect this repository.
2. **Build command:** `npm install \&\& npm run build`
3. **Publish directory:** `dist`
4. Click **Create Static Site**. Every push to the main branch redeploys automatically.

Any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) works with the same build settings.

\---

## Gmail setup (optional)

Paste mode works without any of this. To read your inbox directly (about 5 minutes):

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. **APIs \& Services → Library**, search for **Gmail API** and click **Enable**.
3. **Google Auth Platform → Get started**: set an app name and your email, choose **External**, and create.
4. **Audience → Test users**: add the Gmail address(es) that will use Fusion (up to 100).
5. **Clients → Create client → Web application**. Under **Authorized JavaScript origins** add your site's URL (e.g. `https://fusion-xxxx.onrender.com`) and `http://localhost:5173`. Copy the **Client ID**.
6. In Fusion, paste the Client ID into **Settings → Gmail** and click **Connect Gmail**. When Google shows "Google hasn't verified this app", click **Continue**.

Notes:

* Fusion requests read-only access (`gmail.readonly`) and cannot send, delete or change email.
* While the Google app is in Testing mode, only listed test users can connect, and sign-in expires after 7 days. Opening it to the public requires Google's verification and security review.
* Gmail sign-in won't work from an address that isn't listed in Authorized JavaScript origins (including the Google AI Studio preview).

\---

## Tech stack

* [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org) + [Vite](https://vite.dev)
* [Tailwind CSS](https://tailwindcss.com)
* [idb-keyval](https://github.com/jakearchibald/idb-keyval) for browser storage
* [pdf.js](https://mozilla.github.io/pdf.js/) and [mammoth](https://github.com/mwilliamson/mammoth.js) for reading documents
* [react-markdown](https://github.com/remarkjs/react-markdown) for safe Markdown rendering
* Provider APIs called directly with `fetch` (no SDKs)

Built with [Google AI Studio](https://aistudio.google.com) Build mode, designed in [Stitch](https://stitch.withgoogle.com).

\---

## Project structure

```
src/
  providers/     OpenAI, Anthropic, Gemini and xAI adapters (model lists + streaming)
  lib/           streaming parser, error messages, documents, web search, Gmail, prompt building
  store/         key storage and chat storage
  components/    sidebar, chat, composer, model picker, settings, email panel
```

\---

## Troubleshooting

|Problem|Fix|
|-|-|
|"Your … key was rejected"|Re-copy the key into Settings and press **Test**. Check that billing is enabled for paid providers.|
|"Rate limit or quota reached"|Wait a minute, or check your usage and billing on the provider's site.|
|"This model isn't available for your key"|Pick another model; some models need a higher account tier.|
|"Couldn't reach …"|Check your connection and disable ad blockers for the site.|
|Web search stops working|The Gemini free search quota may be used up for the day. Add a free Tavily key in Settings as a backup.|
|PDF shows "No readable text found"|The file is a scanned image. Run it through OCR first or paste the text.|
|Gmail: "address isn't on your Authorized JavaScript origins"|Add the exact site URL (no trailing slash) to your Google OAuth client.|
|Gmail: "access denied"|Make sure the Gmail API is enabled and your address is a test user.|
|Chats disappeared|Chats live in the browser you used. Private windows and clearing site data remove them. Use **Export all chats** to back up.|

\---

## Limitations

* No accounts or sync: chats stay in the browser where they were created.
* Large documents are searched by keyword, so only the most relevant parts are sent to the model.
* Gmail is read-only and limited to 100 test users unless the Google app is verified.
* Fusion drafts emails but never sends them.

\---

## License

MIT. See [LICENSE](LICENSE).

