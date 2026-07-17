import { API_URL } from '../lib/api';

export function GoogleButton() {
  return (
    <a className="google-btn" href={`${API_URL}/auth/google`}>
      Entrar com Google
    </a>
  );
}
