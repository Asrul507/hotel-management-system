export default function ConfigError({ message }) {
  return (
    <div className="config-error-page">
      <section className="card config-error-card">
        <p className="badge">Konfigurasi diperlukan</p>
        <h1>Supabase belum dikonfigurasi</h1>
        <p className="alert error">
          {message || 'Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY sebelum menjalankan aplikasi.'}
        </p>

        <h2>ENV wajib</h2>
        <ul>
          <li><code>VITE_SUPABASE_URL</code></li>
          <li><code>VITE_SUPABASE_ANON_KEY</code></li>
        </ul>

        <h2>Cara perbaikan di Netlify</h2>
        <ol>
          <li>Buka Netlify Dashboard lalu pilih site aplikasi.</li>
          <li>Masuk ke <strong>Site settings / Site configuration</strong> &gt; <strong>Environment variables</strong> &gt; <strong>Add variable</strong>.</li>
          <li>Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Buka <strong>Deploys</strong> &gt; <strong>Trigger deploy</strong> &gt; <strong>Clear cache and deploy site</strong>.</li>
        </ol>

        <p className="muted">
          Project ini memakai Vite. Environment variable frontend dibaca saat build, jadi setelah menambah atau mengubah ENV di Netlify wajib redeploy ulang.
        </p>
      </section>
    </div>
  );
}
