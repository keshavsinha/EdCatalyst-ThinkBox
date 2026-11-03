# EdCatalyst ThinkBox

**Think first. Then check.** A study companion that gives hints before answers.

▶️ **Video walkthrough:** [Watch on YouTube](https://youtu.be/un0SgCCNLqc)

[![ThinkBox video walkthrough](https://img.youtube.com/vi/un0SgCCNLqc/hqdefault.jpg)](https://youtu.be/un0SgCCNLqc)

A Chrome extension that helps students **practise and revise**. Select a question on any page, or drag a box around it, and get a hint first, then the answer with an explanation of the concept and why the other options are wrong.

> **For practice and revision only.** Do not use this extension during graded exams or assessments. That breaks the academic-integrity rules of your institution and of course providers.

## Features

- **Explain Selected Text**: highlight a question and its options.
- **Select Area → Explain**: drag a box around a question on screen (most accurate).
- **Screenshot → Explain**: reads the whole visible screen and filters out sidebars and menus.
- **Built-in OCR** (Tesseract, runs locally): screenshots work even with text-only models.
- **Study modes**: Practice (hint first, then answer), MCQ with full explanation, Teach the concept (no answer), Step-by-step, Coding, Summarise.
- **Four AI providers**: Claude, OpenAI, Gemini and Groq. Use your own API key; Groq and Gemini have free tiers.
- **Accuracy first**: picks the most accurate model your key can use (Groq: GPT-OSS 120B), checks every option against the question before answering, and follows the course material's terminology.
- **Live model list**: recovers by itself if a model is retired.
- **Shortcuts**: `Alt+Shift+A` text, `Alt+Shift+X` area, `Alt+Shift+S` screenshot.

## Accuracy and honesty

AI can be wrong, and a study tool that confidently teaches a wrong answer harms learning. So this extension:

- **Double-checks every MCQ answer** (on by default). A second, independent check solves the question again.
  - ✔ **Double-checked**: both checks agree.
  - ⚠ **NOT CERTAIN**: they disagree. The student is told not to memorise the answer and to verify it in the course material. The warning shows *before* the answer is revealed.
- Tests every option against the question before answering, and follows the course's own terminology.
- Offers **Teach the concept** mode, which explains the idea without giving the answer.

Always treat the course material as the final authority.

## Install

1. Download this repository as a ZIP (**Code → Download ZIP**) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Click the extension icon, choose a provider, paste your API key and click **Activate & Save**.

Get a key: [Groq](https://console.groq.com/keys) (free) · [Gemini](https://aistudio.google.com/app/apikey) (free tier) · [OpenAI](https://platform.openai.com/api-keys) · [Claude](https://console.anthropic.com/settings/keys)

## Privacy

- Your API key is stored only in your browser (`chrome.storage.local`) and is sent only to the provider you choose.
- No server, no analytics. OCR runs on your computer.
- The selected text or screenshot is sent to your chosen AI provider when you ask for help.
- Never commit or share your API key.

## Project structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | API calls, screenshot capture and crop, OCR routing |
| `content.js` | On-page **EC ThinkBox** button, menu, area selector, answer panel |
| `popup.html/.css/.js` | Settings: provider, model, key, study mode |
| `providers.js` | Provider list, default models, study-mode prompts |
| `offscreen.html/.js` | Local OCR worker |
| `ocr/` | Tesseract.js engine and English data (Apache-2.0) |

## Publishing / contributing

See [`GITHUB_SETUP.md`](GITHUB_SETUP.md) for step-by-step instructions to publish this repo on GitHub, create releases and push updates.

## License

MIT © Dr. Keshav Sinha, EdCatalyst ([edcatalyst.in](https://edcatalyst.in)). Bundled Tesseract.js is Apache-2.0; see `NOTICE`.
