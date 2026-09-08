'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RESTAURANT_NAME } from '../../lib/restaurant';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (response.ok) router.push('/cuisine');
    else setError('Identifiants invalides.');
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <img className="auth-logo" src="/coco-garden-logo.svg" alt={RESTAURANT_NAME} />
        <p className="eyebrow">{RESTAURANT_NAME} · CUISINE</p>
        <h1>Connexion équipe</h1>
        <p className="muted">Accédez au tableau de préparation des commandes.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Identifiant<input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" required /></label>
          <label>Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  );
}
