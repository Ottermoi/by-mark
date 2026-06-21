/* ============================================================================
 * supabase-init.js  —  Splat Atlas ↔ Supabase
 *
 * WHAT THIS DOES (no changes to the app's own code required for Stage 1):
 *   • Backs the app's existing window.storage hook with a shared Supabase table,
 *     so every visitor sees whatever the owner last saved. This already covers
 *     viewpoints, links, YouTube/Vimeo embeds, and images saved inline.
 *   • Replaces the cosmetic login with real Supabase email/password auth, and
 *     ties it to the app's editor mode so only signed-in users can edit/save.
 *   • Provides window.uploadToSupabase(file) for Stage 2 (real file uploads).
 *
 * HOW TO INSTALL:
 *   In your index.html <head>, BEFORE the app's main <script>, add:
 *
 *     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *     <script src="supabase-init.js"></script>
 *
 *   Put this file in the same folder as index.html in your repo.
 * ========================================================================== */

// 1) CONFIG -------------------------------------------------------------------
const SUPABASE_URL  = "https://ymnchpozabuoeqbhabmx.supabase.co";
// Get this from Supabase dashboard → Project Settings → API → "anon public" key.
// This key is meant to be public; your data is protected by the RLS rules in
// supabase-setup.sql. Do NOT paste your "service_role" / secret key here.
const SUPABASE_ANON = "sb_publishable_0KjKN1dVkV2dcjrqVcyHSQ_3T2UzO6P";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window.sb = sb;

// 2) SHARED PERSISTENCE -------------------------------------------------------
// The app uses window.storage.get(key) / set(key, value) when present, and
// localStorage otherwise. By defining window.storage here, the whole project
// is read from / written to the shared `scenes` table instead of the browser.
window.storage = {
  async get(key) {
    const { data, error } = await sb
      .from("scenes").select("data").eq("name", key).maybeSingle();
    if (error || !data) return null;
    return { value: data.data };               // app reads r.value (a JSON string)
  },
  async set(key, value) {
    const { error } = await sb
      .from("scenes")
      .upsert({ name: key, data: value, updated_at: new Date().toISOString() },
              { onConflict: "name" });
    if (error) { console.error("save failed:", error.message); return null; }
    return { value };
  },
};

// 3) SIGN-IN REQUIRED TO EDIT -------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  // Restore a prior session → enter editor mode automatically.
  const { data: { session } } = await sb.auth.getSession();
  if (session && typeof window.enterEditor === "function") window.enterEditor();

  // Replace the cosmetic login with real Supabase email/password auth.
  // NOTE: type your EMAIL in the login form's first field (it's labelled
  // "username" in the UI). You can change that placeholder in index.html.
  window.tryLogin = async function () {
    const email = (document.getElementById("loginUser")?.value || "").trim();
    const pass  =  document.getElementById("loginPass")?.value || "";
    const err   =  document.getElementById("loginErr");
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      if (err) { err.textContent = "Incorrect email or password."; err.classList.add("show"); }
      document.getElementById("loginPass")?.select();
      return;
    }
    if (typeof window.closeLogin === "function") window.closeLogin();
    if (typeof window.enterEditor === "function") window.enterEditor();
  };

  // Make sign-out also end the Supabase session.
  if (typeof window.exitEditor === "function") {
    const _origExit = window.exitEditor;
    window.exitEditor = async function () {
      try { await sb.auth.signOut(); } catch (e) {}
      _origExit();
    };
  }
});

// 4) FILE UPLOAD HELPER (for Stage 2) ----------------------------------------
// Uploads a File to the public `media` bucket and returns its public URL.
window.uploadToSupabase = async function (file) {
  const ext  = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from("media").upload(path, file, { upsert: false });
  if (error) { console.error("upload failed:", error.message); return null; }
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
};
