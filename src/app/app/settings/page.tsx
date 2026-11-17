"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { MOBILE } from "@/lib/client/href";
import { cx, ErrorBox, Loading, Notice, PageHeader, Section, Spinner, useToast } from "@/components/ui";

export default function Settings() {
  const router = useRouter();
  const { toast, node } = useToast();
  const [me, setMe] = useState<any>(null);
  const [s, setS] = useState<any>(null);
  const [presets, setPresets] = useState<any[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string; models?: string[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState("");

  useEffect(() => {
    api("/api/auth/me").then((r) => setMe(r.user)).catch((e) => setErr(e.message));
    api("/api/settings/ai").then((r) => { setS(r.settings); setPresets(r.presets); }).catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="p-8"><ErrorBox error={err} /></div>;
  if (!s || !me) return <Loading />;

  const preset = presets.find((p) => p.provider === s.provider && (p.baseUrl === s.baseUrl || (p.provider !== "openai_compat" && p.provider === s.provider))) ?? null;
  const applyPreset = (p: any) => { setS({ ...s, provider: p.provider, baseUrl: p.baseUrl, model: p.model, contextWords: p.contextWords || s.contextWords, requestsPerMinute: p.rpm }); setTest(null); };
  const payload = () => ({ ...s, apiKey: apiKey || undefined });

  async function save() {
    setBusy("save");
    try { await api("/api/settings/ai", { method: "PUT", body: payload() }); setApiKey(""); toast("AI settings saved."); const r = await api("/api/settings/ai"); setS(r.settings); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy("");
  }
  async function runTest() {
    setBusy("test"); setTest(null);
    try { setTest(await api("/api/settings/ai/test", { body: payload() })); } catch (e: any) { setTest({ ok: false, message: e.message }); }
    setBusy("");
  }

  return (
    <div className="mx-auto max-w-5xl p-5 sm:p-8">
      {node}
      <PageHeader eyebrow="Settings" title="Account Settings" />
      <Section title="AI Provider" className="mb-6">
        {MOBILE && <Notice tone="gold" className="mb-4"><strong>On your phone, the easiest free option is Google Gemini (free tier):</strong> open aistudio.google.com on your phone, sign in with a Google account, tap “Get API key”, copy it, then choose “Google Gemini (free tier)” below and paste the key. Groq and OpenRouter work the same way. To use <strong>Ollama</strong>, run it on a computer on the same Wi-Fi (start it with <code>OLLAMA_HOST=0.0.0.0</code>) and enter <code>http://&lt;computer-IP&gt;:11434</code> as the URL — “localhost” would mean the phone itself.</Notice>}
        <p className="mb-4 text-sm text-navy-600">Cashless Edit never requires a paid subscription. Choose a free option below. API keys are encrypted at rest and never shown again after saving.</p>
        <div className="mb-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <button key={p.id} type="button" onClick={() => applyPreset(p)} className={cx("rounded-lg border p-4 text-left transition", preset?.id === p.id ? "border-gold-400 bg-gold-50/60 ring-2 ring-gold-200" : "border-navy-100 hover:border-navy-300")}>
              <div className="font-medium text-navy-950">{p.name}</div>
              <div className="mt-0.5 text-xs font-medium text-gold-700">{p.free}</div>
              <div className="mt-2 text-xs leading-relaxed text-navy-500">{p.notes}</div>
            </button>
          ))}
        </div>
        {s.provider !== "builtin" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Provider type</label>
              <select className="input" value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value })}><option value="ollama">Ollama (native API)</option><option value="openai_compat">OpenAI-compatible</option></select></div>
            <div><label className="label">Base URL</label><input className="input" value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} /></div>
            <div><label className="label">Model</label><input className="input" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} list="models" />
              <datalist id="models">{test?.models?.map((m) => <option key={m} value={m} />)}</datalist></div>
            <div><label className="label">API key {s.hasKey && <span className="normal-case text-emerald-600">(saved)</span>}</label><input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={s.hasKey ? "•••••••• (leave blank to keep)" : "Not needed for local models"} autoComplete="off" /></div>
            <div><label className="label">Words per AI request</label><input className="input" type="number" min={600} max={20000} value={s.contextWords} onChange={(e) => setS({ ...s, contextWords: +e.target.value })} />
              <p className="mt-1 text-xs text-navy-400">Long chapters are split into sections of this size. ~2,000 suits 8k-context local models; raise it for larger-context models.</p></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Parallel</label><input className="input" type="number" min={1} max={4} value={s.concurrency} onChange={(e) => setS({ ...s, concurrency: +e.target.value })} /></div>
              <div><label className="label">Req/min</label><input className="input" type="number" min={0} value={s.requestsPerMinute} onChange={(e) => setS({ ...s, requestsPerMinute: +e.target.value })} title="0 = unlimited. Set this to stay inside free-tier rate limits." /></div>
              <div><label className="label">Temp.</label><input className="input" type="number" step={0.1} min={0} max={1.5} value={s.temperature} onChange={(e) => setS({ ...s, temperature: +e.target.value })} /></div>
            </div>
          </div>
        )}
        {test && <Notice tone={test.ok ? "success" : "warn"} className="mt-4">{test.message}</Notice>}
        <div className="mt-5 flex flex-wrap gap-2">
          {s.provider !== "builtin" && <button className="btn-outline" onClick={runTest} disabled={!!busy}>{busy === "test" && <Spinner />} Test connection</button>}
          <button className="btn-primary" onClick={save} disabled={!!busy}>{busy === "save" && <Spinner />} Save AI settings</button>
        </div>
        <details className="mt-6 rounded-lg border border-navy-100 bg-navy-50/50 p-4 text-sm text-navy-700">
          <summary className="cursor-pointer font-medium text-navy-900">How to set up free, unlimited AI with Ollama (recommended)</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>Download Ollama from <a className="underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a> (macOS, Windows, Linux) and install it.</li>
            <li>Open a terminal and run <code className="rounded bg-white px-1">ollama pull qwen2.5:7b-instruct</code> (≈4.7 GB; needs ~8 GB RAM). With 16 GB+ RAM, <code className="rounded bg-white px-1">qwen2.5:14b-instruct</code> or <code className="rounded bg-white px-1">gemma2:9b</code> give noticeably better editing.</li>
            <li>Pick “Ollama (local)” above, keep the URL <code className="rounded bg-white px-1">http://localhost:11434</code>, click <em>Test connection</em>, then <em>Save</em>.</li>
            <li>If Cashless Edit runs in Docker, use <code className="rounded bg-white px-1">http://host.docker.internal:11434</code> or the bundled <code className="rounded bg-white px-1">ollama</code> service (<code className="rounded bg-white px-1">http://ollama:11434</code>).</li>
          </ol>
          <p className="mt-3 text-xs text-navy-500">Local models run at the speed of your computer: a 100,000-word Full Editorial Review can take a few hours on a laptop. It runs in the background and resumes if interrupted. Free cloud tiers are faster but rate-limited, and their terms may allow the provider to use your text — prefer a local model for confidential work.</p>
        </details>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Profile">
          <label className="label">Name</label>
          <input className="input" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} />
          <div className="mt-2 text-sm text-navy-500">{me.email}</div>
          <button className="btn-outline mt-3" onClick={async () => { try { await api("/api/account", { method: "PATCH", body: { name: me.name } }); toast("Profile saved."); router.refresh(); } catch (e: any) { toast(e.message, "err"); } }}>Save</button>
        </Section>
        {!MOBILE && <Section title="Password">
          <label className="label">Current password</label><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          <label className="label mt-3">New password</label><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          <button className="btn-outline mt-3" onClick={async () => { try { await api("/api/account", { method: "PATCH", body: { currentPassword: pw.current, newPassword: pw.next } }); router.replace("/login"); } catch (e: any) { toast(e.message, "err"); } }}>Change password</button>
        </Section>}
      </div>
      <Section title="Privacy & data" className="mt-6">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-navy-600">
          <li>Manuscripts are visible only to your account. Uploaded files, exports and API keys are encrypted at rest (AES-256-GCM).</li>
          <li>With a local model (Ollama / LM Studio) your text never leaves your machine. With a cloud provider, text is sent to that provider for analysis.</li>
          <li>Your original upload is never modified; all edits are versioned.</li>
        </ul>
        {MOBILE ? (
          <div><p className="mb-2 text-sm text-navy-600">Everything is stored privately on this phone. Uninstalling the app also removes it.</p>
            <button className="btn-danger" onClick={async () => { if (!confirm("Erase ALL manuscripts, reports, Story Bibles and exports from this phone? This cannot be undone.")) return; await api("/api/account", { method: "DELETE", body: {} }); }}>Erase all data on this phone</button></div>
        ) : <>
        <label className="label">Delete account — type your password to confirm</label>
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-xs" type="password" value={del} onChange={(e) => setDel(e.target.value)} />
          <button className="btn-danger" disabled={!del} onClick={async () => { if (!confirm("Permanently delete your account and ALL manuscripts, reports and exports? This cannot be undone.")) return; try { await api("/api/account", { method: "DELETE", body: { password: del } }); router.replace("/"); } catch (e: any) { toast(e.message, "err"); } }}>Delete account and all data</button>
        </div></>}
      </Section>
    </div>
  );
}
